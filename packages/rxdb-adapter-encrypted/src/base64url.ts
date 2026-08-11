import { EncryptedDecryptError } from './errors.js';

export function toBase64Url(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join('')).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function fromBase64Url(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const fullyPadded = pad === 0 ? padded : padded + '='.repeat(4 - pad);
  let bin: string;
  try {
    bin = atob(fullyPadded);
  } catch {
    throw new EncryptedDecryptError({
      code: 'malformed_envelope',
      message: 'envelope segment is not valid base64url'
    });
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
