use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use pyth_sdk_solana::load_price_feed_from_account_info;

declare_id!("CustodyStaking11111111111111111111111111111");

// ───────────────────────────── Constants ─────────────────────────────

pub const MAX_TIERS: usize = 5;
pub const WEIGHT_PRECISION: u64 = 10_000;
pub const MAX_ANNUAL_RATE_BPS: u64 = 100_000;    // 1000% 硬上限，支持 200% 档
pub const PRICE_PRECISION: u64 = 1_000_000_000;   // 9dp
pub const MAX_PRICE_STALENESS: i64 = 60;          // 价格发布超过 60 秒则拒绝
pub const SINGLE_PRIMARY_WEIGHT_BPS: u64 = 10_000;

// ───────────────────────────── Program ─────────────────────────────

#[program]
pub mod custody_staking {
    use super::*;

    /// 初始化：利率表 + 双币仓 60/40 权重 + 比例容差。只调用一次。
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        tiers: Vec<RateTier>,
        primary_weight_bps: u64,
        secondary_weight_bps: u64,
        weight_tolerance_bps: u64,
    ) -> Result<()> {
        require!(
            !tiers.is_empty() && tiers.len() <= MAX_TIERS,
            CustodyError::InvalidTiers
        );
        require!(
            primary_weight_bps
                .checked_add(secondary_weight_bps)
                == Some(WEIGHT_PRECISION),
            CustodyError::InvalidWeights
        );
        require!(
            primary_weight_bps > 0 && secondary_weight_bps > 0,
            CustodyError::InvalidWeights
        );
        require!(
            weight_tolerance_bps <= 2_000, // 容差不超过 ±20%
            CustodyError::InvalidWeights
        );

        let mut prev_duration: i64 = 0;
        for i in 0..tiers.len() {
            let t = tiers[i];
            require!(t.duration_secs > prev_duration, CustodyError::InvalidTiers);
            require!(
                t.single_rate_bps <= MAX_ANNUAL_RATE_BPS
                    && t.dual_rate_bps <= MAX_ANNUAL_RATE_BPS,
                CustodyError::RateTooHigh
            );
            prev_duration = t.duration_secs;
        }

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.position_nonce = 0;
        config.num_tiers = tiers.len() as u8;
        config.primary_weight_bps = primary_weight_bps;
        config.secondary_weight_bps = secondary_weight_bps;
        config.weight_tolerance_bps = weight_tolerance_bps;
        config.bump = ctx.bumps.config;

        for i in 0..MAX_TIERS {
            config.tiers[i] = if i < tiers.len() {
                tiers[i]
            } else {
                RateTier::default()
            };
        }

        emit!(ConfigInitialized {
            num_tiers: config.num_tiers,
            primary_weight_bps,
            secondary_weight_bps,
            weight_tolerance_bps,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// 更新某档位的单币/双币利率。duration 不可改，只影响新仓。
    pub fn update_tier_rates(
        ctx: Context<UpdateConfig>,
        tier_index: u8,
        single_rate_bps: u64,
        dual_rate_bps: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(
            (tier_index as usize) < config.num_tiers as usize,
            CustodyError::InvalidTierIndex
        );
        require!(
            single_rate_bps <= MAX_ANNUAL_RATE_BPS
                && dual_rate_bps <= MAX_ANNUAL_RATE_BPS,
            CustodyError::RateTooHigh
        );

        let tier = &mut config.tiers[tier_index as usize];
        let old_single = tier.single_rate_bps;
        let old_dual = tier.dual_rate_bps;
        tier.single_rate_bps = single_rate_bps;
        tier.dual_rate_bps = dual_rate_bps;

        emit!(TierRatesUpdated {
            tier_index,
            old_single_rate_bps: old_single,
            old_dual_rate_bps: old_dual,
            new_single_rate_bps: single_rate_bps,
            new_dual_rate_bps: dual_rate_bps,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// 更新双币仓 60/40 权重和容差。只影响新仓。
    pub fn update_weights(
        ctx: Context<UpdateConfig>,
        primary_weight_bps: u64,
        secondary_weight_bps: u64,
        weight_tolerance_bps: u64,
    ) -> Result<()> {
        require!(
            primary_weight_bps
                .checked_add(secondary_weight_bps)
                == Some(WEIGHT_PRECISION),
            CustodyError::InvalidWeights
        );
        require!(
            primary_weight_bps > 0 && secondary_weight_bps > 0,
            CustodyError::InvalidWeights
        );
        require!(
            weight_tolerance_bps <= 2_000,
            CustodyError::InvalidWeights
        );

        let config = &mut ctx.accounts.config;
        let old_p = config.primary_weight_bps;
        let old_s = config.secondary_weight_bps;
        let old_t = config.weight_tolerance_bps;
        config.primary_weight_bps = primary_weight_bps;
        config.secondary_weight_bps = secondary_weight_bps;
        config.weight_tolerance_bps = weight_tolerance_bps;

        emit!(WeightsUpdated {
            old_primary_bps: old_p,
            old_secondary_bps: old_s,
            old_tolerance_bps: old_t,
            new_primary_bps: primary_weight_bps,
            new_secondary_bps: secondary_weight_bps,
            new_tolerance_bps: weight_tolerance_bps,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// 单币仓建仓。读一个 Pyth 价格，快照 usd_base、rate、tier。
    pub fn create_single_position(
        ctx: Context<CreateSinglePosition>,
        tier_index: u8,
        primary_amount: u64,
    ) -> Result<()> {
        require!(primary_amount > 0, CustodyError::InvalidAmount);

        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;
        require!(
            (tier_index as usize) < config.num_tiers as usize,
            CustodyError::InvalidTierIndex
        );

        let tier = config.tiers[tier_index as usize];
        let unlock_at = clock
            .unix_timestamp
            .checked_add(tier.duration_secs)
            .ok_or(CustodyError::MathOverflow)?;

        // 读取并校验 Pyth 主币价格
        let primary_price_9dp = read_and_normalize_price(
            &ctx.accounts.primary_price_feed.to_account_info(),
            &clock,
        )?;

        let primary_decimals = ctx.accounts.primary_mint.decimals;
        let primary_usd_9dp =
            compute_usd_value_9dp(primary_amount, primary_decimals, primary_price_9dp)?;
        require!(primary_usd_9dp > 0, CustodyError::UsdValueTooSmall);

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.position_id = config.position_nonce;
        position.kind = PositionKind::Single;
        position.tier_index = tier_index;
        position.duration_secs = tier.duration_secs;
        position.unlock_at = unlock_at;
        position.created_at = clock.unix_timestamp;
        position.is_released = false;

        position.primary_mint = ctx.accounts.primary_mint.key();
        position.primary_amount = primary_amount;
        position.secondary_mint = Pubkey::default();
        position.secondary_amount = 0;

        position.primary_price_9dp = primary_price_9dp;
        position.secondary_price_9dp = 0;
        position.usd_base_9dp = primary_usd_9dp;

        position.rate_bps = tier.single_rate_bps;
        position.primary_weight_bps = SINGLE_PRIMARY_WEIGHT_BPS;
        position.secondary_weight_bps = 0;

        position.bump = ctx.bumps.position;
        config.position_nonce = config
            .position_nonce
            .checked_add(1)
            .ok_or(CustodyError::MathOverflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.primary_user_ata.to_account_info(),
                    to: ctx.accounts.primary_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            primary_amount,
        )?;

        emit!(PositionCreated {
            position: position.key(),
            owner: position.owner,
            kind: PositionKind::Single,
            tier_index,
            duration_secs: tier.duration_secs,
            unlock_at,
            primary_mint: position.primary_mint,
            primary_amount,
            secondary_mint: Pubkey::default(),
            secondary_amount: 0,
            primary_price_9dp,
            secondary_price_9dp: 0,
            usd_base_9dp: position.usd_base_9dp,
            rate_bps: tier.single_rate_bps,
            primary_weight_bps: SINGLE_PRIMARY_WEIGHT_BPS,
            secondary_weight_bps: 0,
        });
        Ok(())
    }

    /// 双币仓建仓。读两个 Pyth 价格，计算 USD 价值并按 60/40 容差校验。
    pub fn create_dual_position(
        ctx: Context<CreateDualPosition>,
        tier_index: u8,
        primary_amount: u64,
        secondary_amount: u64,
    ) -> Result<()> {
        require!(
            primary_amount > 0 && secondary_amount > 0,
            CustodyError::InvalidAmount
        );
        require!(
            ctx.accounts.primary_mint.key() != ctx.accounts.secondary_mint.key(),
            CustodyError::SameMint
        );

        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;
        require!(
            (tier_index as usize) < config.num_tiers as usize,
            CustodyError::InvalidTierIndex
        );

        let tier = config.tiers[tier_index as usize];
        let unlock_at = clock
            .unix_timestamp
            .checked_add(tier.duration_secs)
            .ok_or(CustodyError::MathOverflow)?;

        let primary_price_9dp = read_and_normalize_price(
            &ctx.accounts.primary_price_feed.to_account_info(),
            &clock,
        )?;
        let secondary_price_9dp = read_and_normalize_price(
            &ctx.accounts.secondary_price_feed.to_account_info(),
            &clock,
        )?;

        let primary_usd_9dp = compute_usd_value_9dp(
            primary_amount,
            ctx.accounts.primary_mint.decimals,
            primary_price_9dp,
        )?;
        let secondary_usd_9dp = compute_usd_value_9dp(
            secondary_amount,
            ctx.accounts.secondary_mint.decimals,
            secondary_price_9dp,
        )?;
        let total_usd_9dp = primary_usd_9dp
            .checked_add(secondary_usd_9dp)
            .ok_or(CustodyError::MathOverflow)?;
        require!(total_usd_9dp > 0, CustodyError::UsdValueTooSmall);

        // 60/40 比例校验（± tolerance）
        let primary_ratio_bps = (primary_usd_9dp as u128)
            .checked_mul(WEIGHT_PRECISION as u128)
            .ok_or(CustodyError::MathOverflow)?
            .checked_div(total_usd_9dp as u128)
            .ok_or(CustodyError::MathOverflow)? as u64;

        let target = config.primary_weight_bps;
        let tolerance = config.weight_tolerance_bps;
        let lower = target.saturating_sub(tolerance);
        let upper = target.saturating_add(tolerance);
        require!(
            primary_ratio_bps >= lower && primary_ratio_bps <= upper,
            CustodyError::WeightRatioOutOfRange
        );

        let pw = config.primary_weight_bps;
        let sw = config.secondary_weight_bps;

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.position_id = config.position_nonce;
        position.kind = PositionKind::Dual;
        position.tier_index = tier_index;
        position.duration_secs = tier.duration_secs;
        position.unlock_at = unlock_at;
        position.created_at = clock.unix_timestamp;
        position.is_released = false;

        position.primary_mint = ctx.accounts.primary_mint.key();
        position.primary_amount = primary_amount;
        position.secondary_mint = ctx.accounts.secondary_mint.key();
        position.secondary_amount = secondary_amount;

        position.primary_price_9dp = primary_price_9dp;
        position.secondary_price_9dp = secondary_price_9dp;
        position.usd_base_9dp = total_usd_9dp;

        position.rate_bps = tier.dual_rate_bps;
        position.primary_weight_bps = pw;
        position.secondary_weight_bps = sw;

        position.bump = ctx.bumps.position;
        config.position_nonce = config
            .position_nonce
            .checked_add(1)
            .ok_or(CustodyError::MathOverflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.primary_user_ata.to_account_info(),
                    to: ctx.accounts.primary_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            primary_amount,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.secondary_user_ata.to_account_info(),
                    to: ctx.accounts.secondary_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            secondary_amount,
        )?;

        emit!(PositionCreated {
            position: position.key(),
            owner: position.owner,
            kind: PositionKind::Dual,
            tier_index,
            duration_secs: tier.duration_secs,
            unlock_at,
            primary_mint: position.primary_mint,
            primary_amount,
            secondary_mint: position.secondary_mint,
            secondary_amount,
            primary_price_9dp,
            secondary_price_9dp,
            usd_base_9dp: total_usd_9dp,
            rate_bps: tier.dual_rate_bps,
            primary_weight_bps: pw,
            secondary_weight_bps: sw,
        });
        Ok(())
    }

    /// 到期释放本金。Single 禁止传副币账户，Dual 强制传且逐字段校验。
    pub fn release_position(ctx: Context<ReleasePosition>) -> Result<()> {
        let clock = Clock::get()?;
        let position = &mut ctx.accounts.position;

        require!(!position.is_released, CustodyError::AlreadyReleased);
        require!(
            clock.unix_timestamp >= position.unlock_at,
            CustodyError::NotYetUnlocked
        );

        let owner_key = position.owner;
        let position_id = position.position_id;
        let position_bump = position.bump;
        let position_key = position.key();
        let id_bytes = position_id.to_le_bytes();

        let seeds: &[&[u8]] = &[
            b"position".as_ref(),
            owner_key.as_ref(),
            id_bytes.as_ref(),
            &[position_bump],
        ];
        let signer: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.primary_vault.to_account_info(),
                    to: ctx.accounts.primary_user_ata.to_account_info(),
                    authority: ctx.accounts.position.to_account_info(),
                },
                signer,
            ),
            position.primary_amount,
        )?;

        match position.kind {
            PositionKind::Single => {
                require!(
                    ctx.accounts.secondary_vault.is_none()
                        && ctx.accounts.secondary_user_ata.is_none(),
                    CustodyError::UnexpectedSecondaryAccounts
                );
            }
            PositionKind::Dual => {
                let sv = ctx
                    .accounts
                    .secondary_vault
                    .as_ref()
                    .ok_or(CustodyError::MissingSecondaryAccounts)?;
                let sa = ctx
                    .accounts
                    .secondary_user_ata
                    .as_ref()
                    .ok_or(CustodyError::MissingSecondaryAccounts)?;

                require!(sv.mint == position.secondary_mint, CustodyError::MintMismatch);
                require!(sv.owner == position_key, CustodyError::InvalidVaultOwner);
                require!(sa.mint == position.secondary_mint, CustodyError::MintMismatch);
                require!(sa.owner == owner_key, CustodyError::InvalidAtaOwner);

                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: sv.to_account_info(),
                            to: sa.to_account_info(),
                            authority: ctx.accounts.position.to_account_info(),
                        },
                        signer,
                    ),
                    position.secondary_amount,
                )?;
            }
        }

        position.is_released = true;

        emit!(Released {
            position: position_key,
            kind: position.kind,
            tier_index: position.tier_index,
            primary_amount: position.primary_amount,
            secondary_amount: position.secondary_amount,
        });
        Ok(())
    }

    /// 关闭已释放的 Position，回收租金。
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        emit!(PositionClosed {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.position.owner,
        });
        Ok(())
    }
}

// ───────────────────────────── Helpers ─────────────────────────────

/// 读取 Pyth 价格，校验新鲜度，归一化到 9dp。
fn read_and_normalize_price(
    price_feed_info: &AccountInfo,
    clock: &Clock,
) -> Result<u64> {
    let feed = load_price_feed_from_account_info(price_feed_info)
        .map_err(|_| error!(CustodyError::InvalidPriceFeed))?;
    let price = feed
        .get_current_price()
        .ok_or(CustodyError::InvalidPriceFeed)?;

    require!(price.price > 0, CustodyError::InvalidPrice);
    // 价格不能来自未来（允许 60 秒时钟偏差）
    require!(
        price.publish_time <= clock.unix_timestamp.saturating_add(60),
        CustodyError::InvalidPrice
    );
    // 价格不能太旧
    require!(
        clock.unix_timestamp.saturating_sub(price.publish_time) <= MAX_PRICE_STALENESS,
        CustodyError::StalePrice
    );

    // 归一化到 9dp：normalized = price × 10^(expo + 9)
    let target_expo: i32 = -9;
    let shift = price
        .expo
        .checked_sub(target_expo)
        .ok_or(CustodyError::MathOverflow)?;

    let price_u64: u64 = u64::try_from(price.price).map_err(|_| CustodyError::MathOverflow)?;

    let normalized = if shift >= 0 {
        let multiplier = 10u64
            .checked_pow(shift as u32)
            .ok_or(CustodyError::MathOverflow)?;
        price_u64
            .checked_mul(multiplier)
            .ok_or(CustodyError::MathOverflow)?
    } else {
        let divisor = 10u64
            .checked_pow((-shift) as u32)
            .ok_or(CustodyError::MathOverflow)?;
        price_u64
            .checked_div(divisor)
            .ok_or(CustodyError::MathOverflow)?
    };

    require!(normalized > 0, CustodyError::InvalidPrice);
    Ok(normalized)
}

/// 计算代币的 USD 价值（9dp）：amount × price_9dp / 10^decimals
fn compute_usd_value_9dp(
    amount: u64,
    decimals: u8,
    price_9dp: u64,
) -> Result<u64> {
    let divisor = 10u128
        .checked_pow(decimals as u32)
        .ok_or(CustodyError::MathOverflow)?;
    let usd = (amount as u128)
        .checked_mul(price_9dp as u128)
        .ok_or(CustodyError::MathOverflow)?
        .checked_div(divisor)
        .ok_or(CustodyError::MathOverflow)?;
    u64::try_from(usd).map_err(|_| error!(CustodyError::MathOverflow))
}

// ───────────────────────────── Accounts ─────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + VaultConfig::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, VaultConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ CustodyError::Unauthorized,
    )]
    pub config: Account<'info, VaultConfig>,
}

