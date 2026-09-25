/**
 * @fileoverview T055：受信调用点登记表与核心侧的批量写门禁（SC-010、adapter-contract.md §3）。
 *
 * @remarks
 * 这个文件守的是**两张表之间的距离**：`adapter-contract.md` §3 的 11 行表格，与
 * `TRUSTED_CALLSITE_REGISTRY` 的 11 个字面量。两处对不上，`declareTrustedWrite` 的运行时抛错就会
 * 在**跑到那条路径时**才发现——而受信路径里有一半（切分支、redo 失效、cleanup）平时根本不跑。
 *
 * **US-025 抽包挪走了第三张表。** 9 处真实的 `declareTrustedWrite()` 原本就在
 * `packages/rxdb/src/version/` 下，这份测试直接 `import.meta.glob` 读原文逐行核对；抽包之后
 * #1~#6 去了 `@aiao/rxdb-plugin-history`、#7~#9 去了 `@aiao/rxdb-plugin-sync`，8 处 QueryCache
 * 批量写去了 `@aiao/rxdb-plugin-querycache` 与 `@aiao/rxdb-plugin-sync`。vitest 的 `import.meta.glob`
 * 进不了兄弟包，于是这份测试对那两半是**结构性失明**——不是少看了几行，是一行都看不见。
 * 后来补登的 #10 / #11 从一开始就在 `@aiao/rxdb-plugin-working-tree` 里，同样看不见。
 *
 * 失明的那两半整个交给 `scripts/audit/working-tree-callsite-drift.mjs`（T066，
 * `pnpm audit:callsite-drift`）：它跑在 node 里，扫整个 `packages/`，双向比对登记键、自报符号、
 * 作用域宿主与存档行号。**不要在这里把它们重建回来**：核心里的 glob 抄不到别的包，重建出来的
 * 只会是一份「全绿但什么都没扫」的门禁，而那种形态与真的通过逐字节相同。
 *
 * 留在这里的是核心看得见、而且**只有**核心看得见的三件事：
 *
 * 1. **登记表与 §3 逐格一致。** 契约表格是从 markdown 现场解析出来的，不是抄进来的常量。抄一份进
 *    测试，改契约时只要顺手把测试里那份也改了就仍然全绿——被守住的从来只有「我抄得一致」，不是
 *    「登记表跟契约一致」。§3 那张表是六个适配器作者读的那一份，它变了就必须有人重新核对代码。
 *    这一条留在核心，因为登记表这个 TS 值在核心，而 T066 只能把它从源码里词法解析出来。
 * 2. **核心自身一处受信写、一处批量写都没有。** 这是抽包立起来的那条边界的可判定形式：受信写与
 *    批量写全部住在插件里，核心只留门禁本身（`declareTrustedWrite` 与 4 步判定）。有人往核心加回
 *    一条批量重写路径，T066 会因为「没登记」而红，这里会因为「核心不该有」而红——后者说的是
 *    边界，前者说的是登记，两句话不互相替代。
 * 3. **扫描器本身没瞎。** 第 2 条报的是一个空集合，而空集合有两种来源：真的没有，和扫描器把什么
 *    都涂白了。所以造好的样本（真实形状的声明、TSDoc 里的示例、字符串里的写法、接口成员）各占
 *    一条用例，逼扫描器在同一份实现上同时给出「认得出」与「不误报」。
 *
 * 另外几条判据没变，照抄在这里免得下次有人「优化」掉：
 *
 * - **「产生工作树单元」那一列不在这里比对，因为核心算不出它。** 登记表刻意不存这一列
 *   （见 `trusted-write-intent.ts` 的 `TrustedCallsite` 注释）：它是捕获矩阵的结论，不是核心的事实。
 *   算它要 `producesWorkingTreeEntry()`，而那个函数在 `@aiao/rxdb-plugin-working-tree` 里——核心
 *   够不着，**也不该够得着**。那一列在
 *   `packages/rxdb-plugin-working-tree/src/__tests__/working-tree/trusted-callsite-capture.spec.ts`
 *   里解析**同一份**契约原文比对；两边各自解析而不是一边抄另一边，是为了让契约改动同时落到两处。
 * - **漂移扫描按「调用点身份」判，不按实参判。** 真实批量写传的全是 `this.entityName` / `entity`
 *   这类运行期值，没有一处是字面量——想从实参读出「这是不是 QueryCache」的扫描，在真实仓库上恒等于
 *   「什么都报不出来」，而它会以全绿的形态存在下去。允许集因此是 `文件 · 接收者` 的登记，
 *   如今那份登记在 T066 的 `QUERY_CACHE_BULK_WRITE_CALLSITES` 里（核心侧的允许集是空的：核心一处都没有）。
 * - **扫描前必须把注释与字符串涂白。** `rxdb-adapter.ts` 的 `@example` 里逐字写着
 *   `adapter.upsertMany('Product', [product1, product2])`——一条**正是**门禁要拦的形状的文档示例。
 *   纯文本匹配会把它永远报成违规，而一条永远红的门禁的下场是被删掉。
 * - **涂白器必须在每个文件上收敛回 `code` 态，这条单独断言。** 一个没收敛的文件（比如正则字面量里
 *   带奇数个引号）会让**它之后的全部内容**被当成字符串涂掉——扫描对那一段彻底失明，而失明的外在
 *   表现与「干净」逐字节相同。
 * - **排除清单既断言在判定函数上，也断言在真正喂进扫描的文件清单上。** 只测判定函数，没人保证
 *   glob 真按它过滤；只测 glob，判定函数就是一段装饰。两头都钉住，中间才没有缝。
 */

