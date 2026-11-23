import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ONE_WAY = /\[appSwitch\]="([^"]+)"/g;
const LITERALS = new Set(['true', 'false']);

const panes = readdirSync(import.meta.dirname).filter(file => file.endsWith('-pane.ts'));
const source = (file: string): string => readFileSync(join(import.meta.dirname, file), 'utf8');

/**
 * `ToggleSwitch` 的 `appSwitch` 是 `model`：单向绑定只给初始值，点击改的是元素自己的状态，不会写回。
 * 绑真实状态（`system.*`）必须是 `[(appSwitch)]="signal"`；单向绑定只用于只改外观的摆设开关（字面量 true / false）。
 */
describe('设置面板里的开关', () => {
  it('没有用单向绑定去绑一个会变的表达式（点了只改外观、不写回状态）', () => {
    const oneWay = panes.flatMap(file =>
      [...source(file).matchAll(ONE_WAY)].filter(match => !LITERALS.has(match[1])).map(match => `${file}: ${match[1]}`)
    );
    expect(oneWay).toEqual([]);
  });

  it('声音面板的 Mute 开关双向绑定到 system.muted', () => {
    expect(source('sound-pane.ts').includes('[(appSwitch)]="system.muted"')).toBe(true);
  });

  it('扫描确实读到了面板源码', () => {
    expect(panes).toContain('sound-pane.ts');
    expect(panes.length).toBeGreaterThanOrEqual(10);
  });
});
