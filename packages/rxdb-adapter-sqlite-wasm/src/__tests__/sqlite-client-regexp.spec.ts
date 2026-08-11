import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SQLiteAPI } from '../sqlite-api.type.js';

const sqliteLoadMock = vi.hoisted(() => vi.fn());

vi.mock('../sqlite-load.utils.js', async importOriginal => {
  const original = await importOriginal<typeof import('../sqlite-load.utils.js')>();
  return { ...original, sqliteLoad: sqliteLoadMock };
});

import { SqliteClient } from '../SqliteClient.js';

type ScalarFunction = NonNullable<Parameters<SQLiteAPI['create_function']>[5]>;

interface FunctionHarness {
  readonly functions: ReadonlyMap<string, ScalarFunction>;
  readonly result: ReturnType<typeof vi.fn>;
  readonly values: Map<number, string>;
}

async function createFunctionHarness(): Promise<FunctionHarness> {
  const functions = new Map<string, ScalarFunction>();
  const values = new Map<number, string>();
  const result = vi.fn();
  const sqlite = {
    changes: vi.fn().mockReturnValue(0),
    close: vi.fn().mockResolvedValue(undefined),
    column_names: vi.fn().mockReturnValue([]),
    create_function: vi.fn(
      (
        _db: number,
        name: string,
        _argumentCount: number,
        _encoding: number,
        _applicationData: number,
        callback?: ScalarFunction
      ) => {
        if (callback) functions.set(name, callback);
        return 0;
      }
    ),
    result,
    set_authorizer: vi.fn().mockReturnValue(0),
    statements: vi.fn(async function* () {
      yield* [];
    }),
    update_hook: vi.fn(),
    value_text: vi.fn((value: number) => values.get(value) ?? '')
  } as unknown as SQLiteAPI;
  sqliteLoadMock.mockResolvedValue({ pointer: 1, sqlite });

  const client = new SqliteClient();
  await client.init('regexp-db', { vfs: 'memory' });

  return { functions, result, values };
}

async function invoke(callback: ScalarFunction, context: number, values: Uint32Array): Promise<void> {
  await callback(context, values);
}

describe('SqliteClient regexp 函数', () => {
  afterEach(() => {
    sqliteLoadMock.mockReset();
  });

  it('regexp 对合法表达式返回匹配结果', async () => {
    const harness = await createFunctionHarness();
    const regexp = harness.functions.get('regexp');
    harness.values.set(1, '^foo');
    harness.values.set(2, 'foobar');

    await invoke(regexp!, 10, new Uint32Array([1, 2]));

    expect(harness.result).toHaveBeenCalledWith(10, 1);
  });

  it('regexp 对不匹配文本返回 0', async () => {
    const harness = await createFunctionHarness();
    const regexp = harness.functions.get('regexp');
    harness.values.set(1, '^foo$');
    harness.values.set(2, 'bar');

    await invoke(regexp!, 10, new Uint32Array([1, 2]));

    expect(harness.result).toHaveBeenCalledWith(10, 0);
  });

  // 与 oo1 系后端（Oo1ClientBase#register_custom_functions）的降级契约保持一致：
  // regexp 失败 → warn + 0；regexp_replace 失败 → warn + 原文；参数不足 → ''。
  // 此前 wasm 后端直接抛错，同一条 `WHERE name REGEXP '['` 在两类 adapter 上行为分叉；
  // 更糟的是这些回调由 sqlite3_step 途中回调，异常会穿过 wasm 栈帧（底层没有 try/catch，
  // 也不会转成 sqlite3_result_error），WASM 运行时可能就此处于不一致状态。
  it('regexp 对非法 pattern 降级为不匹配', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const harness = await createFunctionHarness();
    const regexp = harness.functions.get('regexp');
    harness.values.set(1, '[');
    harness.values.set(2, 'text');

    await expect(invoke(regexp!, 10, new Uint32Array([1, 2]))).resolves.toBeUndefined();

    expect(harness.result).toHaveBeenCalledWith(10, 0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('regexp_replace 参数不足时降级为空串', async () => {
    const harness = await createFunctionHarness();
    const regexpReplace = harness.functions.get('regexp_replace');
    harness.values.set(1, 'foo');
    harness.values.set(2, 'foobar');

    await expect(invoke(regexpReplace!, 10, new Uint32Array([1, 2]))).resolves.toBeUndefined();

    expect(harness.result).toHaveBeenCalledWith(10, '');
  });

  it('regexp_replace 默认 flags 只替换首个匹配', async () => {
    const harness = await createFunctionHarness();
    const regexpReplace = harness.functions.get('regexp_replace');
    harness.values.set(1, 'foo');
    harness.values.set(2, 'foo foo');
    harness.values.set(3, 'bar');

    await invoke(regexpReplace!, 10, new Uint32Array([1, 2, 3]));

    expect(harness.result).toHaveBeenCalledWith(10, 'bar foo');
  });

  it('regexp_replace 使用显式 flags 替换全部匹配', async () => {
    const harness = await createFunctionHarness();
    const regexpReplace = harness.functions.get('regexp_replace');
    harness.values.set(1, 'foo');
    harness.values.set(2, 'foo FOO');
    harness.values.set(3, 'bar');
    harness.values.set(4, 'gi');

    await invoke(regexpReplace!, 10, new Uint32Array([1, 2, 3, 4]));

    expect(harness.result).toHaveBeenCalledWith(10, 'bar bar');
  });

  it('regexp_replace 对非法 flags 降级为原文', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const harness = await createFunctionHarness();
    const regexpReplace = harness.functions.get('regexp_replace');
    harness.values.set(1, 'foo');
    harness.values.set(2, 'foobar');
    harness.values.set(3, 'bar');
    harness.values.set(4, 'invalid');

    await expect(invoke(regexpReplace!, 10, new Uint32Array([1, 2, 3, 4]))).resolves.toBeUndefined();

    expect(harness.result).toHaveBeenCalledWith(10, 'foobar');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('regexp_replace 对非法 pattern 降级为原文', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const harness = await createFunctionHarness();
    const regexpReplace = harness.functions.get('regexp_replace');
    harness.values.set(1, '[');
    harness.values.set(2, 'foobar');
    harness.values.set(3, 'bar');

    await expect(invoke(regexpReplace!, 10, new Uint32Array([1, 2, 3]))).resolves.toBeUndefined();

    expect(harness.result).toHaveBeenCalledWith(10, 'foobar');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