import { describe, expect, it } from 'vitest';
// 本包的测试跑在 chromium 里，没有 node:fs。要拿契约原文与真实源码做逐行核对，唯一的办法是
// Vite 的 `?raw` / `import.meta.glob`——它们在构建期把内容内联成字符串。
// eslint-disable-next-line @nx/enforce-module-boundaries -- specs/ 不是 Nx 项目，是这张登记表的契约原文，越过包边界读的正是它
import ADAPTER_CONTRACT from '../../../../../specs/001-working-tree-commits/contracts/adapter-contract.md?raw';
import {
  TRUSTED_CALLSITE_REGISTRY,
  trustedCallsiteKey,
  TrustedWriteIntent,
  type TrustedCallsite
} from '../../trusted-write/trusted-write-intent.js';
import { WRITE_ENTRANCES } from '../../trusted-write/write-entrance.js';

// ---------------------------------------------------------------------------
// 源码快照：`src/**` 下的全部核心源码。10 处受信写声明与 8 处 QueryCache 批量写都不在这棵树里
// （文件头），所以这份快照如今只用来证明**核心自己一处都没有**。
// 负向 glob 与 {@link isScannedSourcePath} 一一对应，下面有一条用例把两者钉在一起。
// ---------------------------------------------------------------------------

/** 参与漂移扫描的全部包内源码；排除项见 adapter-contract.md §3 末段。 */
const PACKAGE_SOURCES = import.meta.glob<string>(
  ['../../**/*.ts', '!../../__tests__/**', '!../../**/*.spec.ts', '!../../**/*.suite.ts'],
  { query: '?raw', import: 'default', eager: true }
);

/** glob 键去掉 `../../` 前缀，得到相对 `packages/rxdb/src/` 的路径。 */
const relativeToSrc = (globKey: string): string => globKey.replace(/^(?:\.\.\/)+/, '');

/** 一个待扫描的源文件。 */
interface ScannedFile {
  /** 相对 `packages/rxdb/src/` 的路径 */
  readonly path: string;

  /** 原文 */
  readonly source: string;
}

/** `src/**` 的扫描输入，按路径排序，便于失败信息稳定。 */
const SCANNED_FILES: readonly ScannedFile[] = Object.entries(PACKAGE_SOURCES)
  .map(([globKey, source]) => ({ path: relativeToSrc(globKey), source }))
  .sort((left, right) => left.path.localeCompare(right.path));

// ---------------------------------------------------------------------------
// 词法层：把注释、字符串与正则字面量涂成等长空白（换行保留，行号不变）。
// ---------------------------------------------------------------------------

/** 涂白器的状态。 */
type ScanMode = 'code' | 'line_comment' | 'block_comment' | 'single' | 'double' | 'template' | 'regex';

/** `/` 出现在这些字符之后时是正则开头，不是除号。与 `scripts/audit/` 既有审计脚本同一份判据。 */
const REGEX_AFTER_PUNCTUATION: ReadonlySet<string> = new Set('(,=:[!&|?{};+-*%~^<>'.split(''));

