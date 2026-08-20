import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = (relativePath: string): string => readFileSync(resolve(SRC_DIR, relativePath), 'utf8');

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 判断某条声明**紧邻其上**是否有 TSDoc 块。
 *
 * 只认「行首（允许缩进）+ 声明」的位置，否则 `expect(` 这种短片段会先命中
 * 文档 `@example` 里的调用示例，量到的是文档块内部。
 *
 * 顺带锁定声明本身仍然存在：重命名或删除会让断言直接抛错，而不是静默变绿。
 */
const documented = (source: string, declaration: string): boolean => {
  const match = new RegExp(`^[ \\t]*${escapeRegExp(declaration)}`, 'm').exec(source);
  if (!match) throw new Error(`未找到声明：${declaration}`);
  return source.slice(0, match.index).trimEnd().endsWith('*/');
};

// 这三个文件整体经 src/index.ts 的 `export *` 出去，是四个消费方（website + 三端 demo）
// 唯一的接线契约。虽然不进 npm 公开面，跨四个项目的签名同样只能靠文档对齐。
describe('@modules/wujie 公开 API 的 TSDoc 与类型导出', () => {
  describe('host-route.ts', () => {
    const source = read('host-route.ts');

    it('公开类型可具名导入', () => {
      expect(source).toContain('export interface WujieRoutePayload');
      expect(source).toContain('export interface WujieRouteAdapter');
      expect(source).toContain('export interface HostRouteSyncOptions');
    });

    it('公开函数与类都有 TSDoc', () => {
      const declarations = [
        'export function normalizeRoutePath',
        'export function getWujieAppId',
        'export function emitHostRoute',
        'export function subscribeSubRoute',
        'export function subscribeHostRoute',
        'export function reportSubRoute',
        'export function bindWujieRoute',
        'export class HostRouteSync',
        'expect(',
        'accept('
      ];
      expect(declarations.filter(declaration => !documented(source, declaration))).toEqual([]);
    });
  });

  describe('host-theme.ts', () => {
    const source = read('host-theme.ts');

    it('公开类型可具名导入', () => {
      expect(source).toContain('export type ResolvedTheme');
      expect(source).toContain('export interface WujieBus');
      expect(source).toContain('export interface WujieHost');
    });

    it('公开函数都有 TSDoc', () => {
      const declarations = [
        'export function parseResolvedTheme',
        'export function getWujieHost',
        'export function subscribeHostTheme',
        'export function emitHostTheme',
        'export function requestHostTheme',
        'export function subscribeThemeRequest'
      ];
      expect(declarations.filter(declaration => !documented(source, declaration))).toEqual([]);
    });
  });

  describe('shadow-css.ts', () => {
    const source = read('shadow-css.ts');

    it('常量与改写函数都有 TSDoc', () => {
      const declarations = ['export const HOST_THEME_ATTRIBUTE', 'export function rewriteShadowCss'];
      expect(declarations.filter(declaration => !documented(source, declaration))).toEqual([]);
    });
  });
});
