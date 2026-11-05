// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decodeEncryptedStream,
  decryptChunk,
  encodeEncryptedBlob,
  encryptChunk,
  generateContentKey,
  generateDeviceKeyPair,
  importDevicePrivateKey,
  isEncryptedFallbackUrl,
  openContentKey,
  sealContentKey,
  sha256Hex,
  type EncodedFileShape
} from './fallback-crypto';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array): string => new TextDecoder().decode(data);

const shape: EncodedFileShape = {
  contentHash: 'a'.repeat(64),
  size: 100_000,
  chunkSize: 64 * 1024
};

describe('fallback-crypto', () => {
  it('设备密钥对：生成后能导入私钥，公钥可重复导出', async () => {
    const pair = await generateDeviceKeyPair();
    expect(pair.publicKeyBase64).toMatch(/^[A-Za-z0-9_-]+$/);
    const privateKey = await importDevicePrivateKey(pair.privateKeyJwk);
    expect(privateKey.type).toBe('private');
  });

  it('信封：接收方用自己的私钥能解出内容密钥，无关设备解不开', async () => {
    const [, recipient, stranger] = await Promise.all([
      generateDeviceKeyPair(),
      generateDeviceKeyPair(),
      generateDeviceKeyPair()
    ]);
    const contentKey = await generateContentKey();
    const envelope = await sealContentKey(contentKey, recipient.publicKeyBase64);
    expect(envelope.kid).toBe('p256-1');
    expect(envelope.ct).not.toContain('plaintext');

    const opened = await openContentKey(envelope, await importDevicePrivateKey(recipient.privateKeyJwk));
    const sealed = await encryptChunk(opened, shape, 0, bytes('hello encrypted fallback'));
    expect(text(await decryptChunk(opened, shape, 0, sealed))).toBe('hello encrypted fallback');

    await expect(openContentKey(envelope, await importDevicePrivateKey(stranger.privateKeyJwk))).rejects.toThrow();
  });

  it('分块 AAD：块号与内容哈希都参与校验，乱序块与跨文件块被拒', async () => {
    const key = await generateContentKey();
    const chunk = await encryptChunk(key, shape, 3, bytes('chunk three'));
    expect(text(await decryptChunk(key, shape, 3, chunk))).toBe('chunk three');
    await expect(decryptChunk(key, shape, 4, chunk)).rejects.toThrow();
    await expect(decryptChunk(key, { ...shape, contentHash: 'b'.repeat(64) }, 3, chunk)).rejects.toThrow();
  });

  it('分块密文被篡改：AEAD 校验失败，不解出错误字节', async () => {
    const key = await generateContentKey();
    const chunk = await encryptChunk(key, shape, 0, bytes('integrity'));
    chunk[12] = (chunk[12] as number) ^ 0xff;
    await expect(decryptChunk(key, shape, 0, chunk)).rejects.toThrow();
  });

  it('封装：密文流以魔数开头，解密流与原文逐字节一致，encHash 是 64 位 hex', async () => {
    const key = await generateContentKey();
    const plaintext = new Uint8Array(shape.size);
    for (let offset = 0; offset < plaintext.length; offset += 65_536) {
      crypto.getRandomValues(plaintext.subarray(offset, offset + 65_536));
    }
    const readChunk = async (offset: number, size: number): Promise<Uint8Array> =>
      plaintext.slice(offset, offset + size);
    const blob = await encodeEncryptedBlob(key, shape, readChunk);
    const blobBytes = new Uint8Array(await blob.arrayBuffer());
    expect(text(blobBytes.slice(0, 8))).toBe('POOLENC1');

    const decoded = decodeEncryptedStream(key, shape, blob.stream());
    const restored = new Uint8Array(await new Response(decoded).arrayBuffer());
    expect(restored.byteLength).toBe(plaintext.byteLength);
    expect(restored).toEqual(plaintext);

    const encHash = await sha256Hex(await blob.arrayBuffer());
    expect(encHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('密文整体被截断：流式解码报错，不产出半个明文块', async () => {
    const key = await generateContentKey();
    const blob = await encodeEncryptedBlob(key, shape, async (offset, size) =>
      new Uint8Array(size).fill(offset === 0 ? 7 : 0)
    );
    const full = new Uint8Array(await blob.arrayBuffer());
    const truncated = new Response(full.slice(0, full.byteLength - 10)).body as ReadableStream<Uint8Array>;
    const decoded = decodeEncryptedStream(key, shape, truncated);
    await expect(new Response(decoded).arrayBuffer()).rejects.toThrow();
  });

  it('上游整包单块输出（浏览器 fetch 的常见行为）：多余字节进缓冲，逐块解密不受影响', async () => {
    const key = await generateContentKey();
    const realShape: EncodedFileShape = { contentHash: 'c'.repeat(64), size: 1024 * 1024, chunkSize: 48 * 1024 };
    const plaintext = new Uint8Array(realShape.size);
    for (let offset = 0; offset < plaintext.length; offset += 65_536) {
      crypto.getRandomValues(plaintext.subarray(offset, offset + 65_536));
    }
    const blob = await encodeEncryptedBlob(key, realShape, async (offset, size) =>
      plaintext.slice(offset, offset + size)
    );
    const blobBytes = new Uint8Array(await blob.arrayBuffer());
    const singleChunk = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(blobBytes);
        controller.close();
      }
    });
    const restored = new Uint8Array(
      await new Response(decodeEncryptedStream(key, realShape, singleChunk)).arrayBuffer()
    );
    expect(restored.byteLength).toBe(plaintext.byteLength);
    expect(await sha256Hex(restored.buffer as ArrayBuffer)).toBe(await sha256Hex(plaintext.buffer as ArrayBuffer));
  });

  it('回退地址判定：/api/files/enc/ 是密文回退，/api/files/ 明文不是', () => {
    expect(isEncryptedFallbackUrl('/api/files/enc/abc123')).toBe(true);
    expect(isEncryptedFallbackUrl('/api/files/abc123')).toBe(false);
  });
});
