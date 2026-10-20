结算层的职责很明确：**接收后端签名的累积收益数据，验证签名和新鲜度，从奖励金库转出差额**。不碰托管层的本金，不信任后端的单方面数据——链上要有独立的防重放和价格校验。基于前面的架构（托管层快照 `usd_base_9dp` / `rate_bps` / `created_at`，结算层日频累积 `cumulative_primary`），下面是完整的结算 Program。

---

## 设计边界

| 组件 | 职责 |
|---|---|
| **托管 Program** | 本金托管、价格/利率/权重快照、到期释放 |
| **结算 Program** | 验证后端 Ed25519 签名、防重放（单调 nonce）、从奖励金库转出差额、可选链上 Pyth 价格校验 |

结算层**不读取托管层的 vault 余额**，奖励金库是独立的 token account，归结算 Program 的 PDA 所有。后端签名的消息包含 `program_id`、`stake_pool`（结算池 PDA）、`user`、`cumulative_amount`、`nonce`、`expires_slot`，链上逐项校验。

---

## `Cargo.toml`

```toml
[package]
name = "settlement"
version = "0.1.0"
edition = "2021"

[lib]
name = "settlement"
crate-type = ["cdylib", "lib"]

[features]
default = []
no-entrypoint = []
cpi = ["no-entrypoint"]

[dependencies]
anchor-lang = { version = "0.30.1", features = ["init-if-needed"] }
anchor-spl = "0.30.1"
pyth-sdk-solana = "0.10.0"
```

---

## 核心指令

### `initialize_settlement_pool`

初始化结算池：设定奖励金库 authority（结算 Program PDA）、后端签名者公钥、单次/周期限额。

```rust
pub fn initialize_settlement_pool(
    ctx: Context<InitializeSettlementPool>,
    backend_signer: Pubkey,
    reward_mint: Pubkey,
    max_single_claim: u64,
    daily_limit: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.backend_signer = backend_signer;
    pool.reward_mint = reward_mint;
    pool.reward_vault = ctx.accounts.reward_vault.key();
    pool.max_single_claim = max_single_claim;
    pool.daily_limit = daily_limit;
    pool.total_claimed_today = 0;
    pool.last_reset_day = Clock::get()?.unix_timestamp / 86400;
    pool.is_paused = false;
    pool.bump = ctx.bumps.pool;

    emit!(SettlementPoolInitialized {
        pool: pool.key(),
        backend_signer,
        reward_mint,
        max_single_claim,
        daily_limit,
    });
    Ok(())
}
```

### `claim`

核心逻辑：校验 Ed25519 签名 → 校验 nonce 单调 → 校验过期 slot → 计算差值 → 限额检查 → 转账。

