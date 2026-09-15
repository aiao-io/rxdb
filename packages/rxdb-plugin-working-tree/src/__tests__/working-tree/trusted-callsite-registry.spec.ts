/**
 * @fileoverview T055 红测试：受信调用点登记表与批量写漂移扫描（SC-010、adapter-contract.md §3）。
 *
 * @remarks
 * 这个文件守的是**两张表之间的距离**：`adapter-contract.md` §3 的 9 行表格、
 * `TRUSTED_CALLSITE_REGISTRY` 的 9 个字面量、以及 `src/version/` 里 9 处真实的
 * `declareTrustedWrite()` 调用。三者只要有任意两处对不上，`declareTrustedWrite` 的运行时抛错
 * 就会在**跑到那条路径时**才发现——而受信路径里有一半（切分支、redo 失效、cleanup）平时根本不跑。
 *
 * 为什么这些断言值得写：
 *
 * 1. **契约表格是从 markdown 现场解析出来的，不是抄进来的常量。** 抄一份进测试，改契约时只要顺手
 *    把测试里那份也改了就仍然全绿——被守住的从来只有「我抄得一致」，不是「登记表跟契约一致」。
 *    §3 那张表是六个适配器作者读的那一份，它变了就必须有人重新核对代码。
 * 2. **「产生工作树单元」列不比对登记表字段，比对 {@link producesWorkingTreeEntry} 的返回值。**
 *    登记表刻意不存这一列（见 `trusted-write-intent.ts` 的 `TrustedCallsite` 注释），因为它是矩阵
 *    的结论。测试要是去比对某个字段，等于逼着实现把这一列加回来，正好毁掉那条设计。
 * 3. **9 行必须在真实代码里找得到，而且是「同一个键」找得到。** 只断言「文件里出现过这个符号名」
 *    是纸糊的：符号名在 TSDoc、在日志字符串、在调用处都会出现。这里要求的是一处形状完整的
 *    `declareTrustedWrite(scope, { file, symbol, intent })`，且 `scope` 的变量名就是写原语的宿主前缀
 *    （`adapter.` / `executor.`），再要求紧随其后真的调了那个原语。少任何一条，
 *    「登记了但没挂上」与「挂上了但登记错了」都能全绿。
 * 4. **反向也要成立：真实代码里不许有登记表之外的 `declareTrustedWrite`。** 正向检查只能发现
 *    「登记表里有、代码里没有」。而 SC-010 真正怕的是反过来——有人新加一处受信写。运行时确实会抛，
 *    但那要等到那条路径被执行；静态比对在提交时就红。
 * 5. **`verifiedAtLine` 是存档字段，不参与登记键，但不是没有义务。** 它唯一的用处是回答
 *    「上次核对的是不是同一段代码」。所以断言它仍落在同一个文件里、且距真实声明不超过 40 行
 *    （现存最大偏差是 #6 的 10 行）。行号漂到文件外或漂出一个函数，`已与真实代码核对` 这句话就
 *    只是一个日期。
 * 6. **漂移扫描按「调用点身份」判，不按实参判。** 8 处真实批量写传的实参全是
 *    `this.entityName` / `entity` 这类运行期值，没有一处是字面量——想从实参读出「这是不是
 *    QueryCache」的扫描，在真实仓库上恒等于「什么都报不出来」，而它会以全绿的形态存在下去。
 *    所以允许集是 `文件 · 接收者` 的登记，与 §3 的受信登记同一个思路。
 * 7. **扫描前必须把注释与字符串涂白。** `rxdb-adapter.ts` 的 `@example` 里逐字写着
 *    `adapter.upsertMany('Product', [product1, product2])`——一条**正是**门禁要拦的形状的文档示例。
 *    纯文本匹配会把它永远报成违规，而一条永远红的门禁的下场是被删掉。
 * 8. **涂白器必须在每个文件上收敛回 `code` 态，这条单独断言。** 一个没收敛的文件（比如正则字面量里
 *    带奇数个引号，`raw-write-judgment.ts:89` 就是）会让**它之后的全部内容**被当成字符串涂掉——
 *    扫描对那一段彻底失明，而失明的外在表现与「干净」逐字节相同。
 * 9. **排除清单既断言在判定函数上，也断言在真正喂进扫描的文件清单上。** 只测判定函数，
 *    没人保证 glob 真按它过滤；只测 glob，判定函数就是一段装饰。两头都钉住，中间才没有缝。
 *
 * **与 T066 的分工**：这份跑在 chromium 里，够得着 `TRUSTED_CALLSITE_REGISTRY` 这个 TS 值，
 * 但只看得见 `packages/rxdb/src`。`scripts/audit/working-tree-callsite-drift.mjs`（T066）跑在 node 里，
 * 看得见 `dist/`、`out-tsc/` 与另外三十个包，但读不到 TS 导出。两者互不覆盖，**别合并**。
 */

