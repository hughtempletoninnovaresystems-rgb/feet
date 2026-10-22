import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
let client: S3Client | undefined;

function getStorage() {
  const region = process.env.AWS_REGION?.trim();
  const bucket = process.env.S3_BUCKET_NAME?.trim();
  if (!region || !bucket) throw new Error("Private media storage is not configured.");
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error("S3 credentials must be configured as a pair.");
  client ??= new S3Client({
    region,
    forcePathStyle: true,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  return { client, bucket };
}

export function isAllowedUpload(mimeType: string, sizeBytes: number) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm"]);
  return allowed.has(mimeType) && Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_UPLOAD_BYTES;
}

export async function createMediaUploadUrl(input: { key: string; mimeType: string; sizeBytes: number }) {
  const { client, bucket } = getStorage();
  const url = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.mimeType,
    ContentLength: input.sizeBytes,
    ServerSideEncryption: "AES256",
    CacheControl: "private, no-store",
  }), { expiresIn: 90 });
  return { url, bucket };
}

export async function inspectMediaObject(key: string) {
  const { client, bucket } = getStorage();
  const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { sizeBytes: object.ContentLength ?? 0, mimeType: object.ContentType ?? "", checksum: object.ChecksumSHA256 ?? null };
}

export async function createMediaReadUrl(key: string) {
  const { client, bucket } = getStorage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseCacheControl: "private, no-store" }), { expiresIn: 60 });
}

export async function deleteMediaObject(key: string) {
  const { client, bucket } = getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
