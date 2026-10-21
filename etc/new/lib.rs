use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("ALjUNxwxxvYyW1KWSP2sBEtoyuJAmP9FQHagtnTdN6t6");

// ───────────────────────────── Constants ─────────────────────────────

pub const MAX_TIERS: usize = 5;
pub const MAX_SECONDARY_MINTS: usize = 50;
pub const WEIGHT_PRECISION: u64 = 10_000;
pub const MAX_ANNUAL_RATE_BPS: u64 = 100_000; // 1000% 硬上限，支持 200% 档
pub const SINGLE_PRIMARY_WEIGHT_BPS: u64 = 10_000;

// ───────────────────────────── Program ─────────────────────────────

#[program]
pub mod custody_staking {
    use super::*;

    /// 初始化：利率表 + 双币仓权重 + 比例容差。只调用一次。
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
            primary_weight_bps.checked_add(secondary_weight_bps) == Some(WEIGHT_PRECISION),
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
                t.single_rate_bps <= MAX_ANNUAL_RATE_BPS && t.dual_rate_bps <= MAX_ANNUAL_RATE_BPS,
                CustodyError::RateTooHigh
            );
            prev_duration = t.duration_secs;
        }

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.position_nonce = 0;
        config.num_tiers = tiers.len() as u8;
        config.num_secondary_mints = 0;
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

        for i in 0..MAX_SECONDARY_MINTS {
            config.secondary_mints[i] = Pubkey::default();
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

    /// 管理员添加允许的副币 Mint 到白名单
    pub fn add_secondary_mint(ctx: Context<UpdateConfig>, mint: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(
            (config.num_secondary_mints as usize) < MAX_SECONDARY_MINTS,
            CustodyError::TooManySecondaryMints
        );

        // 检查是否已存在
        for i in 0..config.num_secondary_mints as usize {
            require!(
                config.secondary_mints[i] != mint,
                CustodyError::SecondaryMintAlreadyExists
            );
        }

        let idx = config.num_secondary_mints as usize;
        config.secondary_mints[idx] = mint;
        config.num_secondary_mints = config.num_secondary_mints.checked_add(1).unwrap();

        Ok(())
    }

    /// 管理员从白名单移除副币 Mint
    pub fn remove_secondary_mint(ctx: Context<UpdateConfig>, mint: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let mut found_index = None;

        for i in 0..config.num_secondary_mints as usize {
            if config.secondary_mints[i] == mint {
                found_index = Some(i);
                break;
            }
        }

        let idx = found_index.ok_or(CustodyError::SecondaryMintNotFound)?;

        // 将后面的元素往前挪，或者直接清空并维护
        let count = config.num_secondary_mints as usize;
        for i in idx..(count - 1) {
            config.secondary_mints[i] = config.secondary_mints[i + 1];
        }
        config.secondary_mints[count - 1] = Pubkey::default();
        config.num_secondary_mints = config.num_secondary_mints.checked_sub(1).unwrap();

        Ok(())
    }

    /// 更新某档位的单币/双币利率
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
            single_rate_bps <= MAX_ANNUAL_RATE_BPS && dual_rate_bps <= MAX_ANNUAL_RATE_BPS,
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

    /// 更新双币仓权重和容差
    pub fn update_weights(
        ctx: Context<UpdateConfig>,
        primary_weight_bps: u64,
        secondary_weight_bps: u64,
        weight_tolerance_bps: u64,
    ) -> Result<()> {
        require!(
            primary_weight_bps.checked_add(secondary_weight_bps) == Some(WEIGHT_PRECISION),
            CustodyError::InvalidWeights
        );
        require!(
            primary_weight_bps > 0 && secondary_weight_bps > 0,
            CustodyError::InvalidWeights
        );
        require!(weight_tolerance_bps <= 2_000, CustodyError::InvalidWeights);

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

    /// 单币仓建仓
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
                ctx.accounts.token_program.key(),
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
            rate_bps: tier.single_rate_bps,
            primary_weight_bps: SINGLE_PRIMARY_WEIGHT_BPS,
            secondary_weight_bps: 0,
        });
        Ok(())
    }

    /// 双币仓建仓（会校验副币是否在白名单中）
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

        // 校验 secondary_mint 是否在白名单中
        let secondary_mint_key = ctx.accounts.secondary_mint.key();
        let mut found = false;
        for i in 0..config.num_secondary_mints as usize {
            if config.secondary_mints[i] == secondary_mint_key {
                found = true;
                break;
            }
        }
        require!(found, CustodyError::SecondaryMintNotFound);

        let tier = config.tiers[tier_index as usize];
        let unlock_at = clock
            .unix_timestamp
            .checked_add(tier.duration_secs)
            .ok_or(CustodyError::MathOverflow)?;

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
        position.secondary_mint = secondary_mint_key;
        position.secondary_amount = secondary_amount;

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
                ctx.accounts.token_program.key(),
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
                ctx.accounts.token_program.key(),
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
            rate_bps: tier.dual_rate_bps,
            primary_weight_bps: pw,
            secondary_weight_bps: sw,
        });
        Ok(())
    }

    /// 到期释放本金
    pub fn release_position(ctx: Context<ReleasePosition>) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            !ctx.accounts.position.is_released,
            CustodyError::AlreadyReleased
        );
        require!(
            clock.unix_timestamp >= ctx.accounts.position.unlock_at,
            CustodyError::NotYetUnlocked
        );

        let owner_key = ctx.accounts.position.owner;
        let position_id = ctx.accounts.position.position_id;
        let position_bump = ctx.accounts.position.bump;
        let position_key = ctx.accounts.position.key();
        let primary_amount = ctx.accounts.position.primary_amount;
        let secondary_amount = ctx.accounts.position.secondary_amount;
        let kind = ctx.accounts.position.kind;
        let tier_index = ctx.accounts.position.tier_index;
        let secondary_mint = ctx.accounts.position.secondary_mint;

        let id_bytes = position_id.to_le_bytes();

        let seeds: &[&[u8]] = &[
            b"position",
            owner_key.as_ref(),
            id_bytes.as_ref(),
            &[position_bump],
        ];
        let signer: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.primary_vault.to_account_info(),
                    to: ctx.accounts.primary_user_ata.to_account_info(),
                    authority: ctx.accounts.position.to_account_info(),
                },
                signer,
            ),
            primary_amount,
        )?;

        match kind {
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

                require!(sv.mint == secondary_mint, CustodyError::MintMismatch);
                require!(sv.owner == position_key, CustodyError::InvalidVaultOwner);
                require!(sa.mint == secondary_mint, CustodyError::MintMismatch);
                require!(sa.owner == owner_key, CustodyError::InvalidAtaOwner);

                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: sv.to_account_info(),
                            to: sa.to_account_info(),
                            authority: ctx.accounts.position.to_account_info(),
                        },
                        signer,
                    ),
                    secondary_amount,
                )?;
            }
        }

        ctx.accounts.position.is_released = true;

        emit!(Released {
            position: position_key,
            kind,
            tier_index,
            primary_amount,
            secondary_amount,
        });
        Ok(())
    }

    /// 关闭已释放的 Position，回收租金
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        emit!(PositionClosed {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.position.owner,
        });
        Ok(())
    }
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

    pub secondary_user_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = owner,
        token::mint = secondary_mint,
        token::authority = position,
        seeds = [b"vault", position.key().as_ref(), secondary_mint.key().as_ref()],
        bump,
    )]
    pub secondary_vault: Box<Account<'info, TokenAccount>>,

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
    pub single_rate_bps: u64,
    pub dual_rate_bps: u64,
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
    pub secondary_mints: [Pubkey; MAX_SECONDARY_MINTS],
    pub num_secondary_mints: u8,
    pub primary_weight_bps: u64,
    pub secondary_weight_bps: u64,
    pub weight_tolerance_bps: u64,
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
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Too many secondary mints (max 50)")]
    TooManySecondaryMints,
    #[msg("Secondary mint already exists in whitelist")]
    SecondaryMintAlreadyExists,
    #[msg("Secondary mint not found in whitelist")]
    SecondaryMintNotFound,
}