import { describe, expect, it } from 'vitest';
// 本包的测试跑在 chromium 里，没有 node:fs。要拿契约原文与真实源码做逐行核对，唯一的办法是
// Vite 的 `?raw` / `import.meta.glob`——它们在构建期把内容内联成字符串。
// eslint-disable-next-line @nx/enforce-module-boundaries -- specs/ 不是 Nx 项目，是这张登记表的契约原文，越过包边界读的正是它
import {
  TRUSTED_CALLSITE_REGISTRY,
  trustedCallsiteKey,
  TrustedWriteIntent,
  WRITE_ENTRANCES,
  type TrustedCallsite
} from '@aiao/rxdb';
import ADAPTER_CONTRACT from '../../../../../specs/001-working-tree-commits/contracts/adapter-contract.md?raw';
import { producesWorkingTreeEntry } from '../../working-tree/trusted-callsite-capture.js';

// ---------------------------------------------------------------------------
// 源码快照：`src/version/*.ts` 用于核对 9 行登记，`src/**` 用于批量写漂移扫描。
// 负向 glob 与 {@link isScannedSourcePath} 一一对应，下面有一条用例把两者钉在一起。
// ---------------------------------------------------------------------------

/** `src/version/` 下的全部源码；键形如 `../../version/VersionManager.ts`。 */
const VERSION_SOURCES = import.meta.glob<string>('../../version/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true
});

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

  /** 意图列的原文标签 */
  readonly intentLabel: string;

  /** 「产生工作树单元」列是不是 `**必须产生**` */
  readonly producesEntry: boolean;
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

/** §3 的 9 行，现场从契约原文解析。 */
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
    intentLabel: cells[5],
    producesEntry: cells[6] === '**必须产生**'
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

/** 声明自报的三段拼成登记键；这里刻意不复用 {@link trustedCallsiteKey}——它的形参是枚举，
 * 而从源码里抓出来的 `intent` 是一个还没被验证过是合法枚举名的字符串。让两边都走字符串拼接，
 * 「登记表里那个枚举的字面值」与「源码里写的那个成员名」不一致时才会红。 */
const declaredKey = (declared: DeclaredCallsite): string => `${declared.file}·${declared.symbol}·${declared.intent}`;

/** 按登记键索引，便于逐行核对。 */
const DECLARED_BY_KEY: ReadonlyMap<string, DeclaredCallsite> = new Map(
  DECLARED_CALLSITES.map(declared => [declaredKey(declared), declared])
);

