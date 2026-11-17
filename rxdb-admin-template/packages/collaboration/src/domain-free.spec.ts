import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
/**
 * 资产领域的实体名、字段名与命名空间：协作包的校验与界面都由数据模式清单驱动，源码里不能再出现它们。
 * `Asset` 按子串匹配，`AssetCategory`、`AssetEvent` 与 `readAnonymousAssets` 这类拼进标识符的写法也会被拦下；
 * 以 `asset` 开头的驼峰标识符（如 `assetNamespace`）同样拦下。
 */
const forbidden = /Asset|\basset[A-Z_]\w*|purchasePrice|purchaseDate|happenedAt|categoryId|['"`]assets['"`]/g;
/**
 * 不扫描的文件：测试与测试支撑文件（用资产数据做夹具），以及词条表——它的英文译文是界面文案
 * （宿主应用传入的中文标签的英文），不是实体或字段标识。
 */
const skipped = (path: string) =>
  path.endsWith('.spec.ts') || path.endsWith('.testing.ts') || path.endsWith('.d.ts') || path === 'messages.ts';

/** 返回违规位置，格式为「文件:行 命中的文本」。 */
function domainNames(file: string, source: string): string[] {
  return source
    .split('\n')
    .flatMap((line, index) => [...line.matchAll(forbidden)].map(match => `${file}:${index + 1} ${match[0]}`));
}

describe('协作包不含资产领域的名字', () => {
  it('src 的非测试源码里没有资产实体名、字段名与命名空间（含注释）', () => {
    const problems = readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
      .map(path => path.replaceAll('\\', '/'))
      .filter(path => path.endsWith('.ts') && !skipped(path))
      .sort()
      .flatMap(path => domainNames(path, readFileSync(`${sourceRoot}${path}`, 'utf8')));
    expect(problems).toEqual([]);
  });

  it('门禁能识别各种写法：实体名、拼进标识符的实体名、字段名与命名空间字面量', () => {
    const sample = [
      "const entities = ['AssetCategory', 'Asset'];",
      'export function readAnonymousAssets() {}',
      "if (field === 'purchasePrice' || row.fields['assetId']) return;",
      '// happenedAt 与 categoryId 只在注释里也算',
      "const namespace = 'assets';",
      'export const assetNamespace = namespace;',
      "const generic = 'Project', fine = 'asset-free';"
    ].join('\n');
    expect(domainNames('sample.ts', sample)).toEqual([
      'sample.ts:1 Asset',
      'sample.ts:1 Asset',
      'sample.ts:2 Asset',
      'sample.ts:3 purchasePrice',
      'sample.ts:3 assetId',
      'sample.ts:4 happenedAt',
      'sample.ts:4 categoryId',
      "sample.ts:5 'assets'",
      'sample.ts:6 assetNamespace'
    ]);
  });
});
