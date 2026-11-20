import { randomBytes } from 'node:crypto'

export function generateToken(length: number) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Token length must be a positive integer')
  }

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const charsetLength = characters.length // 62
  const maxUnbiasedByte = 256 - (256 % charsetLength) // 248
  let token = ''

  while (token.length < length) {
    const bytes = randomBytes(length)
    for (let i = 0; i < bytes.length && token.length < length; i++) {
      const value = bytes[i]
      if (value >= maxUnbiasedByte) {
        continue
      }
      token += characters[value % charsetLength]
    }
  }

  return token
}
