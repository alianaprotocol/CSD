import fs from "fs";

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  createInitializeMintInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";


// ========================================
// RPC
// ========================================

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);


// ========================================
// Wallet
// ========================================

const walletSecret = Uint8Array.from(
  JSON.parse(
    fs.readFileSync("./keypair.json", "utf8")
  )
);

const wallet = Keypair.fromSecretKey(
  walletSecret
);


// ========================================
// Vanity Mint
// ========================================

const mintSecret = Uint8Array.from(
  JSON.parse(
    fs.readFileSync("./68xxx6868.json", "utf8")
  )
);

const mint = Keypair.fromSecretKey(
  mintSecret
);


// ========================================
// 显示
// ========================================

console.log("");
console.log("================================");
console.log("财神到 God Of Fortune $财神到");
console.log("================================");

console.log(
  "Wallet:",
  wallet.publicKey.toBase58()
);

console.log(
  "Mint:",
  mint.publicKey.toBase58()
);

console.log("Decimals: 6");

console.log("================================");
console.log("");


// ========================================
// 验证 Vanity 地址
// ========================================

const expected =
  "68PUv5chFPRKmh82VLM78WSHumhVVntkJuWZSBhA6868";

if (
  mint.publicKey.toBase58() !== expected
) {
  throw new Error(
    "❌ Vanity Mint 地址不匹配"
  );
}


// ========================================
// 检查 Mint 是否已经存在
// ========================================

const existing =
  await connection.getAccountInfo(
    mint.publicKey
  );

if (existing) {

  console.log(
    "⚠️ Mint 已经存在"
  );

  console.log(
    "Owner:",
    existing.owner.toBase58()
  );

  process.exit(0);
}


// ========================================
// 获取 Rent
// ========================================

const mintAccountSize = 82;

const lamports =
  await connection.getMinimumBalanceForRentExemption(
    mintAccountSize
  );


// ========================================
// 创建 Mint Account
// ========================================

const transaction = new Transaction();

transaction.add(
  SystemProgram.createAccount({
    fromPubkey:
      wallet.publicKey,

    newAccountPubkey:
      mint.publicKey,

    lamports,

    space:
      mintAccountSize,

    programId:
      TOKEN_PROGRAM_ID,
  })
);


// ========================================
// 初始化 Mint
// ========================================

transaction.add(
  createInitializeMintInstruction(
    mint.publicKey,

    6,

    wallet.publicKey,

    null,

    TOKEN_PROGRAM_ID
  )
);


// ========================================
// 发送
// ========================================

console.log(
  "正在创建 SPL Mint..."
);

console.log("");

const signature =
  await sendAndConfirmTransaction(
    connection,

    transaction,

    [
      wallet,
      mint,
    ],

    {
      commitment: "confirmed",
    }
  );


// ========================================
// 成功
// ========================================

console.log("");
console.log("================================");
console.log("✅ SPL MINT 创建成功");
console.log("================================");

console.log(
  "Mint:",
  mint.publicKey.toBase58()
);

console.log(
  "TX:",
  signature
);

console.log("================================");
