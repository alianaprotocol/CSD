是的，客户端用 TypeScript。Anchor 的官方客户端生态就是 `@coral-xyz/anchor` + `@solana/web3.js`，IDL 生成后直接对接，不需要手写序列化。Rust 客户端只适合在另一个链上程序里做 CPI 调用，不适合普通前端/后端脚本。

下面给一份**完整可跑**的 TS 客户端，不是零散片段。

---

## 项目结构

```
client/
├── package.json
├── tsconfig.json
└── src/
    ├── config.ts          # 程序 ID、Pyth feed、RPC
    ├── pda.ts             # PDA 派生
    ├── admin.ts           # 初始化 + 调参
    ├── user.ts            # 建仓 / 释放 / 关闭
    └── read.ts            # 读取 Position 快照
```

---

## `package.json`

```json
{
  "name": "custody-staking-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "admin:init": "tsx src/admin.ts init",
    "admin:rates": "tsx src/admin.ts rates",
    "user:single": "tsx src/user.ts single",
    "user:dual": "tsx src/user.ts dual",
    "user:release": "tsx src/user.ts release"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/spl-token": "^0.4.9",
    "@solana/web3.js": "^1.95.4",
    "@pythnetwork/pyth-solana-receiver": "^0.3.0",
    "bn.js": "^5.2.1",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "@types/bn.js": "^5.1.5",
    "@types/node": "^22.7.4"
  }
}
```

---

## `src/config.ts`

```ts
import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "CustodyStaking11111111111111111111111111111"
);

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

// 主币和副币的 mint（示例地址，实际替换）
export const PRIMARY_MINT = new PublicKey(process.env.PRIMARY_MINT!);
export const SECONDARY_MINT = new PublicKey(process.env.SECONDARY_MINT!);

// Pyth price feed 地址：从 https://pyth.network/developers/price-feed-ids 查
// 例：SOL/USD devnet
export const PRIMARY_PYTH_FEED = new PublicKey(
  process.env.PRIMARY_PYTH_FEED!
);
export const SECONDARY_PYTH_FEED = new PublicKey(
  process.env.SECONDARY_PYTH_FEED!
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
```

---

## `src/pda.ts`

```ts
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PROGRAM_ID } from "./config.js";

export function findConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
}

export function findPositionPda(
  owner: PublicKey,
  positionNonce: BN | bigint
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  const n = typeof positionNonce === "bigint" ? positionNonce : BigInt(positionNonce.toString());
  nonceBuf.writeBigUInt64LE(n);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), owner.toBuffer(), nonceBuf],
    PROGRAM_ID
  );
}

export function findVaultPda(
  position: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), position.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  );
}
```

---

## `src/admin.ts`

```ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import fs from "fs";
import "dotenv/config";
import { PROGRAM_ID, RPC_URL } from "./config.js";
import { findConfigPda } from "./pda.js";

// 加载 authority keypair
function loadAuthority(): Keypair {
  const path = process.env.AUTHORITY_KEYPAIR!;
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function setup(): Promise<{
  program: Program;
  authority: Keypair;
  provider: anchor.AnchorProvider;
}> {
  const conn = new Connection(RPC_URL, "confirmed");
  const authority = loadAuthority();
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(conn, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  // IDL 从 target/idl 读取（anchor build 生成）
  const idl = JSON.parse(
    fs.readFileSync("../target/idl/custody_staking.json", "utf8")
  );
  const program = new Program(idl, PROGRAM_ID, provider);
  return { program, authority, provider };
}

async function init() {
  const { program, authority } = await setup();
  const [config] = findConfigPda();

  const tiers = [
    { durationSecs: new BN(30 * 86400),  singleRateBps: new BN(1000),  dualRateBps: new BN(8000)  }, // 10% / 80%
    { durationSecs: new BN(90 * 86400),  singleRateBps: new BN(3000),  dualRateBps: new BN(15000) }, // 30% / 150%
    { durationSecs: new BN(180 * 86400), singleRateBps: new BN(5000),  dualRateBps: new BN(20000) }, // 50% / 200%
  ];

  const tx = await program.methods
    .initializeConfig(tiers, new BN(6000), new BN(4000), new BN(500)) // 60/40, ±5%
    .accounts({
      authority: authority.publicKey,
      config,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  console.log("init tx:", tx);
  console.log("config pda:", config.toBase58());
}

async function rates() {
  const { program, authority } = await setup();
  const [config] = findConfigPda();

  // 把 90 天档改为单币 35%、双币 160%
  const tx = await program.methods
    .updateTierRates(1, new BN(3500), new BN(16000))
    .accounts({ authority: authority.publicKey, config })
    .rpc({ commitment: "confirmed" });

  console.log("rates tx:", tx);
}

const cmd = process.argv[2];
if (cmd === "init") await init();
else if (cmd === "rates") await rates();
else throw new Error("usage: admin.ts <init|rates>");
```

