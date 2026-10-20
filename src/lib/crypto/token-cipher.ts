import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for OAuth tokens at rest (google_tokens). Format: v1.<iv>.<tag>.<ciphertext>, base64url.
// The key is TOKEN_ENCRYPTION_KEY (32 random bytes, base64). A database leak alone exposes nothing.
const VERSION = 'v1';

function keyFrom(base64Key: string | undefined): Buffer {
  const key = Buffer.from(base64Key ?? '', 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).');
  return key;
}

export function encryptToken(plaintext: string, base64Key: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptToken(sealed: string, base64Key: string | undefined): string {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Unrecognized token format');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(base64Key), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