/** `/` 出现在这些关键字之后时同样是正则开头（`return /x/.test(y)`）。 */
const REGEX_AFTER_KEYWORD: ReadonlySet<string> = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'typeof',
  'void',
  'yield'
]);

/** 三种字符串字面量的开头字符到状态。 */
const STRING_MODES: Readonly<Record<string, ScanMode | undefined>> = {
  "'": 'single',
  '"': 'double',
  '`': 'template'
};

/** 三种字符串字面量的收尾字符。 */
const STRING_CLOSERS = { single: "'", double: '"', template: '`' } as const;

/** 在 code 态遇到这个字符时开启的非代码区间。 */
const openerAt = (
  char: string,
  next: string,
  lastChar: string,
  word: string
): { readonly mode: ScanMode; readonly width: number } | undefined => {
  if (char === '/' && next === '/') return { mode: 'line_comment', width: 2 };
  if (char === '/' && next === '*') return { mode: 'block_comment', width: 2 };
  if (char === '/' && (lastChar === '' || REGEX_AFTER_PUNCTUATION.has(lastChar) || REGEX_AFTER_KEYWORD.has(word))) {
    return { mode: 'regex', width: 1 };
  }
  const stringMode = STRING_MODES[char];
  return stringMode ? { mode: stringMode, width: 1 } : undefined;
};

/** 涂白结果；`mode` 是扫描结束时的状态，非 `code` 即这个文件被看漏了一截。 */
interface BlankedSource {
  /** 注释 / 字符串 / 正则已涂白的等行数源码 */
  readonly code: string;

  /** 扫描结束时的状态 */
  readonly mode: ScanMode;
}

/**
 * 把注释、字符串与正则字面量涂成空格，保留全部换行
 *
 * @param source - 源文件原文
 * @returns 等行数的涂白结果与收尾状态
 */
const blankNonCode = (source: string): BlankedSource => {
  const out: string[] = [];
  let mode: ScanMode = 'code';
  let index = 0;
  let lastChar = '';
  let lastWord = '';
  let pendingWord = '';
  let inCharClass = false;

  while (index < source.length) {
    const char = source[index];
    const next = index + 1 < source.length ? source[index + 1] : '';

    if (mode === 'code') {
      const opened = openerAt(char, next, lastChar, pendingWord === '' ? lastWord : pendingWord);
      if (opened) {
        mode = opened.mode;
        inCharClass = false;
        if (pendingWord !== '') lastWord = pendingWord;
        pendingWord = '';
        out.push(' '.repeat(opened.width));
        index += opened.width;
        continue;
      }
      if (/[\w$]/.test(char)) pendingWord += char;
      else if (pendingWord !== '') {
        lastWord = pendingWord;
        pendingWord = '';
      }
      if (!/\s/.test(char)) lastChar = char;
      out.push(char);
      index += 1;
      continue;
    }

    if (mode === 'line_comment') {
      if (char === '\n') mode = 'code';
      out.push(char === '\n' ? '\n' : ' ');
      index += 1;
      continue;
    }

    if (mode === 'block_comment') {
      if (char === '*' && next === '/') {
        mode = 'code';
        out.push('  ');
        index += 2;
        continue;
      }
      out.push(char === '\n' ? '\n' : ' ');
      index += 1;
      continue;
    }

    if (char === '\\') {
      out.push(next === '' ? ' ' : '  ');
      index += next === '' ? 1 : 2;
      continue;
    }

    if (mode === 'regex') {
      if (char === '[') inCharClass = true;
      else if (char === ']') inCharClass = false;
      else if (char === '/' && !inCharClass) {
        mode = 'code';
        lastChar = '/';
        out.push(' ');
        index += 1;
        continue;
      }
      out.push(char === '\n' ? '\n' : ' ');
      index += 1;
      continue;
    }

    const closer = STRING_CLOSERS[mode];
    if (char === closer) {
      mode = 'code';
      lastChar = closer;
      out.push(' ');
      index += 1;
      continue;
    }
    out.push(char === '\n' ? '\n' : ' ');
    index += 1;
  }

  return { code: out.join(''), mode };
};

/** 涂白后的偏移量对应的 1-based 行号。 */
const lineAt = (code: string, offset: number): number => code.slice(0, offset).split('\n').length;

