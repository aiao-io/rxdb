/**
 * @fileoverview PGL-006：JSON 嵌套路径的数值比较必须按数值，而不是文本
 *
 * `->>` / `#>>` 的结果类型是 text，`'10' > '9'` 按字典序为 false ——
 * `meta.count = 10` 查 `> 9` 返回空集，且不报错。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType, type RuleGroup } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { buildRuleGroupPG } from '../../query/query_sql.js';

@Entity({
  name: 'PGliteJsonNumericDoc',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'meta', type: PropertyType.json, nullable: true }
  ]
})
class PGliteJsonNumericDoc extends EntityBase {}

const metadata = getEntityMetadata(PGliteJsonNumericDoc);

const build = (where: RuleGroup<never>) => {
  const params: unknown[] = [];
  const sql = buildRuleGroupPG(where as never, params, new Map(), metadata);
  return { params, sql };
};

describe('PGL-006 JSON 数值比较', () => {
  it.each([['>'], ['<'], ['>='], ['<='], ['='], ['!=']])('数值比较用 jsonb 操作数而非 text（%s）', operator => {
    const { params, sql } = build({ combinator: 'and', rules: [{ field: 'meta.count', operator, value: 9 }] } as never);

    expect(sql).toContain(`"meta" -> 'count'`);
    expect(sql).not.toContain('->>');
    expect(sql).toContain('::jsonb');
    expect(params).toEqual(['9']);
  });

  it('多段路径用 #> 而非 #>>', () => {
    const { params, sql } = build({
      combinator: 'and',
      rules: [{ field: 'meta.a.b', operator: '>', value: 5 }]
    } as never);

    expect(sql).toContain(`"meta" #> '{a,b}'`);
    expect(sql).not.toContain('#>>');
    expect(params).toEqual(['5']);
  });

  it('布尔比较同样走 jsonb', () => {
    const { params, sql } = build({
      combinator: 'and',
      rules: [{ field: 'meta.done', operator: '=', value: true }]
    } as never);

    expect(sql).toContain(`"meta" -> 'done'`);
    expect(params).toEqual(['true']);
  });

  it('字符串比较保持 text 访问器', () => {
    const { params, sql } = build({
      combinator: 'and',
      rules: [{ field: 'meta.name', operator: '=', value: 'x' }]
    } as never);

    expect(sql).toContain(`"meta" ->> 'name'`);
    expect(params).toEqual(['x']);
  });

  it('模式操作符即使值是字符串也保持 text', () => {
    const { sql } = build({
      combinator: 'and',
      rules: [{ field: 'meta.name', operator: 'startsWith', value: 'a' }]
    } as never);

    expect(sql).toContain(`"meta" ->> 'name'`);
  });

  it('null 判定不受影响', () => {
    const { sql } = build({
      combinator: 'and',
      rules: [{ field: 'meta.count', operator: 'null', value: null }]
    } as never);

    expect(sql).toContain('IS NULL');
  });
});
