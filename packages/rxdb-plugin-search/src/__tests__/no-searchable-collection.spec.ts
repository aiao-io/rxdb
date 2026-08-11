/**
 * T051 —— 不含任何 `searchable: true` 字段的 collection 不得安装或搜索。
 *
 * 纯逻辑侧：`extractFtsPlanFromMetadata` 返回 `null`；`resolveSearchScope`
 * 不会包含该 collection（candidates 由 installer 已过滤）。
 */
import type { EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { extractFtsPlanFromMetadata } from '../core/fts5-installer.js';
import { resolveSearchScope } from '../core/scope-resolver.js';

const meta = (tableName: string, properties: ReadonlyArray<Record<string, unknown>>): EntityMetadata =>
  ({
    name: tableName,
    tableName,
    properties: [{ name: 'id', type: 'string', columnName: 'id', primary: true }, ...properties]
  }) as unknown as EntityMetadata;

describe('No-searchable collection regression (T051)', () => {
  it('returns null plan when no field has searchable:true', () => {
    const plan = extractFtsPlanFromMetadata(
      meta('user', [
        { name: 'email', type: 'string', columnName: 'email' },
        { name: 'name', type: 'string', columnName: 'name', searchable: false }
      ])
    );
    expect(plan).toBeNull();
  });

  it('returns null plan when only non-textual types are marked searchable (silently filtered)', () => {
    const plan = extractFtsPlanFromMetadata(
      meta('stats', [
        { name: 'views', type: 'integer', columnName: 'views', searchable: true },
        { name: 'ratio', type: 'float', columnName: 'ratio', searchable: true }
      ])
    );
    expect(plan).toBeNull();
  });

  it('scope-resolver fails fast when a non-searchable collection is explicitly requested', () => {
    // installer 会预先过滤候选项；user / no-searchable 不会进入此列表——
    // 显式请求它必须抛错，不能伪装成"无搜索结果"
    expect(() =>
      resolveSearchScope({
        candidates: ['article', 'comment'],
        requested: ['article', 'user', 'comment'] // user 不是 FTS 候选项
      })
    ).toThrow(/unknown collection\(s\).*user/);
  });
});
