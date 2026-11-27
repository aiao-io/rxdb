import { describe, expect, it } from 'vitest';
import { getWorkbenchDisplayMode, type DisplayModeEnvironment } from './display-mode.js';

function environment(...matchedQueries: string[]): DisplayModeEnvironment {
  return {
    matchMedia: query => ({ matches: matchedQueries.includes(query) })
  };
}

describe('工作台显示模式', () => {
  it('优先识别窗口控制覆盖模式', () => {
    expect(
      getWorkbenchDisplayMode(environment('(display-mode: window-controls-overlay)', '(display-mode: standalone)'))
    ).toBe('window-controls-overlay');
  });

  it('识别独立应用模式', () => {
    expect(getWorkbenchDisplayMode(environment('(display-mode: standalone)'))).toBe('standalone');
  });

  it('浏览器不提供显示模式能力时回退到浏览器模式', () => {
    expect(getWorkbenchDisplayMode({})).toBe('browser');
  });
});