```rust
pub fn claim(
    ctx: Context<Claim>,
    cumulative_amount: u64,
    nonce: u64,
    expires_slot: u64,
    reward_mint: Pubkey,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    require!(!pool.is_paused, SettlementError::Paused);
    require!(
        reward_mint == pool.reward_mint,
        SettlementError::RewardMintMismatch
    );

    let clock = Clock::get()?;
    require!(
        clock.slot <= expires_slot,
        SettlementError::SignatureExpired
    );

    // 防重放：nonce 必须严格大于已消费的 nonce
    let claim_state = &mut ctx.accounts.claim_state;
    require!(
        nonce > claim_state.last_nonce,
        SettlementError::InvalidNonce
    );
    require!(
        cumulative_amount > claim_state.last_cumulative,
        SettlementError::NonMonotonicAmount
    );

    // 重新构建签名消息并校验 Ed25519 签名
    // 签名消息格式：
    //   program_id (32) | pool (32) | user (32) | cumulative_amount (8) | nonce (8) | expires_slot (8)
    let message = build_claim_message(
        ctx.program_id,
        &pool.key(),
        &ctx.accounts.user.key(),
        cumulative_amount,
        nonce,
        expires_slot,
    );
    verify_ed25519_signature(
        &ctx.accounts.instructions.to_account_info(),
        &pool.backend_signer,
        &message,
    )?;

    // 计算本次应发差额
    let payout = cumulative_amount
        .checked_sub(claim_state.last_cumulative)
        .ok_or(SettlementError::MathOverflow)?;
    require!(payout > 0, SettlementError::ZeroPayout);

    // 限额检查
    require!(
        payout <= pool.max_single_claim,
        SettlementError::ExceedsSingleClaimLimit
    );

    let today = clock.unix_timestamp / 86400;
    if today != pool.last_reset_day {
        pool.total_claimed_today = 0;
        pool.last_reset_day = today;
    }
    let new_total = pool
        .total_claimed_today
        .checked_add(payout)
        .ok_or(SettlementError::MathOverflow)?;
    require!(new_total <= pool.daily_limit, SettlementError::ExceedsDailyLimit);
    pool.total_claimed_today = new_total;

    // 从奖励金库转账
    let seeds: &[&[u8]] = &[b"reward_vault", pool.key().as_ref(), &[ctx.bumps.reward_vault]];
    let signer: &[&[&[u8]]] = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reward_vault.to_account_info(),
                to: ctx.accounts.user_reward_ata.to_account_info(),
                authority: ctx.accounts.reward_vault.to_account_info(),
            },
            signer,
        ),
        payout,
    )?;

    // 更新状态（转账成功后才写，失败整笔回滚）
    claim_state.last_nonce = nonce;
    claim_state.last_cumulative = cumulative_amount;
    claim_state.last_claim_at = clock.unix_timestamp;

    emit!(Claimed {
        pool: pool.key(),
        user: ctx.accounts.user.key(),
        cumulative_amount,
        payout,
        nonce,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
```

### `settle_day`（可选：链上 Pyth 价格累积结算）

如果产品坚持“日频金本位，每天按当日价格折算主币”，需要一个**无需许可的链上结算指令**，每天由 keeper 或后端触发，读取 Pyth 当日价格，累积到 `PositionSettlement.cumulative_primary`。用户 claim 时只验证“cumulative 已由 settle_day 更新”，不直接信任后端签名。

```rust
pub fn settle_day(ctx: Context<SettleDay>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    require!(!pool.is_paused, SettlementError::Paused);

    let position = &ctx.accounts.position;
    let settlement = &mut ctx.accounts.settlement;

    let clock = Clock::get()?;
    let days_elapsed = ((clock.unix_timestamp - position.created_at) / 86400) as u64;
    let days_to_settle = days_elapsed.min(position.duration_secs as u64 / 86400);

    require!(
        settlement.last_settled_day < days_to_settle as u16,
        SettlementError::AlreadySettled
    );

    // 读取 Pyth 主币价格
    let price_feed = load_price_feed_from_account_info(&ctx.accounts.primary_price_feed.to_account_info())
        .map_err(|_| SettlementError::InvalidPriceFeed)?;
    let price = price_feed
        .get_price_no_older_than(clock.unix_timestamp, 60)
        .ok_or(SettlementError::StalePrice)?;

    // 日收益 USD（9dp）= usd_base_9dp × rate_bps / 10000 / 365
    let daily_usd_9dp = (position.usd_base_9dp as u128)
        .checked_mul(position.rate_bps as u128)
        .ok_or(SettlementError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(SettlementError::MathOverflow)?
        .checked_div(365)
        .ok_or(SettlementError::MathOverflow)? as u64;

    // 折算主币：daily_primary = daily_usd_9dp / price_9dp
    let price_9dp = normalize_price_to_9dp(&price)?;
    let daily_primary = (daily_usd_9dp as u128)
        .checked_mul(1_000_000_000)
        .ok_or(SettlementError::MathOverflow)?
        .checked_div(price_9dp as u128)
        .ok_or(SettlementError::MathOverflow)? as u64;

    // 累积到 settlement
    settlement.cumulative_primary = settlement
        .cumulative_primary
        .checked_add(daily_primary)
        .ok_or(SettlementError::MathOverflow)?;
    settlement.last_settled_day = settlement
        .last_settled_day
        .checked_add(1)
        .ok_or(SettlementError::MathOverflow)?;

    emit!(DaySettled {
        position: position.key(),
        day: settlement.last_settled_day,
        daily_primary,
        cumulative_primary: settlement.cumulative_primary,
        price_9dp,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
```