---

## `src/user.ts`

```ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID as SPL_TOKEN_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import fs from "fs";
import "dotenv/config";
import {
  PROGRAM_ID,
  RPC_URL,
  PRIMARY_MINT,
  SECONDARY_MINT,
  PRIMARY_PYTH_FEED,
  SECONDARY_PYTH_FEED,
} from "./config.js";
import { findConfigPda, findPositionPda, findVaultPda } from "./pda.js";

function loadUser(): Keypair {
  const raw = JSON.parse(fs.readFileSync(process.env.USER_KEYPAIR!, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function setup() {
  const conn = new Connection(RPC_URL, "confirmed");
  const user = loadUser();
  const wallet = new anchor.Wallet(user);
  const provider = new anchor.AnchorProvider(conn, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync("../target/idl/custody_staking.json", "utf8")
  );
  const program = new Program(idl, PROGRAM_ID, provider);
  return { program, user, conn, provider };
}

/// 确保 ATA 存在（Anchor 指令里没有 init ATA）
async function ensureAta(
  conn: Connection,
  owner: Keypair,
  mint: PublicKey
): Promise<PublicKey> {
  const payer = owner;
  const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mint,
    owner.publicKey
  );
  return ata.address;
}

// ───────────────────────── 单币仓建仓 ─────────────────────────

async function createSingle() {
  const { program, user, conn } = await setup();
  const [config] = findConfigPda();
  const configAcc = await program.account.vaultConfig.fetch(config);

  const [position] = findPositionPda(user.publicKey, configAcc.positionNonce);
  const [primaryVault] = findVaultPda(position, PRIMARY_MINT);
  const primaryAta = await ensureAta(conn, user, PRIMARY_MINT);

  const primaryAmount = new BN(100_000_000); // 假设 6 位精度，100 枚

  const tx = await program.methods
    .createSinglePosition(1 /* tier_index = 90天 */, primaryAmount)
    .accounts({
      owner: user.publicKey,
      config,
      position,
      primaryMint: PRIMARY_MINT,
      primaryUserAta: primaryAta,
      primaryVault,
      primaryPriceFeed: PRIMARY_PYTH_FEED,
      tokenProgram: SPL_TOKEN_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  console.log("create single tx:", tx);
  console.log("position:", position.toBase58());
}

// ───────────────────────── 双币仓建仓 ─────────────────────────

async function createDual() {
  const { program, user, conn } = await setup();
  const [config] = findConfigPda();
  const configAcc = await program.account.vaultConfig.fetch(config);

  const [position] = findPositionPda(user.publicKey, configAcc.positionNonce);
  const [primaryVault] = findVaultPda(position, PRIMARY_MINT);
  const [secondaryVault] = findVaultPda(position, SECONDARY_MINT);

  const primaryAta = await ensureAta(conn, user, PRIMARY_MINT);
  const secondaryAta = await ensureAta(conn, user, SECONDARY_MINT);

  // 注意：金额必须匹配 60/40 USD 比例（±5%），否则会失败
  // 这里的数值需要根据当前价格反推，实际应在 UI 上提供计算器
  const primaryAmount = new BN(40_000 * 10 ** 0);    // 40,000 枚（假设 0 精度）
  const secondaryAmount = new BN(1_333_333);         // 1,333,333 枚

  // 先模拟，确认比例校验通过
  const sim = await program.methods
    .createDualPosition(2 /* tier_index = 180天 */, primaryAmount, secondaryAmount)
    .accounts({
      owner: user.publicKey,
      config,
      position,
      primaryMint: PRIMARY_MINT,
      primaryUserAta: primaryAta,
      primaryVault,
      secondaryMint: SECONDARY_MINT,
      secondaryUserAta: secondaryAta,
      secondaryVault,
      primaryPriceFeed: PRIMARY_PYTH_FEED,
      secondaryPriceFeed: SECONDARY_PYTH_FEED,
      tokenProgram: SPL_TOKEN_ID,
      systemProgram: SystemProgram.programId,
    })
    .simulate();

  console.log("simulation ok, logs:", sim.raw.slice(0, 3));

  const tx = await program.methods
    .createDualPosition(2, primaryAmount, secondaryAmount)
    .accounts({
      owner: user.publicKey,
      config,
      position,
      primaryMint: PRIMARY_MINT,
      primaryUserAta: primaryAta,
      primaryVault,
      secondaryMint: SECONDARY_MINT,
      secondaryUserAta: secondaryAta,
      secondaryVault,
      primaryPriceFeed: PRIMARY_PYTH_FEED,
      secondaryPriceFeed: SECONDARY_PYTH_FEED,
      tokenProgram: SPL_TOKEN_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  console.log("create dual tx:", tx);
  console.log("position:", position.toBase58());
}

// ───────────────────────── 到期释放 ─────────────────────────

async function release() {
  const { program, user } = await setup();
  const positionAddr = new PublicKey(process.env.POSITION!);
  const position = await program.account.position.fetch(positionAddr);

  const [primaryVault] = findVaultPda(positionAddr, position.primaryMint);
  const [secondaryVault] = position.secondaryMint.equals(PublicKey.default)
    ? [null, 0]
    : findVaultPda(positionAddr, position.secondaryMint);

  // 用户自己的 ATA（必须有，否则 transfer 失败）
  const conn = program.provider.connection;
  const primaryAta = await ensureAta(conn, user, position.primaryMint);

  const accounts: any = {
    owner: user.publicKey,
    position: positionAddr,
    primaryVault,
    primaryUserAta: primaryAta,
    secondaryVault: secondaryVault,
    secondaryUserAta: null,
    tokenProgram: SPL_TOKEN_ID,
  };

  if (!position.secondaryMint.equals(PublicKey.default)) {
    accounts.secondaryUserAta = await ensureAta(conn, user, position.secondaryMint);
  }

  const tx = await program.methods
    .releasePosition()
    .accounts(accounts)
    .rpc({ commitment: "confirmed" });

  console.log("release tx:", tx);
}

// ───────────────────────── 关闭 ─────────────────────────

async function close() {
  const { program, user } = await setup();
  const positionAddr = new PublicKey(process.env.POSITION!);

  const tx = await program.methods
    .closePosition()
    .accounts({
      owner: user.publicKey,
      position: positionAddr,
    })
    .rpc({ commitment: "confirmed" });

  console.log("close tx:", tx);
}

const cmd = process.argv[2];
if (cmd === "single") await createSingle();
else if (cmd === "dual") await createDual();
else if (cmd === "release") await release();
else if (cmd === "close") await close();
else throw new Error("usage: user.ts <single|dual|release|close>");
```

