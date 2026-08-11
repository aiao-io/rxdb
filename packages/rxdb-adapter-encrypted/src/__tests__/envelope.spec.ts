import { describe, expect, it } from 'vitest';
import {
  buildAAD,
  decodeEnvelope,
  encodeEnvelope,
  ENVELOPE_ALG,
  ENVELOPE_VERSION,
  isEnvelope,
  type CryptoEnvelope
} from '../envelope.js';
import { EncryptedDecryptError } from '../errors.js';

const SAMPLE_IV = new Uint8Array(12).map((_, i) => i + 1);
const SAMPLE_TAG = new Uint8Array(16).map((_, i) => i + 100);
const SAMPLE_CT = new Uint8Array([1, 2, 3, 4, 5]);
const SAMPLE_KID = 'AAECAwQFBgc'; // 8 字节的 base64url

const sample = (): CryptoEnvelope => ({
  v: ENVELOPE_VERSION,
  alg: ENVELOPE_ALG,
  kid: SAMPLE_KID,
  iv: SAMPLE_IV,
  ct: SAMPLE_CT,
  tag: SAMPLE_TAG
});

describe('envelope.encodeEnvelope / decodeEnvelope', () => {
  it('round-trips losslessly', () => {
    const env = sample();
    const text = encodeEnvelope(env);
    const out = decodeEnvelope(text);
    expect(out.v).toBe(env.v);
    expect(out.alg).toBe(env.alg);
    expect(out.kid).toBe(env.kid);
    expect(Array.from(out.iv)).toEqual(Array.from(env.iv));
    expect(Array.from(out.ct)).toEqual(Array.from(env.ct));
    expect(Array.from(out.tag)).toEqual(Array.from(env.tag));
  });

  it('emits exactly six pipe-separated segments', () => {
    const text = encodeEnvelope(sample());
    expect(text.split('|')).toHaveLength(6);
  });

  it('encodes version as decimal integer and alg as AGCM256', () => {
    const [v, alg] = encodeEnvelope(sample()).split('|');
    expect(v).toBe('2');
    expect(alg).toBe('AGCM256');
  });

  it.each([
    ['empty', ''],
    ['too few segments', '1|AGCM256|kid|iv|ct'],
    ['too many segments', '1|AGCM256|kid|iv|ct|tag|extra'],
    ['non-numeric version', 'X|AGCM256|kid|AAAAAAAAAAAAAAAAAAA|AA|AAAAAAAAAAAAAAAAAAAAAA']
  ])('throws malformed_envelope on %s', (_, text) => {
    let err: unknown;
    try {
      decodeEnvelope(text);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EncryptedDecryptError);
    expect((err as EncryptedDecryptError).code).toBe('malformed_envelope');
  });

  it('throws unsupported_version on unknown version', () => {
    const text = encodeEnvelope(sample()).replace(/^2/, '3');
    expect(() => decodeEnvelope(text)).toThrow(expect.objectContaining({ code: 'unsupported_version' }));
  });

  it('throws unsupported_algorithm on unknown alg', () => {
    const text = encodeEnvelope(sample()).replace('AGCM256', 'CHACHA20');
    expect(() => decodeEnvelope(text)).toThrow(expect.objectContaining({ code: 'unsupported_algorithm' }));
  });

  it('throws malformed_envelope on invalid base64url segment', () => {
    const text = encodeEnvelope(sample()).split('|');
    text[3] = '!!!not_base64!!!';
    expect(() => decodeEnvelope(text.join('|'))).toThrow(expect.objectContaining({ code: 'malformed_envelope' }));
  });

  it('throws malformed_envelope on wrong IV length', () => {
    const env = sample();
    env.iv = new Uint8Array(8); // 长度错误
    expect(() => decodeEnvelope(encodeEnvelope(env))).toThrow(expect.objectContaining({ code: 'malformed_envelope' }));
  });

  it('throws malformed_envelope on wrong tag length', () => {
    const env = sample();
    env.tag = new Uint8Array(12); // 长度错误
    expect(() => decodeEnvelope(encodeEnvelope(env))).toThrow(expect.objectContaining({ code: 'malformed_envelope' }));
  });

  it.each([
    ['kid padding', 2, 'AAECAwQFBgc='],
    ['standard base64 IV', 3, '////////////////'],
    ['standard base64 tag padding', 5, 'AAAAAAAAAAAAAAAAAAAAAA==']
  ] as const)('rejects non-base64url %s', (_, index, segment) => {
    const parts = encodeEnvelope(sample()).split('|');
    parts[index] = segment;
    expect(() => decodeEnvelope(parts.join('|'))).toThrow(expect.objectContaining({ code: 'malformed_envelope' }));
  });

  it('rejects a kid that does not decode to exactly eight bytes', () => {
    const parts = encodeEnvelope(sample()).split('|');
    parts[2] = 'AAECAwQFBg';
    expect(() => decodeEnvelope(parts.join('|'))).toThrow(expect.objectContaining({ code: 'malformed_envelope' }));
  });

  it('rejects a non-canonical base64url segment', () => {
    const parts = encodeEnvelope(sample()).split('|');
    parts[2] = 'AAECAwQFBgd';
    expect(() => decodeEnvelope(parts.join('|'))).toThrow(expect.objectContaining({ code: 'malformed_envelope' }));
  });

  it('throws malformed_envelope on empty kid', () => {
    const env = sample();
    const encoded = encodeEnvelope(env);
    const parts = encoded.split('|');
    parts[2] = ''; // 清空 kid 片段
    expect(() => decodeEnvelope(parts.join('|'))).toThrow(expect.objectContaining({ code: 'malformed_envelope' }));
  });
});

