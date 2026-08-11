import { base64Decode } from './base64Decode.js';

/**
 * 把 base64url 段解码为 UTF-8 字符串。
 *
 * 必须经 `Uint8Array` + `TextDecoder` 走一趟：`atob` 返回的是 binary string
 * （每个 char 一个字节），直接当文本用会把多字节 UTF-8 序列拆成独立码位 → 中文乱码。
 */
const decodeBase64URL = (value: string): string => {
  const base64 = value.replace(/[-]/g, '+').replace(/[_]/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;
  const bytes = base64Decode(base64 + '='.repeat(paddingLength));
  return new TextDecoder('utf-8').decode(bytes);
};

/**
 * 解码 JWT token 的 payload 段
 *
 * 只做解码，**不校验签名**，因此结果不可用于任何鉴权判断。
 *
 * @template T - 期望的 payload 结构，由调用方声明（默认 `Record<string, unknown>`）
 * @param token - 形如 `header.payload.signature` 的 JWT 字符串
 * @returns 解析后的 payload
 * @throws 结构不是三段时抛 `JWT is not valid: not a JWT structure`
 * @throws base64 或 JSON 解析失败时抛 `JWT payload decode failed: ...`，原始错误挂在 `cause` 上
 * @example
 * interface Claims { sub: string; exp: number }
 * const claims = decodeJWTPayload<Claims>(token);
 * **注意：** payload 按 UTF-8 解码，非 ASCII 声明（中文、emoji）不会乱码
 * **注意：** 返回值未经运行时校验，`T` 只是类型断言
 */
export const decodeJWTPayload = <T = Record<string, unknown>>(token: string): T => {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT is not valid: not a JWT structure');
  const base64Url = parts[1];
  try {
    return JSON.parse(decodeBase64URL(base64Url)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JWT payload decode failed: ${message}`, { cause: error });
  }
};
