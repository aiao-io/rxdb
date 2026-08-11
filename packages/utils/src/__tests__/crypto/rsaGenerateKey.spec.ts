import { createPrivateKey, createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rsaDecrypt } from '../../crypto/rsaDecrypt.js';
import { rsaEncrypt } from '../../crypto/rsaEncrypt.js';
import { rsaGenerateKey } from '../../crypto/rsaGenerateKey.js';

/** 取 PEM 头尾之间的正文行。 */
const bodyLines = (pem: string): string[] => pem.split('\n').slice(1, -1);

// UTL-026：exportKey('pkcs8') 导出的是 PKCS#8 DER，却曾包成 PKCS#1 的
// `-----BEGIN RSA PRIVATE KEY-----` 标签，外部 OpenSSL / Node 会按错误格式解析；
// base64 也没有按 RFC 7468 的 64 列折行。
describe('UTL-026 PEM 标签与折行', () => {
  it('私钥用 PKCS#8 标签，不再用 PKCS#1 的 RSA PRIVATE KEY', async () => {
    const { privateKey } = await rsaGenerateKey(1024);

    expect(privateKey.startsWith('-----BEGIN PRIVATE KEY-----\n')).toBe(true);
    expect(privateKey.endsWith('\n-----END PRIVATE KEY-----')).toBe(true);
    expect(privateKey).not.toContain('RSA PRIVATE KEY');
  });

  it('公钥保持 SPKI 的 PUBLIC KEY 标签', async () => {
    const { publicKey } = await rsaGenerateKey(1024);

    expect(publicKey.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBe(true);
    expect(publicKey.endsWith('\n-----END PUBLIC KEY-----')).toBe(true);
  });

  it('正文按 64 列折行，最后一行不超过 64 列', async () => {
    const { publicKey, privateKey } = await rsaGenerateKey(2048);

    for (const pem of [publicKey, privateKey]) {
      const lines = bodyLines(pem);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.slice(0, -1).every(line => line.length === 64)).toBe(true);
      expect(lines[lines.length - 1].length).toBeGreaterThan(0);
      expect(lines[lines.length - 1].length).toBeLessThanOrEqual(64);
    }
  });

  it('折行后的正文拼回去仍是合法 base64', async () => {
    const { privateKey } = await rsaGenerateKey(1024);
    const joined = bodyLines(privateKey).join('');

    expect(joined).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

// 外部 consumer 验证：用 Node 的 crypto 当第三方解析器。
describe('UTL-026 Node crypto 互操作', () => {
  it('私钥能被 node:crypto 直接解析为 RSA 私钥', async () => {
    const { privateKey } = await rsaGenerateKey(2048);

    const key = createPrivateKey(privateKey);

    expect(key.asymmetricKeyType).toBe('rsa');
    expect(key.type).toBe('private');
  });

  it('公钥能被 node:crypto 直接解析为 RSA 公钥', async () => {
    const { publicKey } = await rsaGenerateKey(2048);

    const key = createPublicKey(publicKey);

    expect(key.asymmetricKeyType).toBe('rsa');
    expect(key.type).toBe('public');
  });

  it('标签声明的格式与正文实际编码逐字节一致', async () => {
    // 不能靠「旧标签会不会报错」来验证：OpenSSL 3 / Node 24 解析 DER 时嗅探结构、
    // 忽略声明的类型（实测 `type: 'pkcs1' | 'sec1'` 喂 PKCS#8 DER 一样成功），
    // 旧的 `RSA PRIVATE KEY` 标签在它们那里**不会**抛错。真正踩坑的是按 `block.Type`
    // 分派解析器的实现（Go 的 pem.Decode + ParsePKCS1PrivateKey、各类 JVM/Python
    // PEM 读取器）。所以这里改为逐字节比对：正文必须等于 PKCS#8 编码、不等于 PKCS#1 编码。
    const { privateKey } = await rsaGenerateKey(1024);
    const body = Buffer.from(bodyLines(privateKey).join(''), 'base64');

    const key = createPrivateKey(privateKey);
    expect(body.equals(key.export({ type: 'pkcs8', format: 'der' }))).toBe(true);
    expect(body.equals(key.export({ type: 'pkcs1', format: 'der' }))).toBe(false);
  });
});

describe('UTL-026 自家收发不受影响', () => {
  it('折行后的 PEM 仍可用于自家加解密往返', async () => {
    const { publicKey, privateKey } = await rsaGenerateKey(2048);

    const cipherText = await rsaEncrypt('折行不影响往返', publicKey);

    await expect(rsaDecrypt(cipherText, privateKey)).resolves.toBe('折行不影响往返');
  });

  it('单行（无折行）的历史 PEM 仍能导入，保持向后兼容', async () => {
    const { publicKey, privateKey } = await rsaGenerateKey(1024);
    const flatten = (pem: string): string =>
      `${pem.split('\n')[0]}\n${bodyLines(pem).join('')}\n${pem.split('\n').at(-1)}`;

    const cipherText = await rsaEncrypt('历史单行 PEM', flatten(publicKey));

    await expect(rsaDecrypt(cipherText, flatten(privateKey))).resolves.toBe('历史单行 PEM');
  });
});
