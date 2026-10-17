import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createGenericFile,
  keypairIdentity,
} from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys/node';
import fs from 'fs';

// 1. 初始化 Umi，连接 Mainnet
const umi = createUmi('https://api.mainnet-beta.solana.com');

// 2. 加载本地钱包密钥对
const walletFile = fs.readFileSync('./keypair.json', 'utf-8');
const secretKey = new Uint8Array(JSON.parse(walletFile));
const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);

// 3. 设置签名身份，并注册 Irys 上传器
umi
  .use(keypairIdentity(keypair))
  .use(
    irysUploader({
      address: 'https://uploader.irys.xyz',
      payer: umi.identity,
    })
  );

// 4. 读取图片并包装
const imageBuffer = fs.readFileSync('./caishen.png');
const umiImageFile = createGenericFile(imageBuffer, 'caishen.png', {
  contentType: 'image/png',
});

// 5. 上传图片，拿到 URI
const [imageUri] = await umi.uploader.upload([umiImageFile]);
console.log('图片 URI:', imageUri);
