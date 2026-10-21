import { describe, expect, it } from 'vitest';

import { labelTextColor } from '../label-text-color.js';

/**
 * 标签文字色（US-539 AC#6 的对比度半边）：按 WCAG 相对亮度在黑白之间选择，
 * 保证任一侧 ≥ 4.5:1。四种种子标签色覆盖深浅两侧（深色白字 / 浅色黑字）。
 */
describe('labelTextColor（标签文字对比度）', () => {
  it('深色标签用白字，浅色标签用黑字', () => {
    expect(labelTextColor('#e11d48')).toBe('#ffffff'); // 核心：相对亮度 0.171
    expect(labelTextColor('#2563eb')).toBe('#ffffff'); // 文档：0.153
    expect(labelTextColor('#16a34a')).toBe('#000000'); // 测试：0.266
    expect(labelTextColor('#d97706')).toBe('#000000'); // 发布：0.278
  });

  it('支持 #rgb 简写', () => {
    expect(labelTextColor('#fff')).toBe('#000000');
    expect(labelTextColor('#000')).toBe('#ffffff');
  });

  it('非法颜色格式拒绝（不静默兜底）', () => {
    expect(() => labelTextColor('red')).toThrow(/invalid_color/);
    expect(() => labelTextColor('#12345')).toThrow(/invalid_color/);
    expect(() => labelTextColor('')).toThrow(/invalid_color/);
  });
});