// ---------------------------------------------------------------------------
// adapter-contract.md §3 的表格解析
// ---------------------------------------------------------------------------

/** §3 表格的一行，逐格保留原文。 */
interface ContractRow {
  /** 表格第一列的序号 */
  readonly index: number;

  /** 文件名（去掉反引号） */
  readonly file: string;

  /** 符号名（取反引号内那段，丢掉「（逐条分支）」这类中文限定） */
  readonly symbol: string;

  /** 写原语（去掉 `(…, false)` 这类实参示意） */
  readonly writePrimitive: string;

  /** 存档行号 */
  readonly line: number;

  /**
   * 意图列的原文标签
   *
   * @remarks
   * 第 7 列「产生工作树单元」**故意不解析**：核心算不出它（文件头第 2 条）。解析出来却没有断言
   * 比对的字段比缺字段更坏——它看着像被守住了。那一列在插件侧的 `trusted-callsite-capture.spec.ts`
   * 里解析并比对。
   */
  readonly intentLabel: string;
}

/** 取 markdown 里两个标题之间那一段；取不到就抛，不给静默的空串。 */
const sectionOf = (markdown: string, heading: string, nextHeading: string): string => {
  const after = markdown.split(heading)[1];
  if (after === undefined) throw new Error(`adapter-contract.md 里找不到标题「${heading}」`);
  const body = after.split(nextHeading)[0];
  if (body === undefined) throw new Error(`「${heading}」之后找不到「${nextHeading}」`);
  return body;
};

/** 取单元格里第一段反引号包裹的文本。 */
const backticked = (cell: string): string => {
  const matched = /`([^`]+)`/.exec(cell);
  if (!matched) throw new Error(`契约表格单元格里没有反引号标识符：${cell}`);
  return matched[1];
};

/** §3 的 11 行，现场从契约原文解析。 */
const CONTRACT_ROWS: readonly ContractRow[] = sectionOf(ADAPTER_CONTRACT, '## 3. 受信调用点登记表', '\n## 4.')
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
  .map(cells => ({
    index: Number(cells[0]),
    file: backticked(cells[1]),
    symbol: backticked(cells[2]),
    writePrimitive: backticked(cells[3]).replace(/\(.*\)$/, ''),
    line: Number(cells[4]),
    intentLabel: cells[5]
  }));

/**
 * 契约表格「意图」列的中文标签到枚举
 *
 * @remarks
 * 这是整份测试里唯一一处人工对照，因为契约表格给的是人读的标签、代码给的是枚举名，两边没有
 * 可推导的关系。下面有一条用例断言这张映射对 7 个意图既**全覆盖**又**不重号**——漏一个或把两个
 * 标签指到同一个枚举，都会在那里红，而不是悄悄让某一行失去比对。
 */
const INTENT_BY_CONTRACT_LABEL: Readonly<Record<string, TrustedWriteIntent>> = {
  分支物化: TrustedWriteIntent.branch_materialization,
  实体恢复: TrustedWriteIntent.restore_entity,
  'redo 失效标记': TrustedWriteIntent.redo_invalidation,
  '撤销 / 重做': TrustedWriteIntent.undo_redo,
  逐条合并: TrustedWriteIntent.merge_per_change,
  压缩合并: TrustedWriteIntent.merge_squash,
  '`remote_sync`': TrustedWriteIntent.remote_sync
};

// ---------------------------------------------------------------------------
// `declareTrustedWrite()` 声明的提取
// ---------------------------------------------------------------------------

/** 真实代码里的一处受信写声明。 */
interface DeclaredCallsite {
  /** 所在文件，相对 `packages/rxdb/src/` */
  readonly path: string;

  /** 第一个实参的变量名，即作用域对象（`adapter` / `executor`） */
  readonly scope: string;

  /** 自报的文件名 */
  readonly file: string;

  /** 自报的符号 */
  readonly symbol: string;

  /** 自报的意图 */
  readonly intent: string;

  /** 声明起始行（1-based） */
  readonly line: number;

  /** 声明结束处在涂白源码里的偏移量 */
  readonly endOffset: number;
}

/** 形状完整的声明；字段顺序与 `TrustedWriteDeclaration` 一致，写歪了就匹配不上。 */
const DECLARATION_PATTERN =
  /declareTrustedWrite\(\s*([A-Za-z_$][\w$]*)\s*,\s*\{\s*file:\s*'([^']*)',\s*symbol:\s*'([^']*)',\s*intent:\s*TrustedWriteIntent\.([A-Za-z_]\w*)\s*,?\s*\}\s*\)/g;

/** 声明的三个字段都是字符串字面量，涂白之后一个引号都不剩——所以匹配必须在原文上做。 */
const DECLARE_CALL = 'declareTrustedWrite';

/**
 * 取出一个文件里的全部受信写声明
 *
 * @param path - 文件路径，相对 `packages/rxdb/src/`
 * @param source - 原文；正则在这上面跑，因为三个字段都是字符串字面量
 * @returns 位于真实代码区（不在注释或字符串里）的声明
 *
 * @remarks
 * 涂白后的源码与原文**等长**，于是偏移量可以互换：拿原文的匹配位置去涂白源码里看一眼，
 * 那里还留着 `declareTrustedWrite` 就说明这处声明在代码区，被涂白了就说明它躺在注释或字符串里。
 * 少了这道闸，TSDoc 里贴一段示例声明就会被当成真实调用点计入。
 */
const declarationsIn = (path: string, source: string): readonly DeclaredCallsite[] => {
  const { code } = blankNonCode(source);
  return [...source.matchAll(DECLARATION_PATTERN)]
    .filter(matched => code.startsWith(DECLARE_CALL, matched.index))
    .map(matched => ({
      path,
      scope: matched[1],
      file: matched[2],
      symbol: matched[3],
      intent: matched[4],
      line: lineAt(source, matched.index),
      endOffset: matched.index + matched[0].length
    }));
};

/** `src/**` 里全部受信写声明。 */
const DECLARED_CALLSITES: readonly DeclaredCallsite[] = SCANNED_FILES.flatMap(file =>
  declarationsIn(file.path, file.source)
);

