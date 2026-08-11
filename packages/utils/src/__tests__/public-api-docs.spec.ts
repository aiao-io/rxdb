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
 * 只认「行首（允许缩进）+ 声明」的位置，否则 `start()` 这种短片段会先命中
 * 类文档 `@example` 里的 `timer.start();`，量到的是文档块内部。
 *
 * 顺带锁定声明本身仍然存在：重命名或删除会让断言直接抛错，而不是静默变绿。
 */
const documented = (source: string, declaration: string): boolean => {
  const match = new RegExp(`^[ \\t]*${escapeRegExp(declaration)}`, 'm').exec(source);
  if (!match) throw new Error(`未找到声明：${declaration}`);
  return source.slice(0, match.index).trimEnd().endsWith('*/');
};

// UTL-033：这几处都在公开面上（经各自 barrel 的 `export *` → src/index.ts 全量 re-export），
// 却只有标题或裸注释，未说明 throws / 取消 / 生命周期 / 返回语义；
// 部分 option 与返回值类型被公开签名引用却没 export，调用方无法具名导入。
describe('UTL-033 公开 API 的 TSDoc 与类型导出', () => {
  describe('async/AsyncQueueExecutor.ts', () => {
    const source = read('async/AsyncQueueExecutor.ts');

    it('返回值与任务 id 类型可具名导入', () => {
      expect(source).toContain('export interface ExecutorStatus');
      expect(source).toContain('export type TaskId');
    });

    it('类与全部公开成员都有 TSDoc', () => {
      const declarations = [
        'export class AsyncQueueExecutor',
        'constructor(maxConcurrent',
        'addTask<T>(',
        'getStatus():',
        'setMaxConcurrent(',
        'clearQueue():',
        'waitForAll():',
        'getRunningCount():',
        'getQueuedCount():'
      ];
      expect(declarations.filter(declaration => !documented(source, declaration))).toEqual([]);
    });

    it('抛错与取消语义写进文档', () => {
      expect(source).toContain('@throws');
      expect(source).toContain('Task cancelled: queue cleared');
    });
  });

  describe('file/index.ts', () => {
    const source = read('file/index.ts');

    it('五个导出函数都有 TSDoc', () => {
      const declarations = [
        'export function formatFileSize',
        'export function getFileExtension',
        'export function isPreviewableType',
        'export function isImageType',
        'export function getFileCategory',
        'export function formatDate'
      ];
      expect(declarations.filter(declaration => !documented(source, declaration))).toEqual([]);
    });

    it('非法输入的降级返回值写进文档', () => {
      // 这两个函数对非法输入返回 '0 B' / '-' 而不抛错，契约必须显式说明。
      expect(source).toContain('@returns');
      expect(source.match(/@returns/g)?.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('@browser/IdleTimer.ts', () => {
    const source = read('@browser/IdleTimer.ts');

    it('构造参数类型可具名导入', () => {
      expect(source).toContain('export interface IdleTimerOptions');
    });

    it('类与生命周期方法都有 TSDoc', () => {
      const declarations = [
        'export class IdleTimer',
        'idle$ =',
        'constructor(options',
        'start()',
        'stop()',
        'destroy()'
      ];
      expect(declarations.filter(declaration => !documented(source, declaration))).toEqual([]);
    });

    it('destroy 之后再 start/stop 会抛错的契约写进文档', () => {
      expect(source).toContain('@throws');
    });
  });

  describe('@browser/opfs-route-sync.ts', () => {
    const source = read('@browser/opfs-route-sync.ts');

    it('sync 的动作参数类型可具名导入', () => {
      expect(source).toContain('export interface OpfsRouteActions');
    });

    it('类与 sync 都有 TSDoc', () => {
      const declarations = ['export class OpfsRouteSync', 'sync('];
      expect(declarations.filter(declaration => !documented(source, declaration))).toEqual([]);
    });
  });

  describe('string/parseChineseNumber.ts', () => {
    const source = read('string/parseChineseNumber.ts');

    it('已有完整 TSDoc 与失败契约（防回退）', () => {
      expect(documented(source, 'export function parseChineseNumber')).toBe(true);
      expect(source).toContain('@throws');
    });
  });
});