describe('envelope.isEnvelope', () => {
  it('returns true for properly shaped strings', () => {
    expect(isEnvelope(encodeEnvelope(sample()))).toBe(true);
  });
  it('returns false for non-strings', () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope(undefined)).toBe(false);
    expect(isEnvelope(123)).toBe(false);
    expect(isEnvelope({})).toBe(false);
  });
  it('returns false for plain text without pipes', () => {
    expect(isEnvelope('hello world')).toBe(false);
  });
});

describe('envelope.buildAAD', () => {
  it('is deterministic byte-for-byte', () => {
    const parts = {
      databaseNamespace: 'db',
      entityNamespace: 'a',
      tableName: 'b',
      columnName: 'c',
      primaryKey: 'd',
      kid: 'e'
    };
    const a = buildAAD(parts);
    const b = buildAAD(parts);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
  it.each([
    ['databaseNamespace', '数据库\x1f二'],
    ['entityNamespace', '租户'],
    ['tableName', ''],
    ['columnName', '列'],
    ['primaryKey', ''],
    ['kid', '密钥']
  ] as const)('changes bytes when %s changes to an empty, Unicode, or control value', (field, value) => {
    const base = {
      databaseNamespace: 'db',
      entityNamespace: 'a',
      tableName: 'b',
      columnName: 'c',
      primaryKey: 'd',
      kid: 'e'
    };
    const ref = buildAAD(base);
    const other = buildAAD({ ...base, [field]: value });
    expect(Array.from(ref)).not.toEqual(Array.from(other));
  });

  it('uses unambiguous length-prefixed tuple boundaries', () => {
    const left = buildAAD({
      databaseNamespace: 'a\x1fb',
      entityNamespace: 'c',
      tableName: 'd',
      columnName: 'e',
      primaryKey: 'f',
      kid: 'g'
    });
    const right = buildAAD({
      databaseNamespace: 'a',
      entityNamespace: 'b',
      tableName: 'c\x1fd',
      columnName: 'e',
      primaryKey: 'f',
      kid: 'g'
    });

    expect(Array.from(left)).not.toEqual(Array.from(right));
  });

  it('does not collide across deterministic random tuples', () => {
    let state = 0x6d2b79f5;
    const next = (): number => {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      return (state ^ (state >>> 14)) >>> 0;
    };
    const alphabet = ['', '\x1f', '租', 'A', '🙂'];
    const seen = new Map<string, string>();

    for (let index = 0; index < 512; index++) {
      const tuple = Array.from({ length: 6 }, () => `${alphabet[next() % alphabet.length]}${next()}`);
      const [databaseNamespace, entityNamespace, tableName, columnName, primaryKey, kid] = tuple;
      const encoded = Array.from(
        buildAAD({ databaseNamespace, entityNamespace, tableName, columnName, primaryKey, kid })
      ).join(',');
      const identity = JSON.stringify(tuple);
      expect(seen.get(encoded)).toBeUndefined();
      seen.set(encoded, identity);
    }
  });

  it('encodes string, number, and bigint primary identities without collisions', () => {
    const common = {
      databaseNamespace: 'db',
      entityNamespace: 'a',
      tableName: 'b',
      columnName: 'c',
      kid: 'e'
    };
    const identities = [
      buildAAD({ ...common, primaryKey: '1' }),
      buildAAD({ ...common, primaryKey: 1 }),
      buildAAD({ ...common, primaryKey: 1n })
    ].map(bytes => Array.from(bytes).join(','));

    expect(new Set(identities).size).toBe(3);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects invalid numeric primary identity %s', primaryKey => {
    expect(() =>
      buildAAD({
        databaseNamespace: 'db',
        entityNamespace: 'a',
        tableName: 'b',
        columnName: 'c',
        primaryKey,
        kid: 'e'
      })
    ).toThrow(TypeError);
  });
});
