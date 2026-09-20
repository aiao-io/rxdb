// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import type { IconData } from '../../../entity-table/editors/lucide-svg.js';
import { lucideToSvgElement } from '../../../entity-table/editors/lucide-svg.js';

const mockIcon: IconData = [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'circle' }],
  ['line', { x1: '12', y1: '8', x2: '12', y2: '12', key: 'line' }]
];

describe('lucideToSvgElement', () => {
  it('渲染 SVG 元素并应用颜色与默认尺寸', () => {
    const svg = lucideToSvgElement(mockIcon, '#ff0000');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('stroke')).toBe('#ff0000');
    expect(svg.getAttribute('width')).toBe('13');
    expect(svg.getAttribute('height')).toBe('13');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect([...svg.children].map(c => c.tagName.toLowerCase())).toEqual(['circle', 'line']);
  });

  it('使用自定义尺寸', () => {
    const svg = lucideToSvgElement(mockIcon, '#000', 24);
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('剥离 key 属性', () => {
    const svg = lucideToSvgElement(mockIcon, '#000');
    expect(svg.children[0].hasAttribute('key')).toBe(false);
  });

  it('camelCase 属性转 kebab-case', () => {
    const icon: IconData = [['path', { strokeWidth: '2', fillRule: 'evenodd', key: 'p' }]];
    const path = lucideToSvgElement(icon, '#000').children[0];
    expect(path.getAttribute('stroke-width')).toBe('2');
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
  });

  it('接受合法 CSS 颜色（色名 / hex / var()）', () => {
    expect(lucideToSvgElement(mockIcon, 'red').getAttribute('stroke')).toBe('red');
    expect(lucideToSvgElement(mockIcon, '#abc123').getAttribute('stroke')).toBe('#abc123');
    expect(lucideToSvgElement(mockIcon, 'var(--my-color)').getAttribute('stroke')).toBe('var(--my-color)');
  });

  it('拒绝危险颜色字符串并回退 currentColor', () => {
    for (const color of ['"><script>alert(1)</script>', 'red" onclick="alert(1)', '<img onerror=alert(1)>']) {
      expect(lucideToSvgElement(mockIcon, color).getAttribute('stroke')).toBe('currentColor');
    }
  });

  it('处理空图标数组', () => {
    const svg = lucideToSvgElement([] as unknown as IconData, '#000');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.children).toHaveLength(0);
  });

  it('属性值中的引号与尖括号按字面存储（DOM 赋值免疫标记注入）', () => {
    const maliciousIcon: IconData = [['circle', { cx: '12"onload="alert(1)', cy: '12', r: '10', key: 'c' }]];
    const svg = lucideToSvgElement(maliciousIcon, '#000');
    expect(svg.children).toHaveLength(1);
    expect(svg.children[0].getAttribute('cx')).toBe('12"onload="alert(1)');
    expect(svg.children[0].hasAttribute('onload')).toBe(false);

    const scriptIcon: IconData = [['path', { d: '<script>', key: 'p' }]];
    const scriptSvg = lucideToSvgElement(scriptIcon, '#000');
    expect(scriptSvg.children[0].getAttribute('d')).toBe('<script>');
    // 属性值按字面存储：不产生新元素、无子节点、无可查询到的 script 节点
    expect(scriptSvg.children).toHaveLength(1);
    expect(scriptSvg.children[0].childNodes).toHaveLength(0);
    expect(scriptSvg.querySelectorAll('script')).toHaveLength(0);
  });

  it('拒绝非 SVG 标签', () => {
    const malicious: IconData = [['script', { src: 'evil.js', key: 's' }]];
    expect(lucideToSvgElement(malicious, '#000').children).toHaveLength(0);
  });

  it('过滤不安全标签并保留安全标签', () => {
    const mixed: IconData = [
      ['circle', { cx: '12', cy: '12', r: '10', key: 'c' }],
      ['iframe', { src: 'evil.html', key: 'i' }]
    ];
    const svg = lucideToSvgElement(mixed, '#000');
    expect([...svg.children].map(c => c.tagName.toLowerCase())).toEqual(['circle']);
  });

  it('拒绝事件处理属性名（on*）', () => {
    const malicious: IconData = [['path', { d: 'M0 0', onclick: 'alert(1)', key: 'p' }]];
    const path = lucideToSvgElement(malicious, '#000').children[0];
    expect(path.hasAttribute('onclick')).toBe(false);
  });

  it('拒绝 URL 与非法字符属性名（href / 含引号尖括号）', () => {
    const malicious: IconData = [
      ['use', { href: 'https://evil.example/x.svg', key: 'u' }],
      ['path', { d: 'M0 0', 'bad"name>': 'x', key: 'p' }]
    ];
    const svg = lucideToSvgElement(malicious, '#000');
    const [use, path] = [...svg.children] as [SVGElement, SVGElement];
    expect(use.hasAttribute('href')).toBe(false);
    expect(path.hasAttribute('bad"name>')).toBe(false);
    expect(path.attributes).toHaveLength(1);
  });
});
