/**
 * `FileNode` / `FileLarge` 的三个计算属性是**发布出去的行为**（三端 demo 的文件树直接
 * 渲染 `fullName`、按 `isFolder` 分叉、用 `sizeFormatted` 显示体积），却一条用例都没有
 * ——`entities/` 长期不在任何 coverage 分母里，谁也没发现（RXT-030）。
 *
 * 这两个类是逐字重复的一对（大数据量 demo 与普通 demo 各一份），所以用同一张表驱动：
 * 任何一侧被单独改动都会立刻红，这正是重复代码最需要的守卫。
 */
import { describe, expect, it } from 'vitest';

import { FileLarge } from '../../entities/FileLarge.js';
import { FileNode } from '../../entities/FileNode.js';

/** 被测的两个类共享完全相同的计算属性实现，用例对二者逐一重放。 */
const VARIANTS = [
  { label: 'FileNode', Ctor: FileNode },
  { label: 'FileLarge', Ctor: FileLarge }
] as const;

type FileLike = FileNode | FileLarge;

/**
 * 走 `Object.create` 而不是 `new Ctor()`：`@Entity` 的构造函数第一件事就是取
 * `ENTITY_MANAGER`，没有连上适配器就抛 `need init rxdb`。这三个计算属性是纯函数，
 * 只依赖实例上的四个字段，不该为了测它们去起一个数据库 —— 而这条门槛正是它们
 * 至今一条用例都没有的原因。原型链照常继承，getter 与真实实例上的是同一份。
 */
const build = (Ctor: (typeof VARIANTS)[number]['Ctor'], patch: Partial<FileLike>): FileLike =>
  Object.assign(
    Object.create(Ctor.prototype) as FileLike,
    {
      name: 'report',
      type: 'file' as const,
      extension: '.pdf' as string | null,
      size: 0 as number | null,
      sortOrder: null
    },
    patch
  );

describe.each(VARIANTS)('$label 计算属性', ({ Ctor }) => {
  describe('fullName', () => {
    it('拼接文件名与扩展名', () => {
      expect(build(Ctor, { name: 'report', extension: '.pdf' }).fullName).toBe('report.pdf');
    });

    it('文件夹不拼扩展名 —— 即使 extension 有值', () => {
      // 文件夹带着残留 extension 是数据层允许的状态（列可空但不禁写）。
      // 这里必须按 type 判定而不是按 extension 是否为空，否则文件夹会显示成 "文档.pdf"。
      expect(build(Ctor, { name: '文档', type: 'folder', extension: '.pdf' }).fullName).toBe('文档');
    });

    it('extension 为 null 的文件退回裸文件名', () => {
      expect(build(Ctor, { name: 'LICENSE', extension: null }).fullName).toBe('LICENSE');
    });

    it('extension 为空串同样退回裸文件名，不留下尾随的点', () => {
      // `!this.extension` 而不是 `extension === null`：空串走同一条路。
      expect(build(Ctor, { name: 'LICENSE', extension: '' }).fullName).toBe('LICENSE');
    });
  });

  describe('isFolder', () => {
    it('folder 为真、file 为假', () => {
      expect(build(Ctor, { type: 'folder' }).isFolder).toBe(true);
      expect(build(Ctor, { type: 'file' }).isFolder).toBe(false);
    });
  });

  describe('sizeFormatted', () => {
    it('size 为 null 时返回 null，而不是 "0.0 B"', () => {
      // 「未知大小」与「零字节」是两件事，文件夹一般是前者。
      expect(build(Ctor, { size: null }).sizeFormatted).toBeNull();
    });

    it.each([
      [0, '0.0 B'],
      [1023, '1023.0 B'],
      [1024, '1.0 KB'],
      [1536, '1.5 KB'],
      [1024 ** 2, '1.0 MB'],
      [1024 ** 3, '1.0 GB']
    ])('%i 字节格式化为 %s', (size, expected) => {
      expect(build(Ctor, { size }).sizeFormatted).toBe(expected);
    });

    it('超过 GB 后停在 GB，不会溢出单位表', () => {
      // 循环条件里的 `unitIndex < units.length - 1` 是唯一的护栏；
      // 去掉它就会读到 `units[4] === undefined`，显示成 "1.0 undefined"。
      expect(build(Ctor, { size: 1024 ** 4 }).sizeFormatted).toBe('1024.0 GB');
    });
  });
});
