import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys/node';
import fs from 'fs';

// 1. 初始化 Umi，连接 Devnet
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

// 4. 直接使用已上传的图片 URI（避免重复上传）
const imageUri = 'https://gateway.irys.xyz/4U8aoCZoFPSLHqCGurZJGXgFFppJXsDvYdkdU5zsNNmg';

// 5. 组装完整元数据 JSON 并上传
const metadataUri = await umi.uploader.uploadJson({
  name: '财神到 God Of Fortune',
  symbol: '财神DAO',
  description: '一枚属于社区的财神主题 Meme',
  image: imageUri,
  external_url: 'https://caishendao.world',   // 指向项目官网或代币页面
  attributes: [
    { trait_type: '主题', value: '财神' },
    { trait_type: '寓意', value: '招财进宝' },
    { trait_type: '类型', value: 'Meme Token' },
  ],
  properties: {
    files: [
      {
        uri: imageUri,
        type: 'image/png',
      },
    ],
    category: 'image',
  },
});

console.log('元数据 URI:', metadataUri);
