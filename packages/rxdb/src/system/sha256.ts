/**
 * @fileoverview 同步 SHA-256（FIPS 180-4），只为提交指纹而存在。
 *
 * @remarks
 * **为什么要自己写一份摘要。** 指纹必须是同步的：`computeChangeUnitFingerprint()`
 * 被工作树捕获路径在写原语内部逐条调用，那里没有 await 的余地；而本仓能拿到的现成实现
 * 没有一个同时满足「同步」与「浏览器 + Node 都能跑」：
 *
 * - `crypto.subtle.digest()` 是 **Promise**，且只在 secure context 里存在；
 * - `node:crypto` 的 `createHash()` 是同步的，但 `packages/rxdb` 要跑在浏览器里；
 * - `@aiao/utils` 的 crypto 一律是 WebCrypto 之上的异步封装。
 *
 * **为什么是 SHA-256 而不是随便一个更短的散列。** 这些指纹会被写进**永不可变**的提交历史：
 * 换算法 = 全库已有 `contentFingerprint` 全部作废。所以要选一个 RFC 冻结、有公开测试向量、
 * 三十年内不会有人想改的。抗碰撞在这里也不是装饰：FR-022 的图校验靠指纹判定篡改，
 * 一个能被构造碰撞的散列等于让篡改检测可被绕过。
 *
 * 实现照抄 FIPS 180-4 §6.2，不做任何「优化」。正确性由
 * `src/__tests__/system/sha256.spec.ts` 用标准向量与 `crypto.subtle.digest()` 对拍保证。
 */

/** FIPS 180-4 §4.2.2 的 64 个轮常量（前 64 个素数立方根小数部分的前 32 位）。 */
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/** FIPS 180-4 §5.3.3 的初始哈希值。每次调用都从它复制一份——共用一个可变数组会让两次调用互相污染。 */
const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

/** 0-255 的两位小写 hex 查表，省掉每字节一次 `padStart`。 */
const HEX_BYTE = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

/** 32 位循环右移。右半边必须是 `>>>`：`>>` 会把符号位铺满高位，输入一旦有最高位就得到另一个函数。 */
const rotateRight = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

/** 把一块 64 字节读成 16 个大端 32 位字（FIPS 180-4 §6.2.2 第 1 步）。 */
const loadBlock = (view: DataView, offset: number, schedule: Uint32Array): void => {
  for (let index = 0; index < 16; index += 1) {
    schedule[index] = view.getUint32(offset + index * 4, false);
  }
};

/** 由前 16 个字展开出后 48 个（FIPS 180-4 §6.2.2 第 1 步）。 */
const expandSchedule = (schedule: Uint32Array): void => {
  for (let index = 16; index < 64; index += 1) {
    const previous = schedule[index - 15];
    const recent = schedule[index - 2];
    const sigma0 = rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
    const sigma1 = rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
    schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) | 0;
  }
};

/** 64 轮压缩，就地更新 `state`（FIPS 180-4 §6.2.2 第 2–4 步）。 */
const compressBlock = (state: Uint32Array, schedule: Uint32Array): void => {
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];

  for (let index = 0; index < 64; index += 1) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choose = (e & f) ^ (~e & g);
    const temp1 = (h + sum1 + choose + ROUND_CONSTANTS[index] + schedule[index]) | 0;
    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (sum0 + majority) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + temp1) | 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) | 0;
  }

  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
  state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0;
  state[7] = (state[7] + h) | 0;
};

/**
 * 按 FIPS 180-4 §5.1.1 补位：追加一个 `0x80`、若干 `0x00`，末尾八字节是大端比特长度。
 *
 * @param message - 原始消息
 * @returns 新分配的、长度为 64 整数倍的缓冲；入参不被改动
 *
 * @remarks
 * 比特长度写成 hi/lo 两个 32 位字而不是一个 `Number`：`length << 3` 在消息超过 256 MiB 时
 * 会溢出 int32 并翻成负数，而 `ToUint32` 的模 2^32 语义恰好给出正确的低位字。
 */
const padMessage = (message: Uint8Array): Uint8Array => {
  // +9 = 1 字节 0x80 + 8 字节长度；不够一整块时必须自己再开一块。
  const padded = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(message.length / 0x20000000), false);
  view.setUint32(padded.length - 4, (message.length * 8) >>> 0, false);
  return padded;
};

/**
 * 算一段字节的 SHA-256。
 *
 * @param message - 待摘要的字节；**不会**被改动
 * @returns 64 位小写 hex
 *
 * @remarks
 * 同步、无状态、可重入：每次调用自带状态数组与消息调度表，两次并发调用互不影响。
 *
 * 入参是**字节**不是字符串：字符串要先经 `TextEncoder` 定死编码，否则同一段文本在不同
 * 调用点可能按不同编码入摘要。
 */
export const sha256Hex = (message: Uint8Array): string => {
  const padded = padMessage(message);
  const view = new DataView(padded.buffer);
  const state = Uint32Array.from(INITIAL_STATE);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    loadBlock(view, offset, schedule);
    expandSchedule(schedule);
    compressBlock(state, schedule);
  }

  let hex = '';
  for (const word of state) {
    hex += HEX_BYTE[(word >>> 24) & 0xff] + HEX_BYTE[(word >>> 16) & 0xff];
    hex += HEX_BYTE[(word >>> 8) & 0xff] + HEX_BYTE[word & 0xff];
  }
  return hex;
};
