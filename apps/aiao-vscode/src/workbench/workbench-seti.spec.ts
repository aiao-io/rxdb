// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSetiIcon, setiIconForFile } from './workbench-seti.js';
import {
  SETI_DEFAULT_ICON,
  SETI_EXTENSIONS,
  SETI_FILE_NAMES,
  SETI_ICONS,
  SETI_LANGUAGES
} from './workbench-seti-theme.js';

/** 取字体码点对应的字符，便于直接比较。 */
const glyph = (code: string): string => String.fromCodePoint(Number.parseInt(code, 16));

describe('Seti 文件图标', () => {
  it('与 vscode.dev 实测一致：文件名 > 扩展名 > 语言 > 默认图标', () => {
    expect(setiIconForFile('README.md')).toEqual({ id: '_info', glyph: glyph('E04D'), color: '#519aba' });
    expect(setiIconForFile('docs/guide/intro.md').id).toBe('_markdown');
    expect(setiIconForFile('package.json')).toMatchObject({ id: '_json', color: '#cbcb41' });
    expect(setiIconForFile('.gitignore')).toMatchObject({ id: '_git', color: '#41535b' });
    expect(setiIconForFile('.github/workflows/ci.yml')).toMatchObject({ id: '_yml', color: '#a074c4' });
    expect(setiIconForFile('src/components/Button.css').id).toBe('_css');
    expect(setiIconForFile('src/components/Button.tsx').id).toBe('_react');
    expect(setiIconForFile('src/index.ts')).toMatchObject({ id: '_typescript', glyph: glyph('E099') });
    expect(setiIconForFile('src/index.js').id).toBe('_javascript');
    expect(setiIconForFile('notes.unknownext').id).toBe(SETI_DEFAULT_ICON);
  });

  it('多段扩展名取最长匹配，大小写不敏感', () => {
    expect(setiIconForFile('src/app.SPEC.ts').id).toBe('_typescript_1');
    expect(setiIconForFile('vite.config.ts').id).toBe('_vite');
    expect(setiIconForFile('README.MD').id).toBe('_info');
  });

  it('图标是 aria-hidden 的字体字形，颜色来自主题', () => {
    const icon = createSetiIcon('src/index.ts');
    expect(icon.className).toBe('wb-seti');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.dataset['seti']).toBe('_typescript');
    expect(icon.textContent).toBe(setiIconForFile('src/index.ts').glyph);
    expect(icon.style.color).not.toBe('');
  });

  it('生成的映射与 vendor 中的 VS Code 主题逐项一致，防止手改或主题升级后漂移', async () => {
    const theme = JSON.parse(await readFile(resolve('vendor/seti/vs-seti-icon-theme.json'), 'utf8')) as {
      file: string;
      fileExtensions: Record<string, string>;
      fileNames: Record<string, string>;
      languageIds: Record<string, string>;
      iconDefinitions: Record<string, { fontCharacter: string; fontColor?: string }>;
    };
    expect(SETI_DEFAULT_ICON).toBe(theme.file);
    expect(SETI_EXTENSIONS).toEqual(theme.fileExtensions);
    expect(SETI_FILE_NAMES).toEqual(theme.fileNames);
    expect(SETI_LANGUAGES).toEqual(theme.languageIds);
    for (const [id, [code, color]] of Object.entries(SETI_ICONS)) {
      const definition = theme.iconDefinitions[id];
      expect([id, code, color]).toEqual([id, definition.fontCharacter.slice(1), definition.fontColor ?? '']);
    }
  });
});