---

## `src/read.ts`

```ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
import "dotenv/config";
import { PROGRAM_ID, RPC_URL } from "./config.js";

const conn = new Connection(RPC_URL, "confirmed");
const idl = JSON.parse(fs.readFileSync("../target/idl/custody_staking.json", "utf8"));
const provider = new anchor.AnchorProvider(conn, {} as any, {});
const program = new Program(idl, PROGRAM_ID, provider);

async function dump() {
  const positionAddr = new PublicKey(process.env.POSITION!);
  const p = await program.account.position.fetch(positionAddr);

  console.log({
    owner: p.owner.toBase58(),
    positionId: p.positionId.toString(),
    kind: "single" in p.kind ? "Single" : "Dual",
    tierIndex: p.tierIndex,
    durationSecs: p.durationSecs.toString(),
    createdAt: new Date(p.createdAt.toNumber() * 1000).toISOString(),
    unlockAt: new Date(p.unlockAt.toNumber() * 1000).toISOString(),
    primaryAmount: p.primaryAmount.toString(),
    secondaryAmount: p.secondaryAmount.toString(),
    usdBase9dp: p.usdBase9dp.toString(),
    usdBaseHuman: (Number(p.usdBase9dp) / 1e9).toFixed(2) + " USD",
    rateBps: p.rateBps.toString(),
    apr: (Number(p.rateBps) / 100) + "%",
    isReleased: p.isReleased,
  });
}

await dump();
```

