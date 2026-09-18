import type { LucideIconData } from '@lucide/angular';
import { describe, expect, it } from 'vitest';
import { lucideToSvgHtml } from './lucide-svg.js';

const mockIcon: LucideIconData = [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'circle' }],
  ['line', { x1: '12', y1: '8', x2: '12', y2: '12', key: 'line' }]
];

describe('lucideToSvgHtml', () => {
  it('renders SVG with given color and default size', () => {
    const svg = lucideToSvgHtml(mockIcon, '#ff0000');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('width="13"');
    expect(svg).toContain('height="13"');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<line');
  });

  it('uses custom size', () => {
    const svg = lucideToSvgHtml(mockIcon, '#000', 24);
    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
  });

  it('strips key attributes from children', () => {
    const svg = lucideToSvgHtml(mockIcon, '#000');
    expect(svg).not.toContain('key=');
  });

  it('converts camelCase attributes to kebab-case', () => {
    const icon: LucideIconData = [['path', { strokeWidth: '2', fillRule: 'evenodd', key: 'p' }]];
    const svg = lucideToSvgHtml(icon, '#000');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('accepts valid CSS color names', () => {
    const svg = lucideToSvgHtml(mockIcon, 'red');
    expect(svg).toContain('stroke="red"');
  });

  it('accepts valid hex colors', () => {
    const svg = lucideToSvgHtml(mockIcon, '#abc123');
    expect(svg).toContain('stroke="#abc123"');
  });

  it('accepts CSS variable references', () => {
    const svg = lucideToSvgHtml(mockIcon, 'var(--my-color)');
    expect(svg).toContain('stroke="var(--my-color)"');
  });

  it('rejects dangerous color strings with script injection', () => {
    const svg = lucideToSvgHtml(mockIcon, '"><script>alert(1)</script>');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toContain('<script>');
  });

  it('rejects color strings containing quotes', () => {
    const svg = lucideToSvgHtml(mockIcon, 'red" onclick="alert(1)');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toContain('onclick=');
  });

  it('rejects color with angle brackets', () => {
    const svg = lucideToSvgHtml(mockIcon, '<img onerror=alert(1)>');
    expect(svg).toContain('stroke="currentColor"');
  });

  it('handles empty icon array', () => {
    const svg = lucideToSvgHtml([] as unknown as LucideIconData, '#000');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('escapes attribute values to prevent XSS', () => {
    const maliciousIcon: LucideIconData = [['circle', { cx: '12"onload="alert(1)', cy: '12', r: '10', key: 'c' }]];
    const svg = lucideToSvgHtml(maliciousIcon, '#000');
    expect(svg).not.toContain('"onload="');
    expect(svg).toContain('&quot;');
  });

  it('escapes angle brackets in attribute values', () => {
    const icon: LucideIconData = [['path', { d: '<script>', key: 'p' }]];
    const svg = lucideToSvgHtml(icon, '#000');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('rejects non-SVG tag names to prevent XSS', () => {
    const malicious: LucideIconData = [['script', { src: 'evil.js', key: 's' }]];
    const svg = lucideToSvgHtml(malicious, '#000');
    expect(svg).not.toContain('<script');
  });

  it('filters unsafe tags while preserving safe ones', () => {
    const mixed: LucideIconData = [
      ['circle', { cx: '12', cy: '12', r: '10', key: 'c' }],
      ['iframe', { src: 'evil.html', key: 'i' }]
    ];
    const svg = lucideToSvgHtml(mixed, '#000');
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<iframe');
  });
});
