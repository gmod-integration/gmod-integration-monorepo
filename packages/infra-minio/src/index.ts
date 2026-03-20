import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { ConfigMinIO, ConfigServer } from '@gmod/config'

export const s3 = new S3Client({
  endpoint: ConfigMinIO.endpoint,
  region: ConfigMinIO.region,
  credentials: {
    accessKeyId: ConfigMinIO.accessKey,
    secretAccessKey: ConfigMinIO.secretKey,
  },
  forcePathStyle: true,
})

// Validate bucket name format
function isValidBucketName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9\-]{1,61}[a-z0-9])?$/.test(name)
}

export async function createBucketIfNotExists(bucketName: string) {
  if (!isValidBucketName(bucketName)) {
    throw new Error(
      `❌ Invalid bucket name: "${bucketName}". Must be 3-63 characters, lowercase, alphanumeric with optional '-' between characters.`,
    )
  }

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }))
  } catch (err: any) {
    const httpCode = err?.$metadata?.httpStatusCode

    if (err instanceof S3ServiceException) {
      const code = err.name

      if (code === 'NotFound' || code === 'NoSuchBucket') {
        console.log('🪣 Bucket not found. Creating:', bucketName)
        try {
          await s3.send(new CreateBucketCommand({ Bucket: bucketName }))
          console.log('✅ Bucket created.')
        } catch (createErr: any) {
          console.error('❌ Failed to create bucket:', createErr?.name ?? createErr?.message ?? createErr)
          throw createErr
        }
      } else if (code === 'BucketAlreadyOwnedByYou') {
        console.log('✅ Bucket already owned by you. Skipping creation.')
      } else if (code === 'BucketAlreadyExists') {
        console.error('🚫 Bucket already exists and is owned by someone else.')
        throw err
      } else {
        console.error(`❌ S3 error [${code}] (${httpCode})`)
        throw err
      }
    } else if (httpCode === 400) {
      console.error('❌ HTTP 400 from S3. Possible causes: bucket name invalid, already exists, or bad signature.')
      throw err
    } else {
      console.error('❌ Unknown error when checking bucket:', err)
      throw err
    }
  }
}

export const AVATAR_BUCKET = 'gmi-user-avatars'

export type AvatarProvider = 'discord' | 'steam'

function getAvatarObjectKey(provider: AvatarProvider, id: string): string {
  return `${provider}/${id}`
}

export function getStoredAvatarUrl(provider: AvatarProvider, id: string): string {
  return `${ConfigServer.domain}/avatars/${provider}/${encodeURIComponent(id)}`
}

async function avatarExists(provider: AvatarProvider, id: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: AVATAR_BUCKET,
        Key: getAvatarObjectKey(provider, id),
      }),
    )
    return true
  } catch (error: any) {
    const httpCode = error?.$metadata?.httpStatusCode
    if (error?.name === 'NotFound' || error?.name === 'NoSuchKey' || httpCode === 404) {
      return false
    }

    throw error
  }
}

async function uploadRemoteAvatar(provider: AvatarProvider, id: string, remoteUrl: string): Promise<void> {
  await createBucketIfNotExists(AVATAR_BUCKET)

  const response = await fetch(remoteUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch remote avatar: ${response.status} ${response.statusText}`)
  }

  const body = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') || 'image/webp'

  await s3.send(
    new PutObjectCommand({
      Bucket: AVATAR_BUCKET,
      Key: getAvatarObjectKey(provider, id),
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=3600',
    }),
  )
}

export async function ensureAvatarStored(
  provider: AvatarProvider,
  id: string,
  remoteUrl: string | null | undefined,
): Promise<string | null> {
  if (!remoteUrl) {
    return null
  }

  try {
    if (!(await avatarExists(provider, id))) {
      await uploadRemoteAvatar(provider, id, remoteUrl)
    }

    return getStoredAvatarUrl(provider, id)
  } catch (error) {
    console.error(`Failed to cache ${provider} avatar for ${id}:`, error)
    return remoteUrl
  }
}

export async function replaceStoredAvatar(
  provider: AvatarProvider,
  id: string,
  remoteUrl: string | null | undefined,
): Promise<string | null> {
  if (!remoteUrl) {
    return null
  }

  try {
    await uploadRemoteAvatar(provider, id, remoteUrl)
    return getStoredAvatarUrl(provider, id)
  } catch (error) {
    console.error(`Failed to refresh ${provider} avatar for ${id}:`, error)
    return remoteUrl
  }
}
