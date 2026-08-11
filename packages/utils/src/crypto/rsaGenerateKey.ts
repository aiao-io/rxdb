import { base64Encode } from './base64Encode.js';
import { getWebCrypto } from './getWebCrypto.js';

const PUBLIC_KEY = 'PUBLIC KEY';
// PKCS#8（SubjectPrivateKeyInfo）的 RFC 7468 标签就是 `PRIVATE KEY`。
// `RSA PRIVATE KEY` 表示 PKCS#1，与 exportKey('pkcs8') 的正文不符（UTL-026）。
const PRIVATE_KEY = 'PRIVATE KEY';

/** RFC 7468 规定 PEM 正文每行 64 个 base64 字符。 */
const PEM_LINE_WIDTH = 64;

const wrapBase64 = (base64: string): string => {
  const lines: string[] = [];
  for (let index = 0; index < base64.length; index += PEM_LINE_WIDTH) {
    lines.push(base64.slice(index, index + PEM_LINE_WIDTH));
  }
  return lines.join('\n');
};

const toPem = (label: string, base64: string): string =>
  `-----BEGIN ${label}-----\n${wrapBase64(base64)}\n-----END ${label}-----`;

/**
 * 导出加密密钥为指定格式
 * @param key - 要导出的 CryptoKey 对象
 * @param type - 导出格式，默认为 'pkcs8'
 * @returns Base64 编码的密钥字符串
 */
export async function exportCryptoKey(key: CryptoKey, type: Exclude<KeyFormat, 'jwk'> = 'pkcs8') {
  const exported = await getWebCrypto('RSA key export').subtle.exportKey(type, key);
  return base64Encode(exported);
}

/**
 * 生成 RSA 密钥对
 * @param modulusLength - 模数长度，默认 2048，可选值：1024、2048、4096
 * @returns 包含公钥和私钥 PEM 格式字符串的对象
 * @property {string} publicKey - `-----BEGIN PUBLIC KEY-----` 包裹的 SPKI 公钥
 * @property {string} privateKey - `-----BEGIN PRIVATE KEY-----` 包裹的 PKCS#8 私钥
 * @throws {Error} 当环境缺少 Web Crypto API 或密钥生成失败时抛出错误
 * @example
 * const keyPair = await rsaGenerateKey(2048);
 * console.log(keyPair.publicKey);  // PEM 格式的公钥
 * console.log(keyPair.privateKey); // PEM 格式的私钥
 * **注意：** 使用 Web Crypto API 生成 RSA-OAEP 密钥对
 * **注意：** 使用 SHA-256 哈希算法
 * **注意：** 公钥指数固定为 65537 (0x010001)
 * **注意：** 生成的密钥可用于加密和解密操作
 * **注意：** PEM 正文按 RFC 7468 折成 64 列
 * **破坏性变更（UTL-026）：** 私钥标签由 `RSA PRIVATE KEY`（PKCS#1）改为
 * `PRIVATE KEY`（PKCS#8），与 `exportKey('pkcs8')` 的正文一致；DER 内容不变，
 * 只有文本标签与折行变了。已落盘 / 已分发的旧 PEM 无需重新生成，本包的
 * `rsaDecrypt` / `rsaEncrypt` 剥标签导入，新旧文本都能读。
 */
export async function rsaGenerateKey(modulusLength = 2048) {
  const cryptoApi = getWebCrypto('RSA key generation');
  const { publicKey, privateKey } = await cryptoApi.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength, // 可选值为 1024、2048 或 4096
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: { name: 'SHA-256' }
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKeyBase64 = await exportCryptoKey(publicKey, 'spki');
  const privateKeyBase64 = await exportCryptoKey(privateKey, 'pkcs8');
  return {
    publicKey: toPem(PUBLIC_KEY, publicKeyBase64),
    privateKey: toPem(PRIVATE_KEY, privateKeyBase64)
  };
}
