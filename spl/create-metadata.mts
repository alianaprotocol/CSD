import fs from "fs";

import {
  keypairIdentity,
  publicKey,
  percentAmount,
} from "@metaplex-foundation/umi";

import {
  createUmi,
} from "@metaplex-foundation/umi-bundle-defaults";

import {
  mplTokenMetadata,
  createV1,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";


// ========================================
// CONFIG
// ========================================

const RPC =
  "https://api.mainnet-beta.solana.com";

const MINT =
  "68Fya6TgdrYeVDSy2zxsEq8uFxxzEyzMTPhLwM816868";

const NAME = "财神到 God Of Fortune";

const SYMBOL = "财神DAO";

const URI =
  "https://gateway.irys.xyz/DuhM4LpDFRod2rytHiNswpVp7zWxAogtKimjA8ZDnWEW";


// ========================================
// UMI
// ========================================

const umi = createUmi(RPC)
  .use(mplTokenMetadata());


// ========================================
// WALLET
// ========================================

const walletSecretKey =
  new Uint8Array(
    JSON.parse(
      fs.readFileSync(
        "./keypair.json",
        "utf8"
      )
    )
  );

const wallet =
  umi.eddsa.createKeypairFromSecretKey(
    walletSecretKey
  );

umi.use(
  keypairIdentity(wallet)
);


// ========================================
// MINT
// ========================================

const mint =
  publicKey(MINT);


// ========================================
// INFO
// ========================================

console.log("");
console.log("================================");
console.log("财神到 $财神到");
console.log("================================");

console.log(
  "Wallet:",
  umi.identity.publicKey.toString()
);

console.log(
  "Mint:",
  mint.toString()
);

console.log("Name:", NAME);
console.log("Symbol:", SYMBOL);
console.log("Decimals: 6");

console.log("");
console.log("Metadata URI:");
console.log(URI);

console.log("================================");
console.log("");


// ========================================
// CREATE METADATA
// ========================================

console.log(
  "正在创建 Metaplex Metadata..."
);

console.log("");

const result =
  await createV1(umi, {

    mint,

    authority:
      umi.identity,

    name: NAME,

    symbol: SYMBOL,

    uri: URI,

    sellerFeeBasisPoints:
      percentAmount(0),

    tokenStandard:
      TokenStandard.Fungible,

  }).sendAndConfirm(umi);


// ========================================
// SUCCESS
// ========================================

console.log("");
console.log("================================");
console.log("✅ Metadata 创建成功！");
console.log("================================");

console.log(
  "Mint:",
  MINT
);

console.log(
  "TX:",
  result.signature.toString()
);

console.log("================================");