/** 这个符号在文件里有没有一处真正的定义（而不是只在调用处出现过）。 */
const definesSymbol = (code: string, symbol: string): boolean => {
  const head = String.raw`^[ \t]*(?:export\s+)?(?:declare\s+)?(?:public\s+|private\s+|protected\s+|static\s+)*(?:async\s+)?`;
  return [
    new RegExp(`${head}function\\s+${symbol}\\b`, 'm'),
    new RegExp(`${head}(?:const|let)\\s+${symbol}\\b\\s*=`, 'm'),
    new RegExp(`${head}${symbol}\\s*(?:<[^>\\n]*>)?\\s*\\([^\\n]*\\)\\s*(?::[^\\n]*)?\\{[ \\t]*$`, 'm')
  ].some(pattern => pattern.test(code));
};

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

/**
 * QueryCache 专用的批量写调用点允许集
 *
 * @remarks
 * 键是 `文件 · 接收者`。**不是**实参——8 处真实调用传的都是 `this.entityName` / `entity`，
 * 从实参读不出实体身份（见文件头第 6 条）。`localAdapter` 是 QueryCache 那条路径自己的本地
 * 适配器句柄，换成任何别的接收者都意味着有人把批量写接到了业务实体上。
 */
const QUERY_CACHE_BULK_WRITE_CALLSITES: ReadonlySet<string> = new Set([
  'repository/QueryCacheRepository.ts·this.localAdapter',
  'repository/query-cache-outbox.ts·localAdapter'
]);

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

/**
 * 漂移扫描：报出允许集之外的批量写调用点
 *
 * @param files - 已按 {@link isScannedSourcePath} 过滤的源文件
 * @returns 每一处「调用 `upsertMany` / `deleteByIds` 但不是 QueryCache 路径」的调用点
 */