---

## Ed25519 签名验证辅助函数

Solana 的 Ed25519 验证通过 **precompile instruction + Instructions sysvar introspection** 实现。交易必须包含一条 `Ed25519SigVerify` 指令，结算 Program 在 `claim` 中读取 `Instructions` sysvar，确认该 precompile 指令存在且签名有效。

```rust
use solana_program::sysvar::instructions::{
    load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use solana_program::ed25519_program::ID as ED25519_PROGRAM_ID;

/// 校验当前交易中包含有效的 Ed25519 签名
fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    message: &[u8],
) -> Result<()> {
    // Ed25519 precompile 指令的格式：
    // [num_signatures: u8, padding: u8, offsets_struct, signature, pubkey, message]
    // offsets_struct 包含 signature_offset, signature_instruction_index,
    //   public_key_offset, public_key_instruction_index,
    //   message_data_offset, message_data_size, message_instruction_index

    let current_index = load_current_index_checked(instructions_sysvar)?;
    let mut found = false;

    for i in 0..current_index {
        let ix = load_instruction_at_checked(i, instructions_sysvar)?;
        if ix.program_id != ED25519_PROGRAM_ID {
            continue;
        }

        // 解析 Ed25519 指令数据
        let data = &ix.data;
        require!(data.len() >= 2, SettlementError::InvalidEd25519Instruction);
        let num_signatures = data[0] as usize;

        for sig_idx in 0..num_signatures {
            let offset_base = 2 + sig_idx * 14; // 2 header + 7 u16 fields per signature
            require!(
                data.len() >= offset_base + 14,
                SettlementError::InvalidEd25519Instruction
            );

            let signature_offset = u16::from_le_bytes([data[offset_base], data[offset_base + 1]]) as usize;
            let signature_ix_index = u16::from_le_bytes([data[offset_base + 2], data[offset_base + 3]]);
            let pubkey_offset = u16::from_le_bytes([data[offset_base + 4], data[offset_base + 5]]) as usize;
            let pubkey_ix_index = u16::from_le_bytes([data[offset_base + 6], data[offset_base + 7]]);
            let message_offset = u16::from_le_bytes([data[offset_base + 8], data[offset_base + 9]]) as usize;
            let message_size = u16::from_le_bytes([data[offset_base + 10], data[offset_base + 11]]) as usize;
            let message_ix_index = u16::from_le_bytes([data[offset_base + 12], data[offset_base + 13]]);

            // 只接受同一指令内的 offsets（signature_ix_index == u16::MAX 表示当前指令）
            // 以及 message_ix_index 同样
            let sig_data = if signature_ix_index == u16::MAX {
                data.get(signature_offset..signature_offset + 64)
            } else {
                None
            };
            let pk_data = if pubkey_ix_index == u16::MAX {
                data.get(pubkey_offset..pubkey_offset + 32)
            } else {
                None
            };
            let msg_data = if message_ix_index == u16::MAX {
                data.get(message_offset..message_offset + message_size)
            } else {
                None
            };

            if let (Some(sig), Some(pk), Some(msg)) = (sig_data, pk_data, msg_data) {
                require!(pk == expected_signer.as_ref(), SettlementError::WrongSigner);
                require!(msg == message, SettlementError::MessageMismatch);
                found = true;
                break;
            }
        }
        if found {
            break;
        }
    }

    require!(found, SettlementError::MissingEd25519Signature);
    Ok(())
}

fn load_current_index_checked(instructions_sysvar: &AccountInfo) -> Result<usize> {
    let data = instructions_sysvar.try_borrow_data()?;
    require!(data.len() >= 2, SettlementError::InvalidInstructionsSysvar);
    let current_index = u16::from_le_bytes([data[0], data[1]]) as usize;
    Ok(current_index)
}
```

**关键安全约束**：`signature_ix_index`、`pubkey_ix_index`、`message_ix_index` 必须是 `u16::MAX`（即引用当前 Ed25519 指令自身的数据），**不能允许引用交易中其他指令的数据**。否则攻击者可以在交易中放一条包含伪造消息的指令，让 Ed25519 precompile 引用它，绕过签名验证。

---

## 签名消息构建

