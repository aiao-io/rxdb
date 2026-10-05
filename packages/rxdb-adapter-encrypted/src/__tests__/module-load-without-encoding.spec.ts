/**
 * 抖音 iOS 真机没有原生 `TextEncoder` / `TextDecoder`（实测 `ReferenceError: Can't find variable: TextEncoder`），
 * 小程序 adapter 的 polyfill 在 bootstrap 时才装上；打进产物的模块 import 时不能构造编码器，要等第一次用到再建。
 */
import { afterEach, expect, it, vi } from 'vitest';

const ENTRIES: readonly (readonly [string, () => Promise<unknown>])[] = [
  ['../index.js', () => import('../index.js')],
  ['../testing.js', () => import('../testing.js')]
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(ENTRIES)(
  '没有 TextEncoder / TextDecoder 时 %s 照样能加载',
  async (_entry, load) => {
    vi.resetModules();
    vi.stubGlobal('TextEncoder', undefined);
    vi.stubGlobal('TextDecoder', undefined);

    await expect(load()).resolves.toBeDefined();
  },
  30_000
);
