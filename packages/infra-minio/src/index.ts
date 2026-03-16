import { CreateBucketCommand, HeadBucketCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { ConfigMinIO } from '@gmod/config/index.js';

export const s3 = new S3Client({
  endpoint: ConfigMinIO.endpoint,
  region: ConfigMinIO.region,
  credentials: {
    accessKeyId: ConfigMinIO.accessKey,
    secretAccessKey: ConfigMinIO.secretKey,
  },
  forcePathStyle: true,
});

// Validate bucket name format
function isValidBucketName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9\-]{1,61}[a-z0-9])?$/.test(name);
}

export async function createBucketIfNotExists(bucketName: string) {
  if (!isValidBucketName(bucketName)) {
    throw new Error(
      `❌ Invalid bucket name: "${bucketName}". Must be 3-63 characters, lowercase, alphanumeric with optional '-' between characters.`,
    );
  }

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch (err: any) {
    const httpCode = err?.$metadata?.httpStatusCode;

    if (err instanceof S3ServiceException) {
      const code = err.name;

      if (code === 'NotFound' || code === 'NoSuchBucket') {
        console.log('🪣 Bucket not found. Creating:', bucketName);
        try {
          await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
          console.log('✅ Bucket created.');
        } catch (createErr: any) {
          console.error('❌ Failed to create bucket:', createErr?.name ?? createErr?.message ?? createErr);
          throw createErr;
        }
      } else if (code === 'BucketAlreadyOwnedByYou') {
        console.log('✅ Bucket already owned by you. Skipping creation.');
      } else if (code === 'BucketAlreadyExists') {
        console.error('🚫 Bucket already exists and is owned by someone else.');
        throw err;
      } else {
        console.error(`❌ S3 error [${code}] (${httpCode})`);
        throw err;
      }
    } else if (httpCode === 400) {
      console.error('❌ HTTP 400 from S3. Possible causes: bucket name invalid, already exists, or bad signature.');
      throw err;
    } else {
      console.error('❌ Unknown error when checking bucket:', err);
      throw err;
    }
  }
}