#[derive(Accounts)]
pub struct CreateSinglePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, VaultConfig>,

    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", owner.key().as_ref(), &config.position_nonce.to_le_bytes()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub primary_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = primary_user_ata.mint == primary_mint.key() @ CustodyError::MintMismatch,
        constraint = primary_user_ata.owner == owner.key() @ CustodyError::InvalidAtaOwner,
    )]
    pub primary_user_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        token::mint = primary_mint,
        token::authority = position,
        seeds = [b"vault", position.key().as_ref(), primary_mint.key().as_ref()],
        bump,
    )]
    pub primary_vault: Account<'info, TokenAccount>,

    /// CHECK: Pyth 价格账户，由 load_price_feed_from_account_info 内部校验 owner
    pub primary_price_feed: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateDualPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, VaultConfig>,

    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", owner.key().as_ref(), &config.position_nonce.to_le_bytes()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub primary_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = primary_user_ata.mint == primary_mint.key() @ CustodyError::MintMismatch,
        constraint = primary_user_ata.owner == owner.key() @ CustodyError::InvalidAtaOwner,
    )]
    pub primary_user_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        token::mint = primary_mint,
        token::authority = position,
        seeds = [b"vault", position.key().as_ref(), primary_mint.key().as_ref()],
        bump,
    )]
    pub primary_vault: Account<'info, TokenAccount>,

    pub secondary_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = secondary_user_ata.mint == secondary_mint.key() @ CustodyError::MintMismatch,
        constraint = secondary_user_ata.owner == owner.key() @ CustodyError::InvalidAtaOwner,
    )]
    pub secondary_user_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        token::mint = secondary_mint,
        token::authority = position,
        seeds = [b"vault", position.key().as_ref(), secondary_mint.key().as_ref()],
        bump,
    )]
    pub secondary_vault: Account<'info, TokenAccount>,

    /// CHECK: Pyth 主币价格账户
    pub primary_price_feed: UncheckedAccount<'info>,

    /// CHECK: Pyth 副币价格账户
    pub secondary_price_feed: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleasePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = owner @ CustodyError::Unauthorized)]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        constraint = primary_vault.mint == position.primary_mint @ CustodyError::MintMismatch,
        constraint = primary_vault.owner == position.key() @ CustodyError::InvalidVaultOwner,
    )]
    pub primary_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = primary_user_ata.mint == position.primary_mint @ CustodyError::MintMismatch,
        constraint = primary_user_ata.owner == owner.key() @ CustodyError::InvalidAtaOwner,
    )]
    pub primary_user_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub secondary_vault: Option<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub secondary_user_ata: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner @ CustodyError::Unauthorized,
        constraint = position.is_released @ CustodyError::NotReleased,
    )]
    pub position: Account<'info, Position>,
}

