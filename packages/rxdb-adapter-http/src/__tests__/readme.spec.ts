import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HTTP_CONFIG } from '../config.js';

/**
 * README 的「导出」一节与代码的**一致性**守卫（评审 #12）。
 *
 * @remarks
 * 只守两件机械可查、且已经真的漂移过的事：错误类名单与数值配置的个数。
 * 散文部分不守——把说明文字也钉死会让每次措辞调整都变成一次改测试，
 * 而那正是让人开始绕过守卫的开端。
 *
 * 判据取自**源码**而不是 `dist/`：让这条守卫依赖一次成功的构建，等于让它在最需要
 * 它的时候（构建正红着）先失效。
 */
describe('README 与导出一致（评审 #12）', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const errorsSource = readFileSync(join(root, 'src', 'errors.ts'), 'utf8');

  it('每个导出的错误类都出现在 README 里', () => {
    const exported = [...errorsSource.matchAll(/^export class (\w+) extends/gm)].map(match => match[1]);
    // 空数组会让本条无条件通过——正则失配与「一个错误类都没有」在断言上同型
    expect(exported.length).toBeGreaterThan(5);
    expect(exported.filter(name => !readme.includes(name))).toEqual([]);
  });

  it('数值配置的个数与 DEFAULT_HTTP_CONFIG 对得上', () => {
    const numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const count = Object.keys(DEFAULT_HTTP_CONFIG).length;
    expect(readme).toContain(`${numerals[count]}个数值配置`);
    expect(readme).toContain(`${numerals[count]}个数值都必须是 finite 正整数`);
  });
});