// ---------------------------------------------------------------------------
// 批量写漂移扫描
// ---------------------------------------------------------------------------

/** 受门禁约束的两个 adapter 公开批量写方法。 */
const BULK_WRITE_METHODS = ['upsertMany', 'deleteByIds'] as const;

/** `<接收者>.upsertMany(` / `<接收者>.deleteByIds(`；要求有接收者，于是接口成员与 abstract 声明天然落选。 */
const BULK_WRITE_PATTERN = new RegExp(
  String.raw`((?:this|[A-Za-z_$][\w$]*)(?:\s*\.\s*#?[A-Za-z_$][\w$]*)*)\s*\.\s*(${BULK_WRITE_METHODS.join('|')})\s*\(`,
  'g'
);

/** 一处批量写调用点。 */
interface BulkWriteCallsite {
  /** 所在文件，相对 `packages/rxdb/src/` */
  readonly path: string;

  /** 1-based 行号 */
  readonly line: number;

  /** 接收者表达式，空白已归一 */
  readonly receiver: string;

  /** 调的是哪个方法 */
  readonly method: string;
}

/** 取出一批文件里的全部批量写调用点。 */
const bulkWriteCallsites = (files: readonly ScannedFile[]): readonly BulkWriteCallsite[] =>
  files.flatMap(file => {
    const { code } = blankNonCode(file.source);
    return [...code.matchAll(BULK_WRITE_PATTERN)].map(matched => ({
      path: file.path,
      line: lineAt(code, matched.index),
      receiver: matched[1].replace(/\s+/g, ''),
      method: matched[2]
    }));
  });

/** 失败信息用的紧凑形态。 */
const locate = (callsite: BulkWriteCallsite): string =>
  `${callsite.path}:${callsite.line} ${callsite.receiver}.${callsite.method}()`;

/**
 * 这个路径进不进静态扫描
 *
 * @param path - 仓库相对路径
 * @returns 五类排除项都不命中时为 `true`（adapter-contract.md §3 末段）
 */
const isScannedSourcePath = (path: string): boolean => {
  const segments = path.split('/');
  if (segments.includes('dist') || segments.includes('out-tsc') || segments.includes('__tests__')) return false;
  return !path.endsWith('.spec.ts') && !path.endsWith('.suite.ts');
};

// ---------------------------------------------------------------------------