// ───────────────────────────── State ─────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub struct RateTier {
    pub duration_secs: i64,
    pub single_rate_bps: u64,   // 单币仓 APR
    pub dual_rate_bps: u64,     // 双币仓 APR（USD 金本位）
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionKind {
    Single,
    Dual,
}

#[account]
#[derive(InitSpace)]
pub struct VaultConfig {
    pub authority: Pubkey,
    pub position_nonce: u64,
    pub tiers: [RateTier; MAX_TIERS],
    pub num_tiers: u8,
    pub primary_weight_bps: u64,     // 6000
    pub secondary_weight_bps: u64,   // 4000
    pub weight_tolerance_bps: u64,   // 500 = ±5%
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub position_id: u64,
    pub kind: PositionKind,
    pub tier_index: u8,
    pub duration_secs: i64,
    pub unlock_at: i64,
    pub created_at: i64,
    pub is_released: bool,

    pub primary_mint: Pubkey,
    pub primary_amount: u64,
    pub secondary_mint: Pubkey,
    pub secondary_amount: u64,

    pub primary_price_9dp: u64,
    pub secondary_price_9dp: u64,
    pub usd_base_9dp: u64,

    pub rate_bps: u64,
    pub primary_weight_bps: u64,
    pub secondary_weight_bps: u64,