```rust
fn build_claim_message(
    program_id: &Pubkey,
    pool: &Pubkey,
    user: &Pubkey,
    cumulative_amount: u64,
    nonce: u64,
    expires_slot: u64,
) -> Vec<u8> {
    let mut msg = Vec::with_capacity(32 + 32 + 32 + 8 + 8 + 8);
    msg.extend_from_slice(program_id.as_ref());
    msg.extend_from_slice(pool.as_ref());
    msg.extend_from_slice(user.as_ref());
    msg.extend_from_slice(&cumulative_amount.to_le_bytes());
    msg.extend_from_slice(&nonce.to_le_bytes());
    msg.extend_from_slice(&expires_slot.to_le_bytes());
    msg
}
```

签名消息绑定 `program_id`、`pool`、`user`、金额、nonce、过期 slot，防止跨程序、跨池、跨用户、跨时间的重放。

---

## 账户结构

```rust
#[account]
#[derive(InitSpace)]
pub struct SettlementPool {
    pub authority: Pubkey,
    pub backend_signer: Pubkey,
    pub reward_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub max_single_claim: u64,
    pub daily_limit: u64,
    pub total_claimed_today: u64,
    pub last_reset_day: i64,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ClaimState {
    pub user: Pubkey,
    pub last_nonce: u64,
    pub last_cumulative: u64,
    pub last_claim_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PositionSettlement {
    pub position: Pubkey,
    pub last_settled_day: u16,
    pub cumulative_primary: u64,
    pub bump: u8,
}
```

---

## Claim 的 Accounts 约束

```rust
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"settlement_pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, SettlementPool>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + ClaimState::INIT_SPACE,
        seeds = [b"claim_state", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub claim_state: Account<'info, ClaimState>,

    #[account(
        mut,
        constraint = reward_vault.key() == pool.reward_vault @ SettlementError::InvalidRewardVault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_reward_ata.mint == pool.reward_mint @ SettlementError::RewardMintMismatch,
        constraint = user_reward_ata.owner == user.key() @ SettlementError::InvalidAtaOwner,
    )]
    pub user_reward_ata: Account<'info, TokenAccount>,

    /// CHECK: Instructions sysvar，用于 introspection
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

`init_if_needed` 在这里是安全的：`claim_state` 的 PDA 种子包含 `pool` 和 `user`，攻击者无法抢先为他人初始化。`ClaimState` 首次创建时 `last_nonce = 0`、`last_cumulative = 0`，`nonce > 0` 和 `cumulative > 0` 的校验自然成立。

---

## 客户端：构造带 Ed25519 precompile 的交易

claim 交易必须**两条指令**：先 Ed25519 precompile 验证签名，再调用结算 Program 的 `claim`。两条指令在同一个原子交易中，precompile 失败则整笔交易回滚。

```ts
import {
  Ed25519Program,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import nacl from "tweetnacl";

async function buildClaimTx(
  connection: Connection,
  user: Keypair,
  backendSigner: Keypair,
  program: anchor.Program,
  pool: PublicKey,
  rewardVault: PublicKey,
  userRewardAta: PublicKey,
  cumulativeAmount: bigint,
  nonce: bigint,
  expiresSlot: number
): Promise<Transaction> {
  const programId = program.programId;

  // 构造签名消息（与链上 build_claim_message 一致）
  const msg = Buffer.alloc(32 + 32 + 32 + 8 + 8 + 8);
  let offset = 0;
  programId.toBuffer().copy(msg, offset); offset += 32;
  pool.toBuffer().copy(msg, offset); offset += 32;
  user.publicKey.toBuffer().copy(msg, offset); offset += 32;
  msg.writeBigUInt64LE(cumulativeAmount, offset); offset += 8;
  msg.writeBigUInt64LE(nonce, offset); offset += 8;
  msg.writeBigUInt64LE(BigInt(expiresSlot), offset);

  // 后端签名
  const signature = nacl.sign.detached(msg, backendSigner.secretKey);

  // Ed25519 precompile 指令
  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: backendSigner.publicKey.toBytes(),
    message: msg,
    signature: signature,
  });

  // 结算 Program 的 claim 指令
  const [claimState] = PublicKey.findProgramAddressSync(
    [Buffer.from("claim_state"), pool.toBuffer(), user.publicKey.toBuffer()],
    programId
  );

  const claimIx = await program.methods
    .claim(
      new anchor.BN(cumulativeAmount.toString()),
      new anchor.BN(nonce.toString()),
      new anchor.BN(expiresSlot),
      rewardMint
    )
    .accounts({
      user: user.publicKey,
      pool,
      claimState,
      rewardVault,
      userRewardAta,
      instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ed25519Ix).add(claimIx);
  tx.feePayer = user.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}