---

## 运行前需要设置的环境变量

```bash
# .env
RPC_URL=https://api.devnet.solana.com
AUTHORITY_KEYPAIR=./keys/authority.json
USER_KEYPAIR=./keys/user.json
PRIMARY_MINT=<主币 mint>
SECONDARY_MINT=<副币 mint>
PRIMARY_PYTH_FEED=<Pyth 主币 feed 地址>
SECONDARY_PYTH_FEED=<Pyth 副币 feed 地址>
POSITION=<已建仓的 position PDA>  # 释放/关闭时使用
```

---

## 几个必须注意的 TS 客户端坑

**1. `position_nonce` 读取时机**

建仓前必须 `fetch(config)` 拿到**当前的** `positionNonce`，用它派生 `position` PDA。如果两个用户同时建仓，第二笔会因为 nonce 已变而失败——这是预期的，重试即可。

**2. 双币建仓先 `simulate()`**

60/40 比例校验依赖实时 Pyth 价格，**用户输入的金额很难恰好落在 ±5% 内**。UI 应该：

```
用户输入总 USDT 或主币数量
→ 读 Pyth 价格
→ 计算需要配的副币数量
→ 展示 "你需要 40,000 主币 + 1,333,333 副币"
→ 用户确认后直接提交（金额已由 UI 算好）
```

不要指望用户手算能匹配比例。`simulate()` 只是给脚本做预检，不是给用户用的。

**3. ATA 必须提前创建**

Anchor 指令里 `primary_user_ata` 是 `Account<TokenAccount>`，账户不存在会直接失败。`getOrCreateAssociatedTokenAccount` 必须在建仓前调用，且由 owner 支付租金。生产环境的 UI 应该把 ATA 创建和建仓打包成**同一个交易**（`Transaction.add` 两个指令），而不是分两次弹钱包。

**4. `secondary_vault: null` 在 TS 里的写法**

Single 仓释放时，`secondary_vault` / `secondary_user_ata` 传 `null`，Anchor 的 TS 客户端会正确序列化为“该账户不存在”。**不要传 `PublicKey.default`**，那会被当作有效账户传入，触发 `UnexpectedSecondaryAccounts`。

**5. IDL 路径**

`anchor build` 生成的 IDL 在 `target/idl/custody_staking.json`。客户端脚本如果放在 `client/` 目录，路径是 `../target/idl/...`。部署到生产环境时，IDL 应该打包进前端 bundle（`import idl from "./idl.json"`），而不是运行时读文件。

**6. 金额精度**

`primaryAmount` 必须按 mint 的 `decimals` 缩放。6 位精度的代币，100 枚 = `100_000_000`。脚本里写死 `new BN(100_000_000)` 只是为了示例，生产代码应该：

```ts
const amount = new BN(humanAmount * 10 ** mintDecimals);
```

---

**一句话总结**：TS 客户端用 `@coral-xyz/anchor` + IDL 驱动，不需要手写账户序列化；核心流程是“先 `getOrCreateAssociatedTokenAccount` 建 ATA → 读 `config.positionNonce` 派生 Position PDA → 读 Pyth 价格算双币金额 → 调建仓指令”。双币建仓的 60/40 比例必须由 UI 先按实时价格算好再提交，不要让用户手算。
