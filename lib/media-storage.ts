import { S3Client } from '@aws-sdk/client-s3';

export const mediaBucket = process.env.S3_BUCKET || '';

export function mediaStorage() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!mediaBucket || !endpoint || !accessKeyId || !secretAccessKey) throw new Error('ASR media storage is not configured');
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });
}
