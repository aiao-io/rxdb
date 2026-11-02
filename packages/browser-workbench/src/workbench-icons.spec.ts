// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  createCodicon,
  createFileIcon,
  fileCodicon,
  folderCodicon,
  gitStatusCodicon,
  iconMarkup
} from './workbench-icons.js';

describe('VS Code 官方图标', () => {
  it('装饰图标使用官方 class，不把图标字体读成文本', () => {
    const icon = createCodicon('files');
    expect(icon.className).toBe('codicon codicon-files');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.textContent).toBe('');
    expect(icon.hasAttribute('role')).toBe(false);
  });

  it('独立图标的可访问名称保留原文，markup 转义属性内容', () => {
    const label = '<项目> & "文件" 与 \'图标\'';
    const icon = createCodicon('source-control', label);
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toBe(label);
    expect(icon.hasAttribute('aria-hidden')).toBe(false);
    const host = document.createElement('div');
    host.innerHTML = iconMarkup('source-control', label);
    expect(host.firstElementChild?.getAttribute('aria-label')).toBe(label);
    expect(host.children).toHaveLength(1);
  });

  it('非法图标名不能注入 class 或 HTML', () => {
    expect(() => createCodicon('files onclick=alert(1)' as 'files')).toThrow();
    expect(() => iconMarkup('close"><script>run()</script>' as 'close')).toThrow();
  });

  it.each(['code', 'layout', 'remote', 'open-preview', 'globe', 'clear-all', 'circle-filled', 'chevron-up'] as const)(
    '主布局使用官方 %s 字形',
    name => {
      expect(createCodicon(name).className).toBe(`codicon codicon-${name}`);
      expect(iconMarkup(name)).toContain(`codicon-${name}`);
    }
  );

  it.each([
    ['src/main.ts', 'file-code'],
    ['main.js', 'file-code'],
    ['index.html', 'file-code'],
    ['Counter.tsx', 'file-code'],
    ['App.vue', 'file-code'],
    ['style.css', 'symbol-color'],
    ['package.json', 'json'],
    ['README.md', 'markdown'],
    ['logo.svg', 'file-media'],
    ['photo.PNG', 'file-media'],
    ['data.sqlite', 'file-binary'],
    ['pnpm-lock.yaml', 'settings-gear'],
    ['LICENSE', 'file-text'],
    ['unknown.extension', 'file']
  ] as const)('文件 %s 使用官方 %s 图标', (filename, expected) => {
    expect(fileCodicon(filename)).toBe(expected);
  });

  it('文件语言只作为可着色元数据，目录开关与 Git 状态保持确定映射', () => {
    expect(createFileIcon('Counter.tsx').dataset['language']).toBe('react');
    expect(createFileIcon('App.vue').dataset['language']).toBe('vue');
    expect(createFileIcon('app.component.ts').dataset['language']).toBe('angular');
    expect(folderCodicon(false)).toBe('folder');
    expect(folderCodicon(true)).toBe('folder-opened');
    expect(gitStatusCodicon(' M')).toBe('diff-modified');
    expect(gitStatusCodicon('A ')).toBe('diff-added');
    expect(gitStatusCodicon(' D')).toBe('diff-removed');
    expect(gitStatusCodicon('R ')).toBe('diff-renamed');
    expect(gitStatusCodicon('??')).toBe('question');
    expect(gitStatusCodicon('UU')).toBe('warning');
    expect(gitStatusCodicon('  ')).toBe('check');
  });
});
