/**
 * 字符串区间端点按码点（= UTF-8 字节序，SQLite `BINARY` / PG `C`）比较。
 *
 * JS 的 `<` 比 UTF-16 码元：辅助平面字符编码成 0xD800–0xDFFF 的代理对，会排在 U+E000–U+FFFF 之前，
 * 与两后端的字节序相反——合法区间被误判反转，真正反转的区间却编译成恒假的 BETWEEN / 恒真的 NOT BETWEEN。
 */
import { describe, expect, it } from 'vitest';
import { compileCheckRuleGroup } from '../../entity/check-constraint.js';
import { EntityMetadataOptions, PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';

/** U+F8FF（私用区，BMP 高位）与 U+1F600（辅助平面）：码点序 F8FF < 1F600，UTF-16 码元序相反。 */
const BMP_HIGH = '';
const ASTRAL = '😀';

const metadata = transitionMetadata({
  name: 'Coded' as Capitalize<string>,
  namespace: 'public',
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'code', type: PropertyType.string, nullable: true },
    { name: 'level', type: PropertyType.enum, enum: [BMP_HIGH, ASTRAL], nullable: true }
  ],
  computedProperties: [],
  relations: [],
  indexes: []
} as EntityMetadataOptions);

const compile = (field: string, operator: 'between' | 'notBetween', value: readonly [string, string]): string =>
  compileCheckRuleGroup(metadata, { combinator: 'and', rules: [{ field, operator, value: [...value] }] }, 'CHECK probe');

describe('CHECK 字符串区间：端点按码点比较', () => {
  it('码点序合法的区间（BMP 高位 → 辅助平面）照常编译', () => {
    expect(compile('code', 'between', [BMP_HIGH, ASTRAL])).toBe(`("code" BETWEEN '${BMP_HIGH}' AND '${ASTRAL}')`);
    expect(compile('level', 'notBetween', [BMP_HIGH, ASTRAL])).toBe(
      `("level" NOT BETWEEN '${BMP_HIGH}' AND '${ASTRAL}')`
    );
  });

  it('码点序反转的区间在元数据期拒绝', () => {
    expect(() => compile('code', 'between', [ASTRAL, BMP_HIGH])).toThrow(/边界反转/);
    expect(() => compile('level', 'notBetween', [ASTRAL, BMP_HIGH])).toThrow(/边界反转/);
  });

  it('前缀关系与相等端点照旧：短串在前、相等不算反转', () => {
    expect(() => compile('code', 'between', ['a', 'ab'])).not.toThrow();
    expect(() => compile('code', 'between', ['ab', 'a'])).toThrow(/边界反转/);
    expect(() => compile('code', 'between', [ASTRAL, ASTRAL])).not.toThrow();
  });
});