const scanBulkWriteDrift = (files: readonly ScannedFile[]): readonly BulkWriteCallsite[] =>
  bulkWriteCallsites(files).filter(
    callsite => !QUERY_CACHE_BULK_WRITE_CALLSITES.has(`${callsite.path}·${callsite.receiver}`)
  );

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
  it('契约表格解析出 9 行，与登记表长度一致', () => {
    expect(CONTRACT_ROWS).toHaveLength(9);
    expect(TRUSTED_CALLSITE_REGISTRY).toHaveLength(CONTRACT_ROWS.length);
    expect(CONTRACT_ROWS.map(row => row.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
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

  it('「产生工作树单元」列由矩阵算出，不从登记表字段里读', () => {
    const computed = TRUSTED_CALLSITE_REGISTRY.map(row => producesWorkingTreeEntry(row));
    expect(computed).toEqual(CONTRACT_ROWS.map(row => row.producesEntry));
  });

  it('不产生单元的恰好是 #1 分支物化与 #3 redo 失效', () => {
    const notProducing = TRUSTED_CALLSITE_REGISTRY.filter(row => !producesWorkingTreeEntry(row)).map(
      row => `${row.file}·${row.symbol}`
    );
    expect(notProducing).toEqual(['VersionManager.ts·switchBranch', 'HistoryManager.ts·invalidateRedoStack']);
  });

  it('每一行的 entrance 都是矩阵认得的入口', () => {
    const unknown = TRUSTED_CALLSITE_REGISTRY.filter(row => !WRITE_ENTRANCES.includes(row.entrance));
    expect(unknown).toEqual([]);
  });

  it('登记表只用三个写原语，且 #1 / #3 / #4 走 switchBranch', () => {
    expect([...new Set(TRUSTED_CALLSITE_REGISTRY.map(row => row.writePrimitive))].sort()).toEqual([
      'adapter.mergeChanges',
      'adapter.switchBranch',
      'executor.mergeChanges'
    ]);
    const viaSwitchBranch = TRUSTED_CALLSITE_REGISTRY.filter(row => row.writePrimitive === 'adapter.switchBranch');
    expect(viaSwitchBranch.map(row => row.symbol)).toEqual([
      'switchBranch',
      'invalidateRedoStack',
      'applyUndoRedoHistories'
    ]);
  });
});

describe('9 行在真实代码里都找得到', () => {
  it('每一行都有一处同键的 declareTrustedWrite 声明', () => {
    const missing = TRUSTED_CALLSITE_REGISTRY.filter(row => !DECLARED_BY_KEY.has(trustedCallsiteKey(row))).map(
      trustedCallsiteKey
    );
    expect(missing).toEqual([]);
  });

  it('声明就落在登记表点名的那个文件里', () => {
    const misplaced = TRUSTED_CALLSITE_REGISTRY.filter(
      row => DECLARED_BY_KEY.get(trustedCallsiteKey(row))?.path !== `version/${row.file}`
    ).map(trustedCallsiteKey);
    expect(misplaced).toEqual([]);
  });

  it('作用域实参的变量名就是写原语的宿主前缀', () => {
    const mismatched = TRUSTED_CALLSITE_REGISTRY.filter(
      row => DECLARED_BY_KEY.get(trustedCallsiteKey(row))?.scope !== row.writePrimitive.split('.')[0]
    ).map(row => `${trustedCallsiteKey(row)} → ${DECLARED_BY_KEY.get(trustedCallsiteKey(row))?.scope}`);
    expect(mismatched).toEqual([]);
  });

  it('声明之后 15 行内真的调了那个写原语', () => {
    const detached = TRUSTED_CALLSITE_REGISTRY.filter(row => {
      const declared = DECLARED_BY_KEY.get(trustedCallsiteKey(row));
      if (!declared) return true;
      // 在涂白源码里找，于是「日志字符串里提到了 adapter.switchBranch(」不算数。
      const { code } = blankNonCode(VERSION_SOURCES[`../../version/${row.file}`]);
      const called = code.indexOf(`${row.writePrimitive}(`, declared.endOffset);
      return called < 0 || lineAt(code, called) - declared.line > 15;
    }).map(trustedCallsiteKey);
    expect(detached).toEqual([]);
  });

  it('symbol 是文件里真实存在的具名函数，不是只在调用处出现的名字', () => {
    const undefinedSymbols = TRUSTED_CALLSITE_REGISTRY.filter(
      row => !definesSymbol(blankNonCode(VERSION_SOURCES[`../../version/${row.file}`]).code, row.symbol)
    ).map(row => `${row.file}·${row.symbol}`);
    expect(undefinedSymbols).toEqual([]);
  });

  it('真实代码里没有登记表之外的 declareTrustedWrite', () => {
    const registered = new Set(TRUSTED_CALLSITE_REGISTRY.map(trustedCallsiteKey));
    const unregistered = DECLARED_CALLSITES.filter(declared => !registered.has(declaredKey(declared))).map(
      declared => `${declared.path}:${declared.line}`
    );
    expect(unregistered).toEqual([]);
    expect(DECLARED_CALLSITES).toHaveLength(TRUSTED_CALLSITE_REGISTRY.length);
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

  it('存档行号仍落在同一个文件里，且距真实声明不超过 40 行', () => {
    const stale = TRUSTED_CALLSITE_REGISTRY.filter(row => {
      const declared = DECLARED_BY_KEY.get(trustedCallsiteKey(row));
      if (!declared) return true;
      const lineCount = VERSION_SOURCES[`../../version/${row.file}`].split('\n').length;
      const inFile = row.verifiedAtLine >= 1 && row.verifiedAtLine <= lineCount;
      return !inFile || Math.abs(declared.line - row.verifiedAtLine) > 40;
    }).map(row => `${trustedCallsiteKey(row)} @${row.verifiedAtLine}`);
    expect(stale).toEqual([]);
  });
});

describe('登记键：文件 + 符号 + 意图', () => {
  it('9 行 9 个键，#5 逐条合并与 #6 压缩合并不重合', () => {
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

describe('漂移扫描：批量写只许打 QueryCache', () => {
  it('真实源码里的批量写调用点恰好 8 处，全部落在 QueryCache 路径上', () => {
    const found = bulkWriteCallsites(SCANNED_FILES);
    expect(found.map(locate)).toEqual([
      'repository/query-cache-outbox.ts:829 localAdapter.upsertMany()',
      'repository/query-cache-outbox.ts:832 localAdapter.deleteByIds()',
      'repository/QueryCacheRepository.ts:493 this.localAdapter.upsertMany()',
      'repository/QueryCacheRepository.ts:527 this.localAdapter.upsertMany()',
      'repository/QueryCacheRepository.ts:560 this.localAdapter.upsertMany()',
      'repository/QueryCacheRepository.ts:593 this.localAdapter.deleteByIds()',
      'repository/QueryCacheRepository.ts:876 this.localAdapter.deleteByIds()',
      'repository/QueryCacheRepository.ts:902 this.localAdapter.upsertMany()'
    ]);
    expect(scanBulkWriteDrift(SCANNED_FILES)).toEqual([]);
  });

  it('新增一处打业务实体的 upsertMany 会被报出来', () => {
    const drifted = scanBulkWriteDrift([
      {
        path: 'repository/ProductRepository.ts',
        source: 'async saveAll(rows: Product[]) {\n  await this.adapter.upsertMany(this.entityName, rows);\n}\n'
      }
    ]);
    expect(drifted.map(locate)).toEqual(['repository/ProductRepository.ts:2 this.adapter.upsertMany()']);
  });

  it('同一个文件里换个接收者也算新增调用点', () => {
    const drifted = scanBulkWriteDrift([
      {
        path: 'repository/QueryCacheRepository.ts',
        source: 'const go = () => this.remoteAdapter.deleteByIds(this.entityName, ids);\n'
      }
    ]);
    expect(drifted.map(locate)).toEqual(['repository/QueryCacheRepository.ts:1 this.remoteAdapter.deleteByIds()']);
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
    expect(scanBulkWriteDrift([{ path: 'rxdb-adapter.ts', source: docExample }])).toEqual([]);
  });

  it('字符串里的写法不算调用点', () => {
    const inString = "const hint = 'this.adapter.upsertMany(name, rows)';\n";
    expect(scanBulkWriteDrift([{ path: 'working-tree/bulk-write-gate.ts', source: inString }])).toEqual([]);
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
    expect(scanBulkWriteDrift([{ path: 'rxdb-adapter.ts', source: declarations }])).toEqual([]);
  });

  it('同一行里的 URL 字符串不会把它后面的调用吃掉', () => {
    const source = "log('see https://x/y'); this.adapter.upsertMany(name, rows);\n";
    expect(scanBulkWriteDrift([{ path: 'repository/Sample.ts', source }]).map(locate)).toEqual([
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
    const excluded = [
      'packages/rxdb/dist/repository/QueryCacheRepository.js',
      'packages/rxdb/out-tsc/vitest/repository/QueryCacheRepository.js',
      'packages/rxdb/src/__tests__/working-tree/entry-fold.spec.ts',
      'packages/rxdb/src/__tests__/working-tree/fixtures/probe.ts',
      'packages/rxdb/src/working-tree/testing/commit.suite.ts',
      'packages/rxdb/src/working-tree/write-entry.spec.ts'
    ];
    expect(excluded.filter(isScannedSourcePath)).toEqual([]);
  });

  it('普通源码文件进扫描', () => {
    const included = [
      'packages/rxdb/src/repository/QueryCacheRepository.ts',
      'packages/rxdb/src/version/VersionManager.ts',
      'packages/rxdb/src/working-tree/bulk-write-gate.ts'
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

  it('版本目录的 9 个登记文件都在扫描清单里', () => {
    const scanned = new Set(SCANNED_FILES.map(file => file.path));
    const missing = [...new Set(TRUSTED_CALLSITE_REGISTRY.map(row => `version/${row.file}`))].filter(
      path => !scanned.has(path)
    );
    expect(missing).toEqual([]);
  });
});
