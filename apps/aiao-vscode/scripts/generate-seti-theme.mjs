import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(packageRoot, 'vendor/seti/vs-seti-icon-theme.json');
const target = join(packageRoot, 'src/workbench/workbench-seti-theme.ts');

/** 把 VS Code 的 Seti 图标主题（vendor/seti）压成只含暗色的紧凑映射。 */
export function compactSetiTheme(theme) {
  const used = new Set([
    theme.file,
    ...Object.values(theme.fileExtensions),
    ...Object.values(theme.fileNames),
    ...Object.values(theme.languageIds)
  ]);
  const icons = {};
  for (const id of [...used].sort()) {
    const definition = theme.iconDefinitions[id];
    if (!definition) throw new Error(`Seti 主题缺少图标定义 ${id}`);
    icons[id] = [definition.fontCharacter.replace(/^\\/, ''), definition.fontColor ?? ''];
  }
  const sorted = record =>
    Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
  return {
    defaultIcon: theme.file,
    icons,
    extensions: sorted(theme.fileExtensions),
    fileNames: sorted(theme.fileNames),
    languages: sorted(theme.languageIds)
  };
}

export function renderSetiModule(compact) {
  const literal = value => JSON.stringify(value, null, 2);
  return `/**
 * 由 scripts/generate-seti-theme.mjs 从 vendor/seti/vs-seti-icon-theme.json 生成，请勿手改。
 * 数据来自 VS Code 内置的 Seti 图标主题（MIT，版权归 Jesse Weed，见 vendor/seti/LICENSE.txt）。
 */

/** 图标编号 → [字体码点（十六进制）, 颜色]；颜色为空表示继承文字色。 */
export const SETI_ICONS: Readonly<Record<string, readonly [string, string]>> = ${literal(compact.icons)};

/** 没有任何规则命中时的文件图标。 */
export const SETI_DEFAULT_ICON = ${literal(compact.defaultIcon)};

/** 扩展名（可含多段，如 test.ts）→ 图标编号。 */
export const SETI_EXTENSIONS: Readonly<Record<string, string>> = ${literal(compact.extensions)};

/** 小写文件名 → 图标编号。 */
export const SETI_FILE_NAMES: Readonly<Record<string, string>> = ${literal(compact.fileNames)};

/** VS Code 语言标识 → 图标编号。 */
export const SETI_LANGUAGES: Readonly<Record<string, string>> = ${literal(compact.languages)};
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const theme = JSON.parse(await readFile(source, 'utf8'));
  await writeFile(target, renderSetiModule(compactSetiTheme(theme)));
  console.log(`已生成 ${target}`);
}
