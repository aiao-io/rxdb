import { afterEach, describe, expect, it, vi } from 'vitest';
import { maskEncryptedFields, resetEventIdCounter, serialize, serializeDevToolsValue } from '../serializer.js';

/**
 * 一条形状合法的信封：`v|alg|kid|iv|ct|tag`，段长与 `@aiao/rxdb-adapter-encrypted` 一致
 * （kid 11 / iv 16 / tag 22 字符）。
 *
 * @remarks
 * 旧夹具是段长随手编的假信封（kid 8 / iv 12 / tag 15），只有当时那条
 * 「六段 pipe 就算密文」的宽松正则才认。正则收紧后它立刻暴露成假样本 ——
 * 也就是说这三条遮罩用例过去一直在测一个真实系统里不存在的字符串。
 * 与权威 codec 的双向对拍在 `serializer.envelope-contract.spec.ts`。
 */
const ENVELOPE = '2|AGCM256|a2V5MDAwMDA|aXYwMDAwMDAwMDAw|Y2lwaGVydGV4dA|dGFnMDAwMDAwMDAwMDAwMD';

describe('serializer', () => {
  afterEach(() => {
    resetEventIdCounter();
  });

  describe('serialize', () => {
    it('MUST generate unique event ID', () => {
      const e1 = serialize({ type: 'TEST' }, 1);
      const e2 = serialize({ type: 'TEST' }, 2);
      expect(e1.id).toMatch(/^evt_/);
      expect(e1.id).not.toBe(e2.id);
    });

    it('MUST set eventType from type field', () => {
      const result = serialize({ type: 'ENTITY_CREATE' }, 1);
      expect(result.eventType).toBe('ENTITY_CREATE');
    });

    it('MUST set timestamp and sequence', () => {
      const before = Date.now();
      const result = serialize({ type: 'TEST' }, 42);
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.sequence).toBe(42);
    });

    it('MUST serialize extra data fields', () => {
      const result = serialize({ type: 'TEST', entityId: 'e1', name: 'User' }, 1);
      expect(result.data).toEqual({ entityId: 'e1', name: 'User' });
    });

    it('MUST strip type from data', () => {
      const result = serialize({ type: 'TEST', value: 1 }, 1);
      expect(result.data).not.toHaveProperty('type');
    });

    it('MUST handle null and undefined values', () => {
      const result = serialize({ type: 'TEST', a: null, b: undefined }, 1);
      expect(result.data).toHaveProperty('a', null);
      expect(result.data).not.toHaveProperty('b');
    });

    it('MUST convert Date to ISO string', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const result = serialize({ type: 'TEST', date }, 1);
      expect(result.data['date']).toBe('2024-01-01T00:00:00.000Z');
    });

    it('MUST handle nested objects', () => {
      const result = serialize({ type: 'TEST', nested: { a: 1, b: 'hello' } }, 1);
      expect(result.data['nested']).toEqual({ a: 1, b: 'hello' });
    });

    it('MUST handle arrays', () => {
      const result = serialize({ type: 'TEST', items: [1, 'two', true] }, 1);
      expect(result.data['items']).toEqual([1, 'two', true]);
    });

    it('MUST strip functions from data', () => {
      const result = serialize({ type: 'TEST', fn: vi.fn(), value: 1 }, 1);
      expect(result.data).not.toHaveProperty('fn');
      expect(result.data['value']).toBe(1);
    });

    it('MUST strip symbols from data', () => {
      const result = serialize({ type: 'TEST', [Symbol('x')]: 1, value: 2 }, 1);
      expect(result.data['value']).toBe(2);
    });

    it('MUST handle circular references', () => {
      const inner: Record<string, unknown> = { a: 1 };
      inner['self'] = inner;
      const result = serialize({ type: 'TEST', nested: inner }, 1);
      const nested = result.data['nested'] as Record<string, unknown>;
      expect(nested['self']).toBe('[Circular]');
    });

    // seen 记录的是「访问过」而不是「当前路径上」，因此并列的兄弟节点共享同一个对象时，
    // 第二次就被误判成环。patch/inversePatch 引用同一嵌套对象在本包是极常见形态，
    // 面板上显示 [Circular] 会让人以为数据有环，其实数据完全正常。
    it('MUST NOT report shared sibling references as circular', () => {
      const shared = { n: 1 };
      const result = serialize({ type: 'TEST', a: shared, b: shared }, 1);

      expect(result.data['a']).toEqual({ n: 1 });
      expect(result.data['b']).toEqual({ n: 1 });
    });

    it('MUST NOT report the same object repeated in an array as circular', () => {
      const shared = { n: 1 };
      const result = serialize({ type: 'TEST', list: [shared, shared] }, 1);

      expect(result.data['list']).toEqual([{ n: 1 }, { n: 1 }]);
    });

    // SyncErrorEvent / RepositorySyncErrorEvent 唯一有价值的字段就是 error，
    // 而 message/stack 是不可枚举的自有属性，Object.keys 拿不到 → 面板收到 {}。
    it('MUST preserve Error diagnostics', () => {
      const error = new Error('boom');
      const result = serialize({ type: 'TEST', error }, 1);
      const serialized = result.data['error'] as Record<string, unknown>;

      expect(serialized['name']).toBe('Error');
      expect(serialized['message']).toBe('boom');
      expect(serialized['stack']).toEqual(expect.stringContaining('boom'));
    });

    // `new Date('x').toISOString()` 抛 RangeError，而序列化跑在 RxDB 的 event listener 里 ——
    // 一个坏时间戳会打断整条事件派发，面板收不到的不只是这个字段，是整个事件。
    it('MUST encode an invalid Date as a versioned marker instead of throwing', () => {
      const result = serialize({ type: 'TEST', when: new Date('not-a-date'), ok: 1 }, 1);

      expect(result.data['when']).toEqual({ $rxdb: 1, type: 'invalid-date' });
      expect(result.data['ok']).toBe(1);
    });

    it.each([
      ['嵌套对象里', (bad: Date) => ({ nested: { when: bad } }), 'nested'],
      ['数组里', (bad: Date) => ({ items: [bad] }), 'items']
    ])('MUST encode an invalid Date nested %s', (_label, build, key) => {
      const result = serialize({ type: 'TEST', ...build(new Date(Number.NaN)) }, 1);
      const marker = { $rxdb: 1, type: 'invalid-date' };

      expect(result.data[key]).toEqual(key === 'items' ? [marker] : { when: marker });
    });

    // 适配器把底层驱动异常包成 RxDBError 时，最接近根因的诊断全在 cause 链上；
    // 丢掉 cause 等于把「为什么失败」这一条最关键的信息留在页面里。
    it('MUST preserve the Error cause chain', () => {
      const root = new Error('disk full');
      const middle = new Error('write failed', { cause: root });
      const error = new Error('sync failed', { cause: middle });

      const result = serialize({ type: 'TEST', error }, 1);
      const serialized = result.data['error'] as Record<string, unknown>;
      const cause = serialized['cause'] as Record<string, unknown>;

      expect(serialized['message']).toBe('sync failed');
      expect(cause['message']).toBe('write failed');
      expect((cause['cause'] as Record<string, unknown>)['message']).toBe('disk full');
    });

    it('MUST omit cause when the Error does not carry one', () => {
      const result = serialize({ type: 'TEST', error: new Error('boom') }, 1);

      expect(result.data['error']).not.toHaveProperty('cause');
    });

    it('MUST degrade a circular cause chain instead of blowing the stack', () => {
      const first = new Error('first');
      const second = new Error('second', { cause: first });
      first.cause = second;

      const result = serialize({ type: 'TEST', error: first }, 1);
      const serialized = result.data['error'] as Record<string, unknown>;
      const cause = serialized['cause'] as Record<string, unknown>;

      expect(cause['message']).toBe('second');
      expect(cause['cause']).toBe('[Circular]');
    });

    it('MUST preserve non-Error causes through the same encoder', () => {
      // cause 不保证是 Error：驱动层常直接 throw 字符串 / DOMException-like 对象。
      const error = new Error('wrapped', { cause: { code: 'SQLITE_BUSY', at: new Date('bad') } });

      const result = serialize({ type: 'TEST', error }, 1);
      const cause = (result.data['error'] as Record<string, unknown>)['cause'];

      expect(cause).toEqual({ code: 'SQLITE_BUSY', at: { $rxdb: 1, type: 'invalid-date' } });
    });

    it('MUST preserve Map and Set contents', () => {
      const result = serialize({ type: 'TEST', map: new Map([['k', 'v']]), set: new Set([1, 2]) }, 1);

      expect(result.data['map']).toEqual({ _type: 'Map', entries: [['k', 'v']] });
      expect(result.data['set']).toEqual({ _type: 'Set', values: [1, 2] });
    });

    it('MUST still detect real circular references', () => {
      const inner: Record<string, unknown> = { a: 1 };
      inner['self'] = inner;
      const result = serialize({ type: 'TEST', nested: inner }, 1);
      const nested = result.data['nested'] as Record<string, unknown>;

      expect(nested['self']).toBe('[Circular]');
    });

    it('MUST filter functions from arrays', () => {
      const result = serialize({ type: 'TEST', arr: [1, vi.fn(), 3] }, 1);
      expect(result.data['arr']).toEqual([1, 3]);
    });

    it('MUST mask envelope strings to prevent ciphertext leakage', () => {
      const envelope = ENVELOPE;
      const result = serialize({ type: 'TEST', secret: envelope, plain: 'hello' }, 1);
      expect(result.data['secret']).toBe('[encrypted]');
      expect(result.data['plain']).toBe('hello');
    });

    it('MUST mask nested envelope strings', () => {
      const envelope = ENVELOPE;
      const result = serialize({ type: 'TEST', nested: { field: envelope } }, 1);
      const nested = result.data['nested'] as Record<string, unknown>;
      expect(nested['field']).toBe('[encrypted]');
    });

    it('MUST mask envelope strings in arrays', () => {
      const envelope = ENVELOPE;
      const result = serialize({ type: 'TEST', items: ['plain', envelope] }, 1);
      expect(result.data['items']).toEqual(['plain', '[encrypted]']);
    });

    it('MUST NOT mask strings that look similar but are not envelopes', () => {
      const result = serialize({ type: 'TEST', value: 'hello|world' }, 1);
      expect(result.data['value']).toBe('hello|world');
    });

    it('MUST handle number values', () => {
      const result = serialize({ type: 'TEST', count: 42 }, 1);
      expect(result.data['count']).toBe(42);
    });

    it('MUST convert nested Date values and strip bare symbols', () => {
      const result = serialize(
        {
          type: 'TEST',
          when: new Date('2025-01-02T03:04:05.000Z'),
          items: [Symbol('drop-me'), new Date('2025-02-03T00:00:00.000Z'), true],
          flag: false
        },
        1
      );
      expect(result.data['when']).toBe('2025-01-02T03:04:05.000Z');
      expect(result.data['items']).toEqual(['2025-02-03T00:00:00.000Z', true]);
      expect(result.data['flag']).toBe(false);
    });

    it('MUST encode bigint leaves as exact versioned decimal envelopes', () => {
      const result = serialize(
        {
          type: 'TEST',
          big: 9_007_199_254_740_993n,
          nested: { big: -9_223_372_036_854_775_808n, ok: 1 }
        },
        1
      );
      expect(result.data['big']).toEqual({ $rxdb: 1, type: 'bigint', value: '9007199254740993' });
      expect(result.data['nested']).toEqual({
        big: { $rxdb: 1, type: 'bigint', value: '-9223372036854775808' },
        ok: 1
      });
    });

    it('MUST encode only the current Uint8Array view as detached base64url', () => {
      const source = new Uint8Array([9, 0, 255, 8]);
      const view = source.subarray(1, 3);
      const before = new Uint8Array(source);

      const result = serialize({ type: 'TEST', binary: view }, 1);

      expect(result.data['binary']).toEqual({
        $rxdb: 1,
        type: 'binary',
        encoding: 'base64url',
        value: 'AP8',
        byteLength: 2
      });
      expect(source).toEqual(before);
      expect(view).toEqual(new Uint8Array([0, 255]));
    });

    it('MUST use the same wire representation throughout patch, inversePatch, history, and conflict values', () => {
      const binary = new Uint8Array([0, 255]);
      const payload = {
        patch: { value: 1n, binary },
        inversePatch: { value: 2n, binary },
        history: [{ patch: { value: 3n, binary } }],
        branch: { checkpoint: 6n, binary },
        conflicts: [{ local: { patch: { value: 4n, binary } }, remote: { patch: { value: 5n, binary } } }]
      };
      const result = serializeDevToolsValue(payload);
      const bigintValue = (value: string) => ({ $rxdb: 1, type: 'bigint', value });
      const binaryValue = {
        $rxdb: 1,
        type: 'binary',
        encoding: 'base64url',
        value: 'AP8',
        byteLength: 2
      };

      expect(result).toEqual({
        patch: { value: bigintValue('1'), binary: binaryValue },
        inversePatch: { value: bigintValue('2'), binary: binaryValue },
        history: [{ patch: { value: bigintValue('3'), binary: binaryValue } }],
        branch: { checkpoint: bigintValue('6'), binary: binaryValue },
        conflicts: [
          {
            local: { patch: { value: bigintValue('4'), binary: binaryValue } },
            remote: { patch: { value: bigintValue('5'), binary: binaryValue } }
          }
        ]
      });
      expect(payload.patch.value).toBe(1n);
      expect(payload.patch.binary).toBe(binary);
      expect(binary).toEqual(new Uint8Array([0, 255]));
    });
  });

  describe('maskEncryptedFields', () => {
    it('MUST replace encrypted fields before reading or serializing their values', () => {
      const value = Object.defineProperty({ publicValue: 7n }, 'secret', {
        enumerable: true,
        get: () => {
          throw new Error('encrypted plaintext was read');
        }
      });

      expect(maskEncryptedFields(value, ['secret'])).toEqual({ publicValue: 7n, secret: '[encrypted]' });
    });
  });

  describe('resetEventIdCounter', () => {
    it('MUST reset counter so IDs restart', () => {
      const first = serialize({ type: 'TEST' }, 1);
      resetEventIdCounter();
      const second = serialize({ type: 'TEST' }, 2);
      // 重置后两者的 counter 都为 1（但时间戳不同）。
      expect(first.id).toMatch(/_1$/);
      expect(second.id).toMatch(/_1$/);
    });
  });
});
