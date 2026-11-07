import { requireCondition } from './errors.js';

export function encodeBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join(''));
}

export function decodedByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : Number(value.endsWith('='));
  requireCondition(
    value.length % 4 === 0 && !/[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding)),
    'INVALID',
    '文件字节不是有效 base64'
  );
  return (value.length / 4) * 3 - padding;
}

export function decodeBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(decodedByteLength(value));
  const binary = atob(value);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeText(value: string): string {
  return encodeBytes(new TextEncoder().encode(value));
}

export function decodeText(value: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(decodeBytes(value));
}

export async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}
