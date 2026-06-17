import { createHash } from 'node:crypto';

// Refresh token sudah high-entropy (signature acak) → SHA-256 cukup, cepat,
// dan menutupi token PENUH (tidak terpotong di 72 byte seperti bcrypt).
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
