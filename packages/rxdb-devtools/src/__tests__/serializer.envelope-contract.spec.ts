/**
 * @fileoverview RDT-015：devtools 内联的信封正则 vs. `@aiao/rxdb-adapter-encrypted` 的权威实现。
 *
 * @remarks
 * devtools 会被所有消费者装上，把加密适配器拖进它的运行时依赖图不可接受，
 * 所以 `serializer.ts` 里刻意留了一份正则副本。代价是两份定义会漂移 ——
 * 漂移的两个方向都很坏：
 *
 * - 副本比权威**严**：新版本密文不再被识别，遮罩退化成明文广播；
 * - 副本比权威**松**：`1|A1|b|c||d` 这类普通业务字符串被当密文吃掉，
 *   调试工具吞掉了要调试的数据。
 *
 * 本文件把 `@aiao/rxdb-adapter-encrypted` 作为**仅 devDependency** 引入，
 * 用权威实现真实产出的信封与它明确拒绝的相似串双向对拍这份副本。
 */
import type { CryptoEnvelope } from '@aiao/rxdb-adapter-encrypted';
import { encodeEnvelope, ENVELOPE_ALG, ENVELOPE_VERSION, isEnvelope } from '@aiao/rxdb-adapter-encrypted';
import { describe, expect, it } from 'vitest';
import { serializeDevToolsValue } from '../serializer.js';

const MASKED = '[encrypted]';

/** 权威实现声明的段长：kid 8 字节、iv 12 字节、tag 16 字节。 */
const KID_BYTES = 8;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function bytes(length: number, seed: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 31 + seed) % 256);
}

function toBase64Url(source: Uint8Array): string {
  return globalThis
    .btoa(String.fromCharCode(...source))
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** 用权威 codec 造一个真实信封文本。 */
function realEnvelope(ciphertextLength: number, seed = 0): string {
  const env: CryptoEnvelope = {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG,
    kid: toBase64Url(bytes(KID_BYTES, seed)),
    iv: bytes(IV_BYTES, seed + 1),
    ct: bytes(ciphertextLength, seed + 2),
    tag: bytes(TAG_BYTES, seed + 3)
  };
  return encodeEnvelope(env);
}

describe('serializer envelope contract', () => {
  it('MUST agree with the authoritative ENVELOPE_VERSION and ENVELOPE_ALG', () => {
    // 副本里的 `[12]` / `AGCM256` 是硬编码的。上游一旦递增版本或换算法，
    // 这两条断言先红，提醒同步 serializer.ts 的正则 —— 而不是等到线上广播明文。
    expect(ENVELOPE_VERSION).toBeLessThanOrEqual(2);
    expect(ENVELOPE_ALG).toBe('AGCM256');
  });

  it.each([
    ['空密文', 0],
    ['单字节密文', 1],
    ['短密文', 16],
    ['长密文', 512]
  ])('MUST mask a real envelope produced by the authority (%s)', (_label, ciphertextLength) => {
    const envelope = realEnvelope(ciphertextLength);

    // 先确认夹具确实是权威实现认可的信封，否则下一条断言测的是个假样本。
    expect(isEnvelope(envelope)).toBe(true);
    expect(serializeDevToolsValue(envelope)).toBe(MASKED);
  });

  it('MUST mask real envelopes nested in objects and arrays', () => {
    const envelope = realEnvelope(32, 7);
    const value = { ssn: envelope, history: [envelope, 'plain'], nested: { phone: envelope } };

    expect(serializeDevToolsValue(value)).toEqual({
      ssn: MASKED,
      history: [MASKED, 'plain'],
      nested: { phone: MASKED }
    });
  });

  it.each([
    ['六段但每段都太短', '1|A1|b|c||d'],
    ['版本号超出保留范围', '3|AGCM256|aaaaaaaaaaa|bbbbbbbbbbbbbbbb|cc|dddddddddddddddddddddd'],
    ['算法标签不对', '2|AGCM128|aaaaaaaaaaa|bbbbbbbbbbbbbbbb|cc|dddddddddddddddddddddd'],
    ['kid 少一个字符', '2|AGCM256|aaaaaaaaaa|bbbbbbbbbbbbbbbb|cc|dddddddddddddddddddddd'],
    ['iv 多一个字符', '2|AGCM256|aaaaaaaaaaa|bbbbbbbbbbbbbbbbb|cc|dddddddddddddddddddddd'],
    ['tag 少一个字符', '2|AGCM256|aaaaaaaaaaa|bbbbbbbbbbbbbbbb|cc|ddddddddddddddddddddd'],
    ['段里混入非 base64url 字符', '2|AGCM256|aaaaaaaaaa+|bbbbbbbbbbbbbbbb|cc|dddddddddddddddddddddd'],
    ['七段', '2|AGCM256|aaaaaaaaaaa|bbbbbbbbbbbbbbbb|cc|dddddddddddddddddddddd|extra'],
    ['业务里常见的管道分隔串', 'user|profile|avatar|png|256|v2']
  ])('MUST NOT mask a near-miss the authority rejects (%s)', (_label, text) => {
    // 权威实现拒绝 = 它不是密文 = devtools 必须原样透出。
    expect(isEnvelope(text)).toBe(false);
    expect(serializeDevToolsValue(text)).toBe(text);
  });

  it('MUST leave the surrounding document intact while masking only the envelope field', () => {
    const envelope = realEnvelope(8, 3);
    const document = { id: 'u-1', name: 'Ada', ssn: envelope, age: 36 };

    expect(serializeDevToolsValue(document)).toEqual({ id: 'u-1', name: 'Ada', ssn: MASKED, age: 36 });
  });
});
