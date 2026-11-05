/**
 * 服务器回退内容加密（POOL-US-101）：客户端加密后上传 R2，服务器全程只接触密文与信封。
 *
 * @remarks
 * - 每文件独立内容密钥（AES-256-GCM），文件按清单块尺寸分块加密，`contentHash + chunkIndex` 进 AAD：
 *   乱序块、跨文件块与篡改都在解密期被拒，重传的单块可独立解密（与 rxdb:US-705 的分块/续传契约对齐）。
 * - 内容密钥经 ephemeral-static ECDH（P-256，WebCrypto 原生）封装成信封，只发给有权接收的设备；
 *   私钥只留在本机，公钥登记进设备表。
 * - 密文封装格式：`POOLENC1`（8 字节魔数）+ 1 字节版本 + 每块 `iv(12) || ct || tag(16)`；
 *   块边界由清单的 `size / chunkSize` 推出，不另存表。
 */
/** 内容密钥的信封：经服务器盲传，只有收件设备的私钥能解开。 */
export interface FallbackEnvelope {
  /** 密钥算法标识（`FALLBACK_KID`）。 */
  readonly kid: string;
  /** 发送方一次性 ECDH 公钥（SPKI base64url）。 */
  readonly epk: string;
  /** 包封密钥的 GCM IV（base64）。 */
  readonly iv: string;
  /** 内容密钥密文（base64）。 */
  readonly ct: string;
  /** 包封密钥的 GCM tag（base64）。 */
  readonly tag: string;
}

/** 密文文件的分块形状：由清单行提供，块边界与明文完全一致。 */
export interface EncodedFileShape {
  readonly contentHash: string;
  readonly size: number;
  readonly chunkSize: number;
}

import { FALLBACK_ENCODING_HEADER, FALLBACK_ENCODING_VERSION } from '../../../shared/fallback-encoding';

export { FALLBACK_ENCODING_HEADER, FALLBACK_ENCODING_VERSION };

/** 设备密钥对的算法标识；信封 `kid` 写它，轮换时换号。 */
export const FALLBACK_KID = 'p256-1';
/** 密文封装魔数（8 字节）。 */
export const ENC_MAGIC = 'POOLENC1';
/** 密文封装版本（1 字节）。 */
export const ENC_VERSION = 1;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ALGORITHM = { name: 'ECDH', namedCurve: 'P-256' } as const;
const KEY_USAGES = ['deriveBits'] as const;
const CONTENT_ALGORITHM = 'AES-GCM';
const CONTENT_KEY_BITS = 256;

const b64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const unb64 = (value: string): Uint8Array<ArrayBuffer> =>
  bytesOf(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0)));

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

/** 构造自有 `ArrayBuffer` 的字节数组：TS 6 的 `Uint8Array<ArrayBufferLike>` 进不了 WebCrypto 的 `BufferSource`。 */
const bytesOf = (values: ArrayLike<number>): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(values.length));
  out.set(values);
  return out;
};

/** 拼接成自有 `ArrayBuffer` 的字节数组。 */
const concatBytes = (...chunks: readonly ArrayLike<number>[]): Uint8Array<ArrayBuffer> => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

/** 每块的 AAD：内容哈希 + 块号（4 字节大端），块号错位或跨文件重放都在解密期被拒。 */
const chunkAad = (contentHash: string, chunkIndex: number): Uint8Array<ArrayBuffer> => {
  const aad = new Uint8Array(contentHash.length + 4);
  aad.set(new TextEncoder().encode(contentHash), 0);
  new DataView(aad.buffer).setUint32(contentHash.length, chunkIndex);
  return aad;
};

/** 本机生成的设备密钥对：私钥以 JWK 导出（只存本机），公钥以 SPKI base64url 登记进设备表。 */
export interface DeviceKeyPair {
  readonly publicKeyBase64: string;
  readonly privateKeyJwk: JsonWebKey;
}

/** 生成设备密钥对（ECDH P-256）。 */
export const generateDeviceKeyPair = async (): Promise<DeviceKeyPair> => {
  const pair = (await subtle().generateKey(KEY_ALGORITHM, true, KEY_USAGES)) as CryptoKeyPair;
  const [publicRaw, privateKeyJwk] = await Promise.all([
    subtle().exportKey('spki', pair.publicKey),
    subtle().exportKey('jwk', pair.privateKey)
  ]);
  return { publicKeyBase64: b64(publicRaw), privateKeyJwk };
};

