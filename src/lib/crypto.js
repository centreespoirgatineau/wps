import { randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/l/I

/** URL-safe random token of `len` unambiguous characters. */
export function token(len = 12) {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export function sessionId() { return randomBytes(32).toString('base64url'); }

/** 6-digit login code as a string, never starting with 0 for readability. */
export function loginCode() { return String(randomInt(100000, 1000000)); }

export function hmac(secret, ...parts) {
  return createHmac('sha256', secret).update(parts.join('|')).digest('hex');
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
