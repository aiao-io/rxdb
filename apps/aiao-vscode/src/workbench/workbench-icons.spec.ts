// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  createCodicon,
  createFileIcon,
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

  it.each([
    'code',
    'layout',
    'remote',
    'open-preview',
    'globe',
    'clear-all',
    'circle-filled',
    'chevron-up',
    'remove',
    'discard'
  ] as const)('主布局使用官方 %s 字形', name => {
    expect(createCodicon(name).className).toBe(`codicon codicon-${name}`);
    expect(iconMarkup(name)).toContain(`codicon-${name}`);
  });

  it('文件图标是 Seti 字体字形，与 Codicons 控件图标分开；Git 状态保持确定映射', () => {
    const icon = createFileIcon('Counter.tsx');
    expect(icon.className).toBe('wb-seti');
    expect(icon.dataset['seti']).toBe('_react');
    expect(icon.querySelector('.codicon')).toBeNull();
    expect(gitStatusCodicon(' M')).toBe('diff-modified');
    expect(gitStatusCodicon('A ')).toBe('diff-added');
    expect(gitStatusCodicon(' D')).toBe('diff-removed');
    expect(gitStatusCodicon('R ')).toBe('diff-renamed');
    expect(gitStatusCodicon('??')).toBe('question');
    expect(gitStatusCodicon('UU')).toBe('warning');
    expect(gitStatusCodicon('  ')).toBe('check');
  });
});
