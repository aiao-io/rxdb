/**
 * @fileoverview 受信调用点的**结论列**：adapter-contract.md §3 第 7 列「产生工作树单元」（SC-010）。
 *
 * @remarks
 * §3 那张表的另外六列描述的是核心的事实——哪个文件、哪个符号、哪个写原语、什么意图——
 * 它们由 `packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts` 逐格核对，
 * 那份还要在 `packages/rxdb/src/**` 上做静态扫描，只能跑在核心包里。
 *
 * 剩下的第 7 列跟着捕获语义走，于是落在这里。三条理由说明它为什么不能并回那一份：
 *
 * 1. **登记表刻意不存这一列**（见 `trusted-write-intent.ts` 的 `TrustedCallsite` 注释）。它是
 *    {@link producesWorkingTreeEntry} 从写入口矩阵算出来的结论，而矩阵是本插件的。测试若去比对
 *    登记表的某个字段，等于逼着核心把这一列加回来——核心就要为一个布尔值反向依赖捕获语义。
 * 2. **算这一列的函数在包外，核心 import 不到。** 这不是打包配置的缺陷，正是抽包要立的边界。
 * 3. **契约原文在这里重新解析一遍，不从核心那份测试里抄。** 两份各自解析同一段 markdown，
 *    §3 改一格两边同时红；抄一份过来的话，改契约只会红在核心那一侧，这一侧照旧全绿——
 *    而全绿的那一侧恰好是判「捕获规则要不要跟着改」的那一侧。
 *
 * 断言只有两条，因为这一列只有两种取值、且分布本身就是规格：**9 行里恰好 2 行不产生单元**——
 * #1 分支物化与 #3 redo 失效。这两条是「受信写不一定进工作树」的全部证据；多出第三行
 * 意味着某条真实编辑路径的痕迹被悄悄咽掉了，少一行则意味着库自己的簿记开始落进用户的工作树。
 */

import { TRUSTED_CALLSITE_REGISTRY } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries -- specs/ 不是 Nx 项目，是这张登记表的契约原文，越过包边界读的正是它
import ADAPTER_CONTRACT from '../../../../../specs/001-working-tree-commits/contracts/adapter-contract.md?raw';
import { producesWorkingTreeEntry } from '../../working-tree/trusted-callsite-capture.js';

/** 取 markdown 里两个标题之间那一段；取不到就抛，不给静默的空串。 */
const sectionOf = (markdown: string, heading: string, nextHeading: string): string => {
  const after = markdown.split(heading)[1];
  if (after === undefined) throw new Error(`adapter-contract.md 里找不到标题「${heading}」`);
  const body = after.split(nextHeading)[0];
  if (body === undefined) throw new Error(`「${heading}」之后找不到「${nextHeading}」`);
  return body;
};

/**
 * §3 表格第 7 列，按行序取出
 *
 * @remarks
 * 只解析这一列。其余六列在核心那份测试里逐格比对，这里再解析一遍只会多出一处会漂的副本。
 * 行序即 `TRUSTED_CALLSITE_REGISTRY` 的下标——「逐格同序」本身是核心那份的断言，这里直接用它的结论。
 */
const CONTRACT_PRODUCES_ENTRY: readonly boolean[] = sectionOf(ADAPTER_CONTRACT, '## 3. 受信调用点登记表', '\n## 4.')
  .split('\n')
  .filter(line => line.trimStart().startsWith('|'))
  .map(line =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim())
  )
  .filter(cells => /^\d+$/.test(cells[0]))
  .map(cells => cells[6] === '**必须产生**');

describe('adapter-contract.md §3 第 7 列：产生工作树单元', () => {
  it('这一列由矩阵算出，不从登记表字段里读', () => {
    // 前置：契约那张表确实解析出了 9 行。少解析出几行的话，下面的 toEqual 会在两个短数组之间
    // 全绿——被守住的就从「9 行都对」缩成「解析到的那几行都对」，而缩水不会有任何症状。
    expect(CONTRACT_PRODUCES_ENTRY).toHaveLength(TRUSTED_CALLSITE_REGISTRY.length);
    const computed = TRUSTED_CALLSITE_REGISTRY.map(row => producesWorkingTreeEntry(row));
    expect(computed).toEqual(CONTRACT_PRODUCES_ENTRY);
  });

  it('不产生单元的恰好是 #1 分支物化与 #3 redo 失效', () => {
    const notProducing = TRUSTED_CALLSITE_REGISTRY.filter(row => !producesWorkingTreeEntry(row)).map(
      row => `${row.file}·${row.symbol}`
    );
    expect(notProducing).toEqual(['VersionManager.ts·switchBranch', 'HistoryManager.ts·invalidateRedoStack']);
  });
});
