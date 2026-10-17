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
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";

// ========================================
// 新增：Umi 相关导入
// ========================================
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import { mplTokenMetadata, updateV1 } from "@metaplex-foundation/mpl-token-metadata";

// ========================================
// CONFIG
// ========================================

const RPC = "https://solana-mainnet.g.alchemy.com/v2/alch_6vbKGrFBr9wtbgAc5JZse"; 
const MINT = "68Fya6TgdrYeVDSy2zxsEq8uFxxzEyzMTPhLwM816868";
const TOTAL_SUPPLY = 686_868_686n;

// ========================================
// CONNECTION
// ========================================
const connection = new Connection(RPC, "confirmed");

// ========================================
// WALLET
// ========================================
const walletSecret = Uint8Array.from(
  JSON.parse(fs.readFileSync("./keypair.json", "utf8"))
);
const wallet = Keypair.fromSecretKey(walletSecret);

const mint = new PublicKey(MINT);

// ========================================
// INFO
// ========================================
console.log("\n================================");
console.log("财神DAO God Of Fortune $财神DAO");
console.log("================================");
console.log("Wallet:", wallet.publicKey.toBase58());
console.log("Mint:", mint.toBase58());
console.log("Target Supply:", TOTAL_SUPPLY.toString(), "财神DAO");
console.log("================================\n");

// ========================================
// 检查 Mint
// ========================================
const mintInfo = await getMint(connection, mint);
console.log("Decimals:", mintInfo.decimals);
console.log("Mint Authority:", mintInfo.mintAuthority?.toBase58() ?? "null");
console.log("Current Supply:", mintInfo.supply.toString(), "\n");

if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(wallet.publicKey)) {
  throw new Error("❌ 当前钱包不是 Mint Authority");
}

// ========================================
// 计算 Base Units
// ========================================
const decimals = BigInt(mintInfo.decimals);
const multiplier = 10n ** decimals;
const amount = TOTAL_SUPPLY * multiplier;
console.log("Mint Amount:", amount.toString(), "\n");

// ========================================
// 创建 ATA
// ========================================
console.log("正在创建 / 获取 ATA...");
const tokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet,
  mint,
  wallet.publicKey
);
console.log("\nATA:", tokenAccount.address.toBase58(), "\n");

// ========================================
// 检查当前余额
// ========================================
const before = await getAccount(connection, tokenAccount.address);
console.log("当前 ATA 余额:", before.amount.toString(), "\n");

// ========================================
// 需要铸造多少
// ========================================
if (before.amount >= amount) {
  console.log("⚠️ 目标供应量已经存在，跳过铸造。\n");
} else {
  const remaining = amount - before.amount;
  console.log("本次铸造:", remaining.toString(), "base units\n");
  console.log("正在铸造...");
  const signature = await mintTo(
    connection,
    wallet,
    mint,
    tokenAccount.address,
    wallet,
    remaining
  );
  console.log("\n================================");
  console.log("🎉 铸造成功！");
  console.log("================================");
  console.log("Mint TX:", signature);
  console.log("================================\n");
}

// ========================================
// 放弃 Mint Authority (增加 try-catch 保护)
// ========================================
const latestMint = await getMint(connection, mint);
if (latestMint.mintAuthority && latestMint.mintAuthority.equals(wallet.publicKey)) {
  console.log("正在放弃 Mint Authority...");
  try {
    const revokeSig = await setAuthority(
      connection,
      wallet,
      mint,
      wallet,
      AuthorityType.MintTokens,
      null
    );
    console.log("\n================================");
    console.log("✅ Mint Authority 已放弃");
    console.log("Revoke TX:", revokeSig);
    console.log("================================\n");
  } catch (error) {
    console.log("❌ 放弃 Mint Authority 失败，请检查原因:");
    console.log(error, "\n");
  }
} else {
  console.log("ℹ️ Mint Authority 已不是当前钱包，跳过。\n");
}

// ========================================
// 放弃 Update Authority (Umi 框架)
// ========================================
console.log("================================");
console.log("正在放弃 Update Authority...");
console.log("================================");

// 初始化 Umi
const umi = createUmi(RPC).use(mplTokenMetadata());
const umiWallet = umi.eddsa.createKeypairFromSecretKey(walletSecret);
umi.use(keypairIdentity(umiWallet));
const umiMint = publicKey(MINT);

try {
  const updateTx = await updateV1(umi, {
    mint: umiMint,
    newUpdateAuthority: null, // 置空更新权限
  }).sendAndConfirm(umi);

  console.log("✅ Update Authority 已永久放弃");
  console.log("TX:", updateTx.signature.toString());
  console.log("================================\n");
} catch (error) {
  console.log("❌ 放弃 Update Authority 失败，请检查原因:");
  console.log(error, "\n");
}

// ========================================
// 最终检查
// ========================================
const finalMint = await getMint(connection, mint);
const finalAccount = await getAccount(connection, tokenAccount.address);

console.log("最终结果");
console.log("--------------------------------");
console.log("Total Supply:", finalMint.supply.toString());
console.log("Wallet Balance:", finalAccount.amount.toString());
console.log("Decimals:", finalMint.decimals);
console.log("Mint Authority:", finalMint.mintAuthority?.toBase58() ?? "null (已放弃)");
console.log("--------------------------------");

const humanSupply = finalMint.supply / multiplier;
console.log("Human Supply:", humanSupply.toLocaleString(), "财神DAO");
console.log("================================\n");
