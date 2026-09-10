/**
 * 引擎错误 → HTTP 状态码的映射契约。
 *
 * @remarks
 * 这一层只能在单元层测：能经线路触发的引擎错误只有「查询不合法」一种（`server.spec.ts`
 * 里那两条 400 守着），而适配器的内部失败——`Unsupported repository type`、
 * `DURABILITY_LOST`——没有任何请求造得出来。它们恰恰是这条映射最容易搞错的输入：
 * 曾经整类 `RxdbAdapterPGliteError` 都被判成 400，服务端 bug 于是以「你的请求不对」
 * 回给客户端，客户端怎么改参数都不会好，监控上服务端错误率恒为 0。
 */

import { INVALID_QUERY_ERROR_CODE, RxdbAdapterPGliteError } from '@aiao/rxdb-adapter-pglite';
import { describe, expect, it } from 'vitest';

import { HttpError } from '../http-utils.ts';
import { mapEngineError } from '../recipes-repository.ts';

describe('mapEngineError', () => {
  it('查询编译错误 → 400，并保留引擎给的说明', () => {
    const mapped = mapEngineError(
      new RxdbAdapterPGliteError('Unknown query field: nope', INVALID_QUERY_ERROR_CODE),
      'metadata query failed'
    );

    expect(mapped).toBeInstanceOf(HttpError);
    expect(mapped.status).toBe(400);
    expect(mapped.message).toBe('Unknown query field: nope');
  });

  it('唯一约束冲突 → 409', () => {
    const duplicate = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });

    expect(mapEngineError(duplicate, 'create failed').status).toBe(409);
  });

  it.each([
    ['无错误码的适配器内部失败', new RxdbAdapterPGliteError('Unsupported repository type: tree')],
    ['带内部错误码的适配器失败', new RxdbAdapterPGliteError('PGlite durability flush failed', 'DURABILITY_LOST')],
    ['查询值转换失败（抛的是 TypeError）', new TypeError('Property "amount" expects a signed 64-bit bigint.')],
    ['任何其它 Error', new Error('boom')]
  ])('%s → 500', (_label, error) => {
    expect(mapEngineError(error, 'query failed').status).toBe(500);
  });

  it('已经定型的 HttpError 原样透传，不被二次归类', () => {
    const original = new HttpError(404, 'Recipe not found');

    expect(mapEngineError(original, 'update failed')).toBe(original);
  });

  it('非 Error 抛出物 → 500，用调用方给的兜底说明', () => {
    const mapped = mapEngineError('just a string', 'delete failed');

    expect(mapped.status).toBe(500);
    expect(mapped.message).toBe('delete failed');
  });
});
