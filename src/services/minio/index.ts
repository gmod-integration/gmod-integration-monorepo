import { S3Client } from '@aws-sdk/client-s3';
import { ConfigMinIO } from '../../classes/config/Config.js';

export const s3 = new S3Client({
  endpoint: ConfigMinIO.endpoint,
  region: ConfigMinIO.region,
  credentials: {
    accessKeyId: ConfigMinIO.accessKey,
    secretAccessKey: ConfigMinIO.secretKey,
  },
  forcePathStyle: true,
});
