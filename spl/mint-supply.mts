import fs from "fs";

import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";

import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
  setAuthority,      // ← 新增
  AuthorityType,     // ← 新增
} from "@solana/spl-token";


// ========================================
// CONFIG
// ========================================

const RPC =
  "https://api.mainnet-beta.solana.com";

const MINT =
  "68Fya6TgdrYeVDSy2zxsEq8uFxxzEyzMTPhLwM816868";

const TOTAL_SUPPLY =
  1_000_000_000n;


// ========================================
// CONNECTION
// ========================================

const connection =
  new Connection(
    RPC,
    "confirmed"
  );


// ========================================
// WALLET
// ========================================

const walletSecret =
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(
        "./keypair.json",
        "utf8"
      )
    )
  );

const wallet =
  Keypair.fromSecretKey(
    walletSecret
  );


// ========================================
// MINT
// ========================================

const mint =
  new PublicKey(MINT);


// ========================================
// INFO
// ========================================

console.log("");
console.log("================================");
console.log("财神到 $财神到");
console.log("================================");

console.log(
  "Wallet:",
  wallet.publicKey.toBase58()
);

console.log(
  "Mint:",
  mint.toBase58()
);

console.log(
  "Target Supply:",
  TOTAL_SUPPLY.toString(),
  "财神到"
);

console.log("================================");
console.log("");


// ========================================
// 检查 Mint
// ========================================

const mintInfo =
  await getMint(
    connection,
    mint
  );

console.log(
  "Decimals:",
  mintInfo.decimals
);

console.log(
  "Mint Authority:",
  mintInfo.mintAuthority?.toBase58() ?? "null"
);

console.log(
  "Current Supply:",
  mintInfo.supply.toString()
);

console.log("");


// ========================================
// 验证 Mint Authority
// ========================================

if (
  !mintInfo.mintAuthority ||
  !mintInfo.mintAuthority.equals(
    wallet.publicKey
  )
) {

  throw new Error(
    "❌ 当前钱包不是 Mint Authority"
  );
}


// ========================================
// 计算 Base Units
// ========================================

const decimals =
  BigInt(mintInfo.decimals);

const multiplier =
  10n ** decimals;

const amount =
  TOTAL_SUPPLY * multiplier;

console.log(
  "Mint Amount:",
  amount.toString()
);

console.log("");


// ========================================
// 创建 ATA
// ========================================

console.log(
  "正在创建 / 获取 ATA..."
);

const tokenAccount =
  await getOrCreateAssociatedTokenAccount(

    connection,

    wallet,

    mint,

    wallet.publicKey

  );


console.log("");
console.log(
  "ATA:",
  tokenAccount.address.toBase58()
);

console.log("");


// ========================================
// 检查当前余额
// ========================================

const before =
  await getAccount(
    connection,
    tokenAccount.address
  );

console.log(
  "当前 ATA 余额:",
  before.amount.toString()
);

console.log("");


// ========================================
// 需要铸造多少
// ========================================

if (
  before.amount >= amount
) {

  console.log(
    "⚠️ 目标供应量已经存在，跳过铸造。"
  );

} else {

  const remaining =
    amount - before.amount;

  console.log(
    "本次铸造:",
    remaining.toString(),
    "base units"
  );

  console.log("");


  // ========================================
  // MintTo
  // ========================================

  console.log(
    "正在铸造..."
  );

  const signature =
    await mintTo(

      connection,

      wallet,

      mint,

      tokenAccount.address,

      wallet,

      remaining
    );


  console.log("");
  console.log("================================");
  console.log("🎉 铸造成功！");
  console.log("================================");

  console.log(
    "Mint:",
    mint.toBase58()
  );

  console.log(
    "ATA:",
    tokenAccount.address.toBase58()
  );

  console.log(
    "Mint TX:",
    signature
  );

  console.log("================================");
  console.log("");
}


// ========================================
// 放弃 Mint Authority
// ========================================

const latestMint =
  await getMint(
    connection,
    mint
  );

if (
  latestMint.mintAuthority &&
  latestMint.mintAuthority.equals(
    wallet.publicKey
  )
) {

  console.log(
    "正在放弃 Mint Authority..."
  );

  const revokeSig =
    await setAuthority(

      connection,

      wallet,          // payer

      mint,

      wallet,          // 当前 authority

      AuthorityType.MintTokens,

      null             // 永久撤销
    );


  console.log("");
  console.log("================================");
  console.log("✅ Mint Authority 已放弃");
  console.log("================================");

  console.log(
    "Revoke TX:",
    revokeSig
  );

  console.log("================================");
  console.log("");

} else {

  console.log(
    "ℹ️ Mint Authority 已不是当前钱包，跳过放弃步骤。"
  );

  console.log("");
}


// ========================================
// 最终检查
// ========================================

const finalMint =
  await getMint(
    connection,
    mint
  );

const finalAccount =
  await getAccount(
    connection,
    tokenAccount.address
  );

console.log("最终结果");
console.log("--------------------------------");

console.log(
  "Total Supply:",
  finalMint.supply.toString()
);

console.log(
  "Wallet Balance:",
  finalAccount.amount.toString()
);

console.log(
  "Decimals:",
  finalMint.decimals
);

console.log(
  "Mint Authority:",
  finalMint.mintAuthority?.toBase58() ?? "null (已放弃)"
);

console.log("--------------------------------");


// ========================================
// 人类可读数量（全程 bigint，避免精度丢失）
// ========================================

const humanSupply =
  finalMint.supply / multiplier;

console.log(
  "Human Supply:",
  humanSupply.toLocaleString(),
  "财神到"
);

console.log("================================");