    pub bump: u8,
}

// ───────────────────────────── Events ─────────────────────────────

#[event]
pub struct ConfigInitialized {
    pub num_tiers: u8,
    pub primary_weight_bps: u64,
    pub secondary_weight_bps: u64,
    pub weight_tolerance_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct TierRatesUpdated {
    pub tier_index: u8,
    pub old_single_rate_bps: u64,
    pub old_dual_rate_bps: u64,
    pub new_single_rate_bps: u64,
    pub new_dual_rate_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct WeightsUpdated {
    pub old_primary_bps: u64,
    pub old_secondary_bps: u64,
    pub old_tolerance_bps: u64,
    pub new_primary_bps: u64,
    pub new_secondary_bps: u64,
    pub new_tolerance_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionCreated {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub kind: PositionKind,
    pub tier_index: u8,
    pub duration_secs: i64,
    pub unlock_at: i64,
    pub primary_mint: Pubkey,
    pub primary_amount: u64,
    pub secondary_mint: Pubkey,
    pub secondary_amount: u64,
    pub primary_price_9dp: u64,
    pub secondary_price_9dp: u64,
    pub usd_base_9dp: u64,
    pub rate_bps: u64,
    pub primary_weight_bps: u64,
    pub secondary_weight_bps: u64,
}

#[event]
pub struct Released {
    pub position: Pubkey,
    pub kind: PositionKind,
    pub tier_index: u8,
    pub primary_amount: u64,
    pub secondary_amount: u64,
}

#[event]
pub struct PositionClosed {
    pub position: Pubkey,
    pub owner: Pubkey,
}

// ───────────────────────────── Errors ─────────────────────────────

#[error_code]
pub enum CustodyError {
    #[msg("Invalid tiers: must be non-empty, <= MAX_TIERS, durations strictly increasing")]
    InvalidTiers,
    #[msg("Tier index out of range")]
    InvalidTierIndex,
    #[msg("Annual rate exceeds hard cap")]
    RateTooHigh,
    #[msg("Weights must sum to 10000, each > 0, tolerance <= 2000")]
    InvalidWeights,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Primary and secondary mint must be different")]
    SameMint,
    #[msg("Position already released")]
    AlreadyReleased,
    #[msg("Position not yet unlocked")]
    NotYetUnlocked,
    #[msg("Position not released")]
    NotReleased,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Invalid ATA owner")]
    InvalidAtaOwner,
    #[msg("Invalid vault authority")]
    InvalidVaultOwner,
    #[msg("Unexpected secondary accounts for Single position")]
    UnexpectedSecondaryAccounts,
    #[msg("Missing secondary accounts for Dual position")]
    MissingSecondaryAccounts,
    #[msg("Invalid or unavailable price feed")]
    InvalidPriceFeed,
    #[msg("Price is invalid")]
    InvalidPrice,
    #[msg("Price is too stale")]
    StalePrice,
    #[msg("USD value is too small (rounds to zero)")]
    UsdValueTooSmall,
    #[msg("Primary ratio out of acceptable range")]
    WeightRatioOutOfRange,
    #[msg("Math overflow")]
    MathOverflow,
}