describe('登记表与 adapter-contract.md §3 的表格逐行一致', () => {
  it('契约表格解析出 11 行，与登记表长度一致', () => {
    expect(CONTRACT_ROWS).toHaveLength(11);
    expect(TRUSTED_CALLSITE_REGISTRY).toHaveLength(CONTRACT_ROWS.length);
    expect(CONTRACT_ROWS.map(row => row.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('文件、符号、写原语、存档行号逐格相同，顺序也相同', () => {
    const fromRegistry = TRUSTED_CALLSITE_REGISTRY.map(row => ({
      file: row.file,
      symbol: row.symbol,
      writePrimitive: row.writePrimitive,
      line: row.verifiedAtLine
    }));
    const fromContract = CONTRACT_ROWS.map(row => ({
      file: row.file,
      symbol: row.symbol,
      writePrimitive: row.writePrimitive,
      line: row.line
    }));
    expect(fromRegistry).toEqual(fromContract);
  });

  it('意图标签映射对 7 个枚举既全覆盖又不重号', () => {
    const mapped = Object.values(INTENT_BY_CONTRACT_LABEL);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...new Set(mapped)].sort()).toEqual(Object.values(TrustedWriteIntent).sort());
  });

  it('每一行的意图与契约表格的意图列对得上', () => {
    const fromContract = CONTRACT_ROWS.map(row => INTENT_BY_CONTRACT_LABEL[row.intentLabel]);
    expect(fromContract).not.toContain(undefined);
    expect(TRUSTED_CALLSITE_REGISTRY.map(row => row.intent)).toEqual(fromContract);
  });

  it('每一行的 entrance 都是矩阵认得的入口', () => {
    const unknown = TRUSTED_CALLSITE_REGISTRY.filter(row => !WRITE_ENTRANCES.includes(row.entrance));
    expect(unknown).toEqual([]);
  });

  it('登记表只用两个写原语：switchBranch 绑适配器，mergeChanges 一律绑执行器', () => {
    // `adapter.mergeChanges` 一行都不该剩。声明存在一个 WeakMap 里，每个作用域只存一条，
    // 而 `interceptMergeChanges()` 是排队拿到事务之后才取声明的——绑适配器实例时两个并发的
    // `mergeChanges` 会互相覆盖（`rxdb-plugin-history/src/__tests__/trusted-write-concurrency.spec.ts`）。
    // `switchBranch` 不在此列：它在调用钩子时同步消费声明，没有排队窗口。
    expect([...new Set(TRUSTED_CALLSITE_REGISTRY.map(row => row.writePrimitive))].sort()).toEqual([
      'adapter.switchBranch',
      'executor.mergeChanges'
    ]);
    const viaSwitchBranch = TRUSTED_CALLSITE_REGISTRY.filter(row => row.writePrimitive === 'adapter.switchBranch');
    expect(viaSwitchBranch.map(row => row.symbol)).toEqual([
      'switchBranch',
      'invalidateRedoStack',
      'applyUndoRedoHistories',
      'switchWithMaterialization'
    ]);
    // metadata-only 接管路径的物化不再自己开事务切 active（原 #10 走 `adapter.transaction`）：
    // 它发起一次 `switchBranch`（#10），屏障在那次切换的 `prepare` 里经执行器落投影（#11）。
    // `adapter.transaction` 重新出现在这一列，就是有人又给一笔普通事务发了受信票。
  });
});

describe('核心自身既不受信写，也不批量写', () => {
  it('核心源码里一处 declareTrustedWrite 都没有', () => {
    // 11 处声明全在 history / sync / working-tree 三个插件里（文件头）。核心留的是门禁本身，不是调用点：
    // 这里冒出一处，要么是有人把受信路径搬回了核心，要么是新加了一条——两种都必须先过 §3。
    expect(DECLARED_CALLSITES.map(declared => `${declared.path}:${declared.line}`)).toEqual([]);
  });

  it('核心源码里一处批量写调用点都没有', () => {
    // QueryCache 那 8 处跟着 `@aiao/rxdb-plugin-querycache` / `@aiao/rxdb-plugin-sync` 走了。
    // 核心里的 `upsertMany` / `deleteByIds` 只剩 `rxdb-adapter.ts` 的 abstract 声明与
    // `capture/capture-interceptor.ts` 的包装——两者都没有「接收者.方法(」这个形状。
    expect(bulkWriteCallsites(SCANNED_FILES).map(locate)).toEqual([]);
  });

  it('注释或字符串里的 declareTrustedWrite 不算声明', () => {
    const decoy = [
      '/**',
      ' * @example',
      " * declareTrustedWrite(adapter, { file: 'Sample.ts', symbol: 'save', intent: TrustedWriteIntent.undo_redo });",
      ' */',
      "const hint = \"declareTrustedWrite(executor, { file: 'Sample.ts', symbol: 'save', intent: TrustedWriteIntent.undo_redo })\";",
      ''
    ].join('\n');
    expect(declarationsIn('version/Sample.ts', decoy)).toEqual([]);
  });

  it('真实形状的声明会被认出来，连同作用域与行号', () => {
    // 上面那条「核心一处都没有」报的是空集合，而空集合有两种来源（文件头第 3 条）。
    // 这一条钉住的是另一种：同一份提取器在真实形状上确实认得出来。
    const real = [
      'async function save() {',
      '  declareTrustedWrite(executor, {',
      "    file: 'Sample.ts',",
      "    symbol: 'save',",
      '    intent: TrustedWriteIntent.undo_redo',
      '  });',
      '  await executor.mergeChanges(actions, undefined, true);',
      '}',
      ''
    ].join('\n');
    expect(declarationsIn('version/Sample.ts', real)).toEqual([
      {
        path: 'version/Sample.ts',
        scope: 'executor',
        file: 'Sample.ts',
        symbol: 'save',
        intent: 'undo_redo',
        line: 2,
        endOffset: expect.any(Number)
      }
    ]);
  });
});

describe('登记键：文件 + 符号 + 意图', () => {
  it('11 行 11 个键，#5 逐条合并与 #6 压缩合并不重合', () => {
    const keys = TRUSTED_CALLSITE_REGISTRY.map(trustedCallsiteKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[4]).not.toBe(keys[5]);
    expect(keys[4]).toBe('merge-branch.ts·merge_branch·merge_per_change');
    expect(keys[5]).toBe('merge-branch.ts·merge_branch·merge_squash');
  });

  it('键不含行号：改存档行号不改变键', () => {
    const row = TRUSTED_CALLSITE_REGISTRY[0];
    const shifted: TrustedCallsite = { ...row, verifiedAtLine: row.verifiedAtLine + 137 };
    expect(trustedCallsiteKey(shifted)).toBe(trustedCallsiteKey(row));
  });

  it('键不含写原语：同一条策略换个宿主不算新增调用点', () => {
    const row = TRUSTED_CALLSITE_REGISTRY[4];
    const rehosted: TrustedCallsite = { ...row, writePrimitive: 'adapter.mergeChanges' };
    expect(trustedCallsiteKey(rehosted)).toBe(trustedCallsiteKey(row));
  });
});

describe('批量写扫描器：认得出，也不误报', () => {
  it('一处打业务实体的 upsertMany 会被报出来', () => {
    const drifted = bulkWriteCallsites([
      {
        path: 'repository/ProductRepository.ts',
        source: 'async saveAll(rows: Product[]) {\n  await this.adapter.upsertMany(this.entityName, rows);\n}\n'
      }
    ]);
    expect(drifted.map(locate)).toEqual(['repository/ProductRepository.ts:2 this.adapter.upsertMany()']);
  });

  it('接收者算进调用点身份，换一个就是另一处', () => {
    // 允许集按 `文件 · 接收者` 登记（文件头）。那份登记如今在 T066 里，但「接收者被记下来了」
    // 这件事必须在这一侧也成立——扫描器要是把接收者丢了，T066 的允许集就永远匹配不上。
    const found = bulkWriteCallsites([
      {
        path: 'QueryCacheEngine.ts',
        source: 'const go = () => this.remoteAdapter.deleteByIds(this.entityName, ids);\n'
      }
    ]);
    expect(found.map(callsite => callsite.receiver)).toEqual(['this.remoteAdapter']);
  });

  it('TSDoc @example 里的示例不算调用点', () => {
    const docExample = [
      '/**',
      ' * @example',
      " * adapter.upsertMany('Product', [product1, product2]).subscribe();",
      " * adapter.deleteByIds('Product', ['p1', 'p2']).subscribe();",
      ' */',
      'export abstract class RxDBAdapter {}',
      ''
    ].join('\n');
    expect(bulkWriteCallsites([{ path: 'rxdb-adapter.ts', source: docExample }])).toEqual([]);
  });

  it('字符串里的写法不算调用点', () => {
    const inString = "const hint = 'this.adapter.upsertMany(name, rows)';\n";
    expect(bulkWriteCallsites([{ path: 'trusted-write/trusted-write-scope.ts', source: inString }])).toEqual([]);
  });

  it('接口成员与 abstract 声明不算调用点', () => {
    const declarations = [
      'export interface LocalWritePort {',
      '  upsertMany(entityName: string, rows: object[]): Observable<void>;',
      '  deleteByIds(entityName: string, ids: string[]): Observable<void>;',
      '}',
      'abstract deleteByIds(entityName: string, ids: string[]): Observable<void>;',
      ''
    ].join('\n');
    expect(bulkWriteCallsites([{ path: 'rxdb-adapter.ts', source: declarations }])).toEqual([]);
  });

  it('同一行里的 URL 字符串不会把它后面的调用吃掉', () => {
    const source = "log('see https://x/y'); this.adapter.upsertMany(name, rows);\n";
    expect(bulkWriteCallsites([{ path: 'repository/Sample.ts', source }]).map(locate)).toEqual([
      'repository/Sample.ts:1 this.adapter.upsertMany()'
    ]);
  });

  it('涂白器在每个真实源文件上都收敛回 code 态', () => {
    const desynced = SCANNED_FILES.filter(file => blankNonCode(file.source).mode !== 'code').map(file => file.path);
    expect(desynced).toEqual([]);
  });

  it('涂白不改变行数，行号因此可信', () => {
    const shifted = SCANNED_FILES.filter(
      file => blankNonCode(file.source).code.split('\n').length !== file.source.split('\n').length
    ).map(file => file.path);
    expect(shifted).toEqual([]);
  });
});

describe('扫描排除（adapter-contract.md §3 末段）', () => {
  it('五类排除项都不进扫描', () => {
    // `*.suite.ts` 与并排的 `*.spec.ts` 这两类今天在核心里一个实例都没有（一致性套件随
    // epic-006 去了插件包，核心的 spec 一律在 `__tests__/` 下）。规则照留：排除集是
    // adapter-contract.md §3 末段定死的五类，而下面那条负向 glob 仍然带着它们——
    // 判定函数先把某一类放掉，等哪天核心重新有了这类文件，漏的是扫描而不是这条用例。
    const excluded = [
      'packages/rxdb/dist/repository/QueryCacheRepository.js',
      'packages/rxdb/out-tsc/vitest/repository/QueryCacheRepository.js',
      'packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts',
      'packages/rxdb/src/__tests__/fixtures/test-db-setup.ts',
      'packages/rxdb/src/capture/capture.suite.ts',
      'packages/rxdb/src/capture/capture-interceptor.spec.ts'
    ];
    expect(excluded.filter(isScannedSourcePath)).toEqual([]);
  });

  it('普通源码文件进扫描', () => {
    const included = [
      'packages/rxdb/src/repository/QueryManager.ts',
      'packages/rxdb/src/capture/capture-interceptor.ts',
      'packages/rxdb/src/trusted-write/trusted-write-scope.ts'
    ];
    expect(included.filter(isScannedSourcePath)).toEqual(included);
  });

  it('排除的是路径段，不是子串', () => {
    expect(isScannedSourcePath('packages/rxdb/src/distributed/plan.ts')).toBe(true);
    expect(isScannedSourcePath('packages/rxdb/src/repository/suite-context.ts')).toBe(true);
  });

  it('真正喂进扫描的文件清单本身满足排除规则', () => {
    expect(SCANNED_FILES.length).toBeGreaterThan(100);
    expect(SCANNED_FILES.filter(file => !isScannedSourcePath(file.path)).map(file => file.path)).toEqual([]);
  });

  it('登记表点名的 9 个文件一个都不在核心的扫描清单里', () => {
    // 反过来断言：抽包之后它们**应该**全部不在。哪天有一个回到核心而登记表没跟着改，
    // 这里会红——而 T066 那一侧不会，它按基名找，找得到就算数，不问在哪个包。
    const scanned = new Set(SCANNED_FILES.map(file => file.path.split('/').pop()));
    const stillInCore = [...new Set(TRUSTED_CALLSITE_REGISTRY.map(row => row.file))].filter(file => scanned.has(file));
    expect(stillInCore).toEqual([]);
  });
});