```

**交易顺序不可颠倒**：Ed25519 precompile 必须在 `claim` 之前，`claim` 中读取 `Instructions` sysvar 时才能看到它。

---

## 防重放的完整性

链上通过 `ClaimState.last_nonce` 和 `last_cumulative` 双约束防重放：

```rust
require!(nonce > claim_state.last_nonce, SettlementError::InvalidNonce);
require!(cumulative_amount > claim_state.last_cumulative, SettlementError::NonMonotonicAmount);
```

- **同一个 `(nonce, cumulative)` 签名只能消费一次**：消费后 `last_nonce` 推进，相同 nonce 的签名再次提交会失败。
- **不能跳过 nonce**：如果后端签发 `nonce = 5` 的签名，而链上 `last_nonce = 3`，`5 > 3` 通过。但 `nonce = 4` 的签名之后仍可使用（`4 > 5` 失败，所以 4 被永久跳过）。这是预期行为——nonce 不需要连续，只需要严格递增。
- **累积金额单调**：即使后端因 bug 签发了两个不同 nonce 但 `cumulative_amount` 相同的签名，第二个也会因 `cumulative_amount > last_cumulative` 失败而被拒绝。

审计报告中反复强调的“签名重放导致无限转账”，在这个双约束下不成立：任何签名在链上被消费后，对应的 `last_nonce` 和 `last_cumulative` 都已推进，数学上有效的旧签名无法再次改变链上状态。

---

## 可暂停开关

```rust
pub fn pause(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.pool.is_paused = true;
    emit!(Paused { timestamp: Clock::get()?.unix_timestamp });
    Ok(())
}

pub fn unpause(ctx: Context<Admin>) -> Result<()> {
    ctx.accounts.pool.is_paused = false;
    emit!(Unpaused { timestamp: Clock::get()?.unix_timestamp });
    Ok(())
}
```

`Admin` 使用 `has_one = authority` 校验，暂停开关不参与日常 claim 签名，由独立的管理员密钥控制。发现异常时立即制动，给轮换 `backend_signer` 争取时间。

---

## 安全边界总结

| 威胁 | 防御 |
|---|---|
| 签名重放 | `ClaimState.last_nonce` + `last_cumulative` 双单调约束 |
| 跨程序/跨池/跨用户重放 | 签名消息绑定 `program_id` + `pool` + `user` |
| 过期签名 | `expires_slot` 链上校验 `clock.slot <= expires_slot` |
| 伪造签名 | Ed25519 precompile + `Instructions` sysvar introspection，只接受同指令内 offsets |
| 后端超额签发 | `max_single_claim` + `daily_limit` 链上限额 |
| 奖励金库被错误账户冒充 | `reward_vault.key() == pool.reward_vault` 约束 |
| 奖励金库 authority 错误 | `reward_vault` 由 `[b"reward_vault", pool]` PDA 派生，只有结算 Program 能签名转账 |
| 价格操纵（如果启用 `settle_day`） | Pyth `get_price_no_older_than` + 60 秒新鲜度校验 |
| 管理员滥用暂停权 | 暂停只阻断 claim，不触碰本金；事件上链可审计 |

**一句话**：结算层的安全不来自“后端签了名就放款”，而来自链上对签名**上下文、新鲜度、消费状态、金额上限**的四重校验。Ed25519 precompile 负责数学验证，`ClaimState` 负责一次性消费，限额负责损害上限，暂停开关负责应急响应。这四层缺一不可，尤其 `ClaimState` 的非重放约束——没有它，一个静态签名就是一张可以无限兑现的支票。