/** 由 JWK 导回本机私钥。 */
export const importDevicePrivateKey = (jwk: JsonWebKey): Promise<CryptoKey> =>
  subtle().importKey('jwk', jwk, KEY_ALGORITHM, true, KEY_USAGES);

/** 由 SPKI base64url 导入他设备的公钥（用于封装信封）。 */
export const importDevicePublicKey = (spkiBase64: string): Promise<CryptoKey> =>
  subtle().importKey('spki', unb64(spkiBase64), KEY_ALGORITHM, true, []);

/** 生成一个文件的内容密钥（AES-256-GCM）。 */
export const generateContentKey = (): Promise<CryptoKey> =>
  subtle().generateKey({ name: CONTENT_ALGORITHM, length: CONTENT_KEY_BITS }, true, ['encrypt', 'decrypt']);

/**
 * 用接收设备的公钥把内容密钥封装成信封（ephemeral-static ECDH + AES-256-GCM 包封）。
 * 信封可以经服务器盲传：没有接收方私钥谁也解不开。
 */
export const sealContentKey = async (
  contentKey: CryptoKey,
  recipientPublicKeyBase64: string
): Promise<FallbackEnvelope> => {
  const recipientKey = await importDevicePublicKey(recipientPublicKeyBase64);
  const ephemeral = (await subtle().generateKey(KEY_ALGORITHM, true, KEY_USAGES)) as CryptoKeyPair;
  const [rawKey, rawEpk] = await Promise.all([
    subtle().deriveBits({ name: 'ECDH', public: recipientKey }, ephemeral.privateKey, 256),
    subtle().exportKey('spki', ephemeral.publicKey)
  ]);
  const wrappingKey = await subtle().importKey('raw', rawKey, CONTENT_ALGORITHM, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const rawContentKey = await subtle().exportKey('raw', contentKey);
  const sealed = await subtle().encrypt({ name: CONTENT_ALGORITHM, iv }, wrappingKey, rawContentKey);
  const ciphertext = new Uint8Array(sealed);
  return {
    kid: FALLBACK_KID,
    epk: b64(rawEpk),
    iv: b64(iv.buffer as ArrayBuffer),
    ct: b64(ciphertext.slice(0, -TAG_BYTES).buffer as ArrayBuffer),
    tag: b64(ciphertext.slice(-TAG_BYTES).buffer as ArrayBuffer)
  };
};

/** 用本机私钥解开信封，取回内容密钥。信封不是给本设备的，或字段被篡改过，都会抛错。 */
export const openContentKey = async (envelope: FallbackEnvelope, privateKey: CryptoKey): Promise<CryptoKey> => {
  if (envelope.kid !== FALLBACK_KID) throw new Error(`unknown envelope kid ${envelope.kid}`);
  const ephemeralKey = await importDevicePublicKey(envelope.epk);
  const rawKey = await subtle().deriveBits({ name: 'ECDH', public: ephemeralKey }, privateKey, 256);
  const wrappingKey = await subtle().importKey('raw', rawKey, CONTENT_ALGORITHM, false, ['decrypt']);
  const sealed = concatBytes(unb64(envelope.ct), unb64(envelope.tag));
  const rawContentKey = await subtle().decrypt(
    { name: CONTENT_ALGORITHM, iv: unb64(envelope.iv) },
    wrappingKey,
    sealed
  );
  return subtle().importKey('raw', rawContentKey, CONTENT_ALGORITHM, false, ['encrypt', 'decrypt']);
};

/** 加密一个明文块：`iv(12) || ct || tag(16)`。 */
export const encryptChunk = async (
  key: CryptoKey,
  shape: EncodedFileShape,
  chunkIndex: number,
  plaintext: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await subtle().encrypt(
    { name: CONTENT_ALGORITHM, iv, additionalData: chunkAad(shape.contentHash, chunkIndex) },
    key,
    plaintext
  );
  return concatBytes(iv, new Uint8Array(sealed));
};

/** 解密一个密文块；块号错位、跨文件重放或密文被篡改都会抛错。 */
export const decryptChunk = async (
  key: CryptoKey,
  shape: EncodedFileShape,
  chunkIndex: number,
  encoded: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> => {
  if (encoded.byteLength < IV_BYTES + TAG_BYTES) throw new Error('fallback encryption: chunk is too short');
  return new Uint8Array(
    await subtle().decrypt(
      {
        name: CONTENT_ALGORITHM,
        iv: encoded.slice(0, IV_BYTES),
        additionalData: chunkAad(shape.contentHash, chunkIndex)
      },
      key,
      encoded.slice(IV_BYTES)
    )
  );
};

/** 第 `index` 块明文长度：最后一块按剩余字节。 */
const chunkLength = (shape: EncodedFileShape, index: number): number =>
  Math.min(shape.chunkSize, shape.size - index * shape.chunkSize);

const chunkCount = (shape: EncodedFileShape): number => Math.ceil(shape.size / shape.chunkSize);

/** 密文文件的整体字节数（魔数 + 版本 + 每块 iv/ct/tag）。 */
export const encodedSize = (shape: EncodedFileShape): number =>
  ENC_MAGIC.length + 1 + chunkCount(shape) * (IV_BYTES + TAG_BYTES) + shape.size;

/** 把明文文件封装成密文 Blob，返回后调用方算 `encHash`（密文哈希）作为 R2 键。 */
export const encodeEncryptedBlob = async (
  key: CryptoKey,
  shape: EncodedFileShape,
  readChunk: (offset: number, size: number) => Promise<Uint8Array>
): Promise<Blob> => {
  const parts: BlobPart[] = [new TextEncoder().encode(ENC_MAGIC), new Uint8Array([ENC_VERSION])];
  for (let index = 0; index < chunkCount(shape); index += 1) {
    const plaintext = bytesOf(await readChunk(index * shape.chunkSize, chunkLength(shape, index)));
    parts.push(await encryptChunk(key, shape, index, plaintext));
  }
  return new Blob(parts, { type: 'application/octet-stream' });
};

/** 从流里读满 `length` 字节；多余字节留在缓冲里给下一次读，流提前结束时报错。 */
const readExact = (source: ReadableStream<Uint8Array>): ((length: number) => Promise<Uint8Array<ArrayBuffer>>) => {
  const reader = source.getReader();
  let buffer = new Uint8Array(0);
  return async (length: number): Promise<Uint8Array<ArrayBuffer>> => {
    while (buffer.byteLength < length) {
      const { done, value } = await reader.read();
      if (done) throw new Error('fallback encryption: blob ended before all chunks were read');
      const merged = new Uint8Array(new ArrayBuffer(buffer.byteLength + value.byteLength));
      merged.set(buffer);
      merged.set(value, buffer.byteLength);
      buffer = merged;
    }
    const out = buffer.slice(0, length);
    buffer = buffer.slice(length);
    return out;
  };
};

/**
 * 把密文流解成明文流：按块边界切出 `iv(12) || ct || tag(16)` 逐块解密。
 * 魔数、版本或任何一块对不上都会让流报错，不产出半个明文块。
 */
export const decodeEncryptedStream = (
  key: CryptoKey,
  shape: EncodedFileShape,
  source: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> => {
  let chunksRead = 0;
  const decoder = new TextDecoder();
  const readExactFrom = readExact(source);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (chunksRead === 0) {
        const header = await readExactFrom(ENC_MAGIC.length + 1);
        if (decoder.decode(header.subarray(0, ENC_MAGIC.length)) !== ENC_MAGIC) {
          throw new Error('fallback encryption: not an encrypted fallback blob');
        }
        if (header[ENC_MAGIC.length] !== ENC_VERSION) {
          throw new Error(`fallback encryption: unsupported blob version ${header[ENC_MAGIC.length]}`);
        }
      }
      if (chunksRead >= chunkCount(shape)) {
        controller.close();
        return;
      }
      const encoded = await readExactFrom(IV_BYTES + chunkLength(shape, chunksRead) + TAG_BYTES);
      controller.enqueue(await decryptChunk(key, shape, chunksRead, encoded));
      chunksRead += 1;
    },
    cancel(reason) {
      return source.cancel(reason);
    }
  });
};

/** 密文回退地址：`/api/files/enc/<密文哈希>`。 */
export const fallbackEncUrl = (encHash: string): string => `/api/files/enc/${encHash}`;

/** 是不是密文回退地址（明文回退是 `/api/files/<内容哈希>`）。 */
export const isEncryptedFallbackUrl = (url: string): boolean => url.includes('/api/files/enc/');

/** 字节数组的 SHA-256（小写 hex）。 */
export const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
  const digest = await subtle().digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
