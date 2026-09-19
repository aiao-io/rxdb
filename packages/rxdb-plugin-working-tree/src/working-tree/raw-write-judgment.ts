/**
 * @fileoverview raw 写路径的 5 步 bypass 判定（spec.md「raw 写路径的 bypass 判定」、adapter-contract.md §2）。
 *
 * @remarks
 * **一份判定，两处调用。** 实现了 `rawQuery` 的 2 个适配器（PGlite / SQLite 家族基类）各自调
 * 核心的 `gateRawWrite`，核心再转交到这里；方言差异只落在词法归一化层。每个后端写一份的话，
 * 六份里只要有一份把归一化写松，整条防线就有洞——而那个洞不会在任何一个后端自己的测试里现形。
 *
 * **`rawQuery?()` 是可选方法**（`rxdb-adapter.ts`）。判定因此是**导出的纯函数**而不是基类钩子：
 * 没实现 `rawQuery` 的适配器不因此获得豁免，它的 `upsertMany` / `deleteByIds` 走另一条挂载。
 *
 * **核心那一侧只有分派，判定整段在这里。** `@aiao/rxdb` 的 `gateRawWrite(sql, ctx, execute)`
 * 在能力位为假时直接放行，为真时转交给装在适配器上的捕获运行时——也就是
 * {@link applyRawWriteJudgment}。核心因此不认识域、不认识受信意图、不认识表名在六种后端上的
 * 物理形态，这三样随捕获规则变的东西整套随本包走。
 *
 * **五步的顺序本身就是契约。** 同一条语句可能同时满足第 1 步与第 4 步；落哪一步决定了未启用提交
 * 能力的库是照常工作还是开始报错。
 */

import type { TrustedWriteIntent } from '@aiao/rxdb';
import { CommitErrorCode } from '../commit/commit-error-codes.js';
import type { VersionedDomainView } from './versioned-domain.js';
import {
  classifyWriteEntrance,
  WorkingTreeWriteRejectedError,
  type WriteColumns,
  type WriteOperation
} from './write-entry-matrix.js';

export type { VersionedDomainView } from './versioned-domain.js';

/**
 * 一次 raw 调用的判定上下文
 *
 * @remarks
 * `domain` 是注入的——判定不自带清单。自带一份就是 spec.md 明令禁止的第二份真相，而这一份恰好是
 * 「哪些表受保护」的定义，漂移的代价是静默放行。
 *
 * **与核心的 `RawWriteContext` 不是一回事，所以不同名。** 那一个是适配器与核心之间的**接缝**
 * （能力位 + 一个转交入口），这一个是判定的**输入**（域 + 受信意图）。同名会让「适配器交出来的
 * 那份能不能直接喂给判定」变成要逐字段回忆的问题，而两者恰好都有 `capabilityEnabled`——
 * 结构类型于是会在某些方向上悄悄放行。
 */
export interface RawWriteJudgmentContext {
  /** 这个数据库启用提交能力了吗；未启用即第 1 步放行 */
  readonly capabilityEnabled: boolean;

  /** 版本化域视图，来自 `buildVersionedDomain()` 的同一份清单 */
  readonly domain: VersionedDomainView;

  /**
   * 内部受信意图；**非公开参数**，只有 `TRUSTED_CALLSITE_REGISTRY` 里的路径可传
   *
   * @see {@link TrustedWriteIntent}
   */
  readonly intent?: TrustedWriteIntent;
}

/** 放行的理由；每一条对应五步里的一步。 */
export type RawWriteAllowReason =
  /** 第 1 步：提交能力未启用，零行为差异 */
  | 'capability_disabled'
  /** 第 2 步：携带受信 intent */
  | 'trusted_intent'
  /** 第 3 步：不是写语句 */
  | 'not_a_write'
  /** 第 5 步：写的是版本化表，但只触及 untracked 字段域 */
  | 'untracked_only'
  /** 第 5 步：写的是域外目标（FTS 影子表、系统表、QueryCache 表、临时表） */
  | 'out_of_domain';

/** 判定落在第几步；第 4 步是唯一会拒绝的一步。 */
export type RawWriteJudgment =
  | {
      /** 放行：语句照常执行 */
      readonly kind: 'allow';
      /** 落在第几步 */
      readonly step: 1 | 2 | 3 | 5;
      /** 为什么放行 */
      readonly reason: RawWriteAllowReason;
    }
  | {
      /** 拒绝：语句**根本不下发** */
      readonly kind: 'reject';
      /** 恒为 4 */
      readonly step: 4;
      /** epic-006 的稳定错误码 */
      readonly code: typeof CommitErrorCode.commit_capability_mismatch;
      /** 被命中的版本化表；解析不出目标表时为空数组 */
      readonly tables: readonly string[];
    };

/** 字面量的占位符；刻意不含引号与标点，免得再被后续任何一层解析当成结构。 */
const LITERAL_PLACEHOLDER = ' _lit_ ';

/**
 * 词法定界符：行注释、块注释、字符串字面量与三种方言引号标识符的**起始**记号
 *
 * @remarks
 * 四类记号共用一条正则、在同一趟里竞争，是这层归一化的核心约束——**谁先出现谁先吃**。
 *
 * 拆成两趟时，排在后面的那一趟看到的是被前一趟改过的文本，于是两个方向各漏一半：
 *
 * - **剥注释在前**：`SET remote_id = '/*', title = 'x', synced_at = '…'` 里那一趟会从第一个
 *   字面量内部的 `/*` 一路吃到第三个字面量里的块注释收尾记号，把中间那段 `title = …` 整段吞掉。
 *   剩下的列集恰好还是一个良构的、只含 untracked 列的子集，第 5 步于是给出 `untracked_only`——
 *   **被跟踪列的赋值就这样藏在一个字符串值里绕过了门禁**。
 * - **掩字面量在前**：`-- don't` 里的撇号开出一个假字面量，一路吃到下一条语句里真正的引号为止，
 *   注释后面那条真写随之从视野里消失。
 *
 * 单趟扫描把这两类一起消掉。各类记号的收尾都用 `indexOf` 找、游标只向前走，整趟因此是 O(n)——
 * CWE-1333（`'/*' + 'a/*'.repeat(n)` 上的二次方退化）由**推进方式**挡住，不再依赖正则的形状。
 * `sql` 是库的公开入口，长度不由判定决定，而判定跑在**每一次** raw 调用上。
 *
 * 三种引号标识符（`"post"` 标准 / PG、`` `post` `` MySQL、`[post]` T-SQL）并进同一趟，
 * 顺带让 `"it's"` 这类含撇号的标识符不再开出假字面量。
 *
 * `$` 是第五类记号的起点（PG 的 dollar-quoted 字符串，`$$…$$` / `$tag$…$tag$`）。它与前四类
 * 不同的是**落单时什么都不是**：`$1` 是 PG 的位置参数、`$name` 是 SQLite 的命名参数，两者都是
 * raw 通道上的日常流量。所以认不出配对的收尾记号时按「不是定界符」处理，见
 * {@link dollarQuoteLexeme}。
 */
const DELIMITER_PATTERN = /--|\/\*|'|"|`|\[|\$/g;

/**
 * dollar-quote 的起止记号：`$$` 或 `$tag$`
 *
 * @remarks
 * 标签按 PG 的无引号标识符规则取（首字符是字母或下划线，后续可含数字；**不含 `$`**），
 * 所以 `\p{L}` 而不是 `[a-z]`——PG 的标识符规则认非 ASCII 字母，一个 `$标签$` 认不出来就又是
 * 一次静默放行。`$1` 因此天然不匹配：数字不能做标签首字符，它是位置参数而不是定界符。
 */
const DOLLAR_QUOTE_TOKEN_PATTERN = /\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/gu;

/** 归一化之后的标识符与关键字词元。 */
const WORD_PATTERN = /[a-z_][a-z0-9_$]*/g;

/**
 * 写关键字：出现在语句**任何位置**即判为写
 *
 * @remarks
 * 按首关键字分类会在 `WITH moved AS (UPDATE post …) SELECT …` 上放行——那是一条以 `WITH` 开头的
 * **写**语句，而它写的正是版本化业务表。
 */
const WRITE_KEYWORDS: ReadonlySet<string> = new Set([
  'insert',
  'update',
  'delete',
  'replace',
  'upsert',
  'merge',
  'create',
  'drop',
  'alter',
  'truncate',
  'rename',
  'grant',
  'revoke'
]);

/**
 * 确知不写业务表的语句首词
 *
 * @remarks
 * 白名单而不是黑名单：不在这张表里且不含写关键字的语句（`EXECUTE some_plan`）按写处理。
 * 反过来的读法会让绕过捕获变成一道语法题——只要把语句写得判定读不懂就行。
 *
 * 事务控制与 `PRAGMA` 在册：它们是适配器 raw 通道上的日常流量，且**够不到**业务表的行；
 * 漏掉它们会让启用提交能力等同于禁用事务。
 */
const NON_WRITE_LEADING_KEYWORDS: ReadonlySet<string> = new Set([
  'select',
  'with',
  'explain',
  'values',
  'show',
  'describe',
  'desc',
  'pragma',
  'analyze',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'release',
  'end',
  'set'
]);

/** 各写形态的目标表位置；`create` 单列一条是因为它前面可以堆 `temp` / `unique` / `virtual`。 */
const TABLE_PATTERNS: readonly RegExp[] = [
  /\bupdate\s+(?:or\s+(?:ignore|replace|abort|fail|rollback)\s+)?(?:only\s+)?([a-z0-9_.$]+)/g,
  /\b(?:insert|replace)\s+(?:or\s+(?:ignore|replace|abort|fail|rollback)\s+)?into\s+([a-z0-9_.$]+)/g,
  /\bdelete\s+from\s+(?:only\s+)?([a-z0-9_.$]+)/g,
  /\bmerge\s+into\s+([a-z0-9_.$]+)/g,
  /\b(?:drop|alter|truncate)\s+(?:table|view|index)\s+(?:if\s+exists\s+)?([a-z0-9_.$]+)/g,
  /\bcreate\s+(?:temp\s+|temporary\s+|unique\s+|virtual\s+)*(?:table|view|index)\s+(?:if\s+not\s+exists\s+)?([a-z0-9_.$]+)/g
];

/** `SET` 关键字本身；子句正文从它后面开始，由 {@link setClauseOf} 往后扫。 */
const SET_KEYWORD_PATTERN = /\bset\b/;

/**
 * 终止 `SET` 子句的关键字
 *
 * @remarks
 * `from` 在册是因为 PG 的 `UPDATE … SET … FROM other …`。三个词都**只在括号深度 0 上**终止：
 * 它们在子查询里出现是家常便饭（`SET a = (SELECT x FROM y WHERE …)`），按深度无关的正则找
 * 第一个就会把子句提前截断——见 {@link setClauseOf}。
 */
const SET_CLAUSE_TERMINATORS: ReadonlySet<string> = new Set(['where', 'returning', 'from']);

/** 归一化文本里的标识符字符；与 {@link WORD_PATTERN} 同口径，用来找词边界。 */
const WORD_CHARACTER = /[a-z0-9_$.]/;

/** `SET` 子句里的单列赋值。 */
const ASSIGNMENT_PATTERN = /^\s*([a-z0-9_.$]+)\s*=/;

/** 一个定界符吃完之后：游标跳到哪儿、往归一化文本里放什么。 */
interface NormalizedLexeme {
  /** 这一段的**结束偏移**（不含），也就是扫描游标的下一站；恒大于起始偏移，扫描因此必然终止 */
  readonly end: number;

  /** 这一段在归一化文本里的产出 */
  readonly text: string;
}

/**
 * 行注释吃到换行或串尾
 *
 * @param sql - 原始语句
 * @param start - `--` 所在偏移
 * @returns 结束偏移（不含）
 *
 * @remarks
 * 换行本身留着不吃：它是 `SELECT 1; -- c\nUPDATE …` 里唯一终止注释的东西，
 * 连它一起吃掉读起来没区别，但把「注释到此为止」这件事从产出里抹掉了。
 */
function lineCommentEnd(sql: string, start: number): number {
  const newline = sql.indexOf('\n', start);
  return newline < 0 ? sql.length : newline;
}

/**
 * 块注释吃到收尾记号；未闭合时吃到串尾
 *
 * @param sql - 原始语句
 * @param start - `/*` 所在偏移
 * @returns 结束偏移（不含）
 *
 * @remarks
 * 未闭合吃到串尾是更贴近方言的读法：SQLite 允许块注释以输入结束收尾，PG 则把这条整个判为语法错。
 * 两种读法下后面那截都不会真的写进业务表，所以多吃它不开新的绕过口子。
 */
function blockCommentEnd(sql: string, start: number): number {
  const close = sql.indexOf('*/', start + 2);
  return close < 0 ? sql.length : close + 2;
}

/**
 * 单引号字面量吃到配对的引号；`''` 是转义不是收尾；未闭合时吃到串尾
 *
 * @param sql - 原始语句
 * @param start - 起始引号所在偏移
 * @returns 结束偏移（不含）
 *
 * @remarks
 * 必须先于分号切分吃掉：`WHERE note = 'a; DROP TABLE post'` 里的分号不是语句边界，
 * 不吃就会凭空多出一条「语句」。同理，字面量里的 `update` 不是写关键字。
 */
function stringLiteralEnd(sql: string, start: number): number {
  let cursor = start + 1;
  while (cursor <= sql.length) {
    const quote = sql.indexOf("'", cursor);
    if (quote < 0) return sql.length;
    if (sql[quote + 1] !== "'") return quote + 1;
    cursor = quote + 2;
  }
  return sql.length;
}

/**
 * 引号标识符吃到配对的收尾符，产出**内层原文**
 *
 * @param sql - 原始语句
 * @param start - 起始引号所在偏移
 * @param closer - 配对的收尾符
 * @returns 这一段的结束偏移与产出
 *
 * @remarks
 * 未闭合时把内层原文原样放回去，而不是连同引号一起丢掉：丢掉等于让一个落单的引号
 * 把它后面的整条写从判定的视野里抹去。
 */
function quotedIdentifierLexeme(sql: string, start: number, closer: string): NormalizedLexeme {
  const close = sql.indexOf(closer, start + 1);
  if (close < 0) return { end: sql.length, text: sql.slice(start + 1) };
  return { end: close + 1, text: sql.slice(start + 1, close) };
}

/**
 * 整条语句里全部 dollar-quote 记号的位置索引
 *
 * @remarks
 * 为什么要索引而不是每次 `indexOf`：配对失败时 `indexOf` 会从当前位置一路扫到串尾，而
 * **每个标签只出现一次**的输入（`$t0$ $t1$ …`）里每一次配对都必然失败——判定于是退化成二次方，
 * 与未闭合块注释那条 CWE-1333 是同一类退化，只是换了个定界符。
 *
 * 先一趟扫出全部记号（O(n)），配对就变成「同名记号的下一个位置」。位置按标签分组且升序，
 * 而归一化的游标单向前进，所以每个标签配一个只增不减的指针，整条语句的总配对成本是 O(n)。
 */
interface DollarQuoteIndex {
  /** 偏移 → 从这里开始的完整记号；查不到就说明这个 `$` 不是 dollar-quote 的起点 */
  readonly tokenAt: ReadonlyMap<number, string>;

  /** 记号 → 它在整条语句里的全部出现位置，升序 */
  readonly positionsOf: ReadonlyMap<string, readonly number[]>;

  /** 记号 → {@link positionsOf} 里已经走过的前缀长度；扫描单向前进，指针因此只增不减 */
  readonly cursors: Map<string, number>;
}

/**
 * 扫出整条语句的 dollar-quote 记号索引
 *
 * @param sql - 原始语句
 * @returns 见 {@link DollarQuoteIndex}
 *
 * @remarks
 * 这一趟**不区分**记号落在注释、字面量还是代码里——它只回答「哪些偏移上有一个 `$tag$`」。
 * 落在已被别的定界符吃掉的区段里的那些位置，偏移必然小于当前游标，配对时按下界过滤掉。
 */
function indexDollarQuotes(sql: string): DollarQuoteIndex {
  const tokenAt = new Map<number, string>();
  const positionsOf = new Map<string, number[]>();
  DOLLAR_QUOTE_TOKEN_PATTERN.lastIndex = 0;
  for (let found = DOLLAR_QUOTE_TOKEN_PATTERN.exec(sql); found !== null; found = DOLLAR_QUOTE_TOKEN_PATTERN.exec(sql)) {
    const token = found[0];
    tokenAt.set(found.index, token);
    const positions = positionsOf.get(token);
    if (positions) positions.push(found.index);
    else positionsOf.set(token, [found.index]);
  }
  return { tokenAt, positionsOf, cursors: new Map() };
}

/**
 * dollar-quoted 字符串吃到同名的收尾记号；配不上对时按「这不是定界符」处理
 *
 * @param sql - 原始语句
 * @param start - `$` 所在偏移
 * @param index - 见 {@link DollarQuoteIndex}
 * @returns 这一段的结束偏移与产出
 *
 * @remarks
 * 配不上对时**不吃到串尾**——这是它与未闭合块注释、未闭合单引号字面量刻意不同的一点。那两类
 * 吃到串尾是安全的：两种方言下 `/*` 与 `'` 都确实是定界符，后面那截不会真的写进业务表。而 `$$`
 * 只在 PG 里是定界符，SQLite 家族的五个后端里它连记号都不是；认不出配对就吃到串尾，等于把一条
 * 真能执行的写从判定的视野里抹掉——正好是 fail-open 的方向。
 *
 * 落单的 `$` 原样放回文本：`$1`（PG 位置参数）与 `$name`（SQLite 命名参数）是 raw 通道上的
 * 日常流量，把它们当成定界符起点会让每一条带参数的 raw 写开始误判。
 */
function dollarQuoteLexeme(sql: string, start: number, index: DollarQuoteIndex): NormalizedLexeme {
  const token = index.tokenAt.get(start);
  if (token === undefined) return { end: start + 1, text: '$' };
  const positions = index.positionsOf.get(token) ?? [];
  // 收尾记号至少要从起始记号之后开始：`$$$$` 是一个空字面量，不是一个自己给自己收尾的记号。
  const lowerBound = start + token.length;
  let cursor = index.cursors.get(token) ?? 0;
  while (cursor < positions.length && (positions[cursor] ?? 0) < lowerBound) cursor += 1;
  index.cursors.set(token, cursor);
  const close = positions[cursor];
  if (close === undefined) return { end: start + 1, text: '$' };
  return { end: close + token.length, text: LITERAL_PLACEHOLDER };
}

/**
 * 认出 `start` 处的定界符属于哪一类，并把它整段吃掉
 *
 * @param sql - 原始语句
 * @param start - 定界符所在偏移
 * @param delimiter - {@link DELIMITER_PATTERN} 匹配到的起始记号
 * @param dollarQuotes - 取 {@link DollarQuoteIndex} 的惰性取值器；只有 `$` 这一支会调它
 * @returns 这一段的结束偏移与产出
 */
function lexemeAt(
  sql: string,
  start: number,
  delimiter: string,
  dollarQuotes: () => DollarQuoteIndex
): NormalizedLexeme {
  if (delimiter === '--') return { end: lineCommentEnd(sql, start), text: ' ' };
  if (delimiter === '/*') return { end: blockCommentEnd(sql, start), text: ' ' };
  if (delimiter === "'") return { end: stringLiteralEnd(sql, start), text: LITERAL_PLACEHOLDER };
  if (delimiter === '$') return dollarQuoteLexeme(sql, start, dollarQuotes());
  // `[post]`（T-SQL）是三种引号标识符里唯一收尾符与起始符不同的一种。
  return quotedIdentifierLexeme(sql, start, delimiter === '[' ? ']' : delimiter);
}

/**
 * 词法归一化：注释、字面量、引号标识符、大小写与 schema 限定在比对前抹平
 *
 * @param sql - 原始语句（可能是语句批）
 * @returns 归一化后的文本
 *
 * @remarks
 * 归一化是**判定的一部分**，不是调用方的责任。交给 6 个适配器各做一遍就是 6 份实现，
 * 而它们只需有一份写松，整条防线就有洞。
 *
 * 四类词法记号在**同一趟**里竞争，谁先出现谁先吃——两趟为什么不行见 {@link DELIMITER_PATTERN}。
 *
 * 引号标识符连同大小写一起抹平：某些方言里 `"Post"` 与 `post` 确实是两张表，但在这里按
 * 「可能是同一张」处理才是 fail-closed 的方向——认错了顶多多拦一条，认漏了就是静默绕过。
 * 压小写放在最后一步，因为 {@link LITERAL_PLACEHOLDER} 与标识符内层原文都要一起过这一刀。
 */
function normalizeSql(sql: string): string {
  const pieces: string[] = [];
  let plain = 0;
  // dollar-quote 索引自己要走一趟全串，而绝大多数语句一个 `$` 都没有——所以做成惰性的，
  // 由 `$` 那一支在第一次用到时建，整条语句只建一次。
  let indexed: DollarQuoteIndex | undefined;
  const dollarQuotes = (): DollarQuoteIndex => (indexed ??= indexDollarQuotes(sql));
  // 模块级正则带 `g`，`lastIndex` 是可变状态；进来先清零，每吃完一段再显式推到该去的位置。
  DELIMITER_PATTERN.lastIndex = 0;
  for (let found = DELIMITER_PATTERN.exec(sql); found !== null; found = DELIMITER_PATTERN.exec(sql)) {
    const lexeme = lexemeAt(sql, found.index, found[0], dollarQuotes);
    pieces.push(sql.slice(plain, found.index), lexeme.text);
    plain = lexeme.end;
    DELIMITER_PATTERN.lastIndex = lexeme.end;
  }
  pieces.push(sql.slice(plain));
  return pieces.join('').toLowerCase();
}

/**
 * 去掉 schema 限定，只留表名本身
 *
 * @param identifier - 可能带点号限定的标识符
 * @returns 最后一段
 *
 * @remarks
 * 只切点号，**不做**任何前后缀裁剪。写松一点（去掉下划线后缀、按前缀匹配）会把 `post_archive`
 * 误判成 `post`，于是一批本来正常的写开始报错——防线没变严，只是变吵了。
 */
function lastSegment(identifier: string): string {
  const segments = identifier.split('.');
  return segments[segments.length - 1] ?? identifier;
}

/** 取出归一化文本里的全部词元。 */
function wordsOf(statement: string): readonly string[] {
  return statement.match(WORD_PATTERN) ?? [];
}

/** 这条语句会改数据吗；白名单之外一律算写。 */
function isWriteStatement(words: readonly string[]): boolean {
  if (words.some(word => WRITE_KEYWORDS.has(word))) return true;
  const leading = words[0];
  if (leading === undefined) return false;
  return !NON_WRITE_LEADING_KEYWORDS.has(leading);
}

/**
 * 这条写语句是哪种操作
 *
 * @param words - 语句词元
 * @returns 三种 DML 之一、`'schema_change'`（DDL），或 `undefined`（解析不出）
 *
 * @remarks
 * DDL 单列一类而不是塞进 `delete`：它没有列级豁免可谈——`ALTER TABLE` 改的是每一行的形状，
 * 拿「被写列集」去问它没有意义。归到 `delete` 上会得到同样的结论，但下一个读代码的人会以为
 * 那里真的比较过列集。
 */
function operationOf(words: readonly string[]): WriteOperation | 'schema_change' | undefined {
  const keyword = words.find(word => WRITE_KEYWORDS.has(word));
  if (keyword === undefined) return undefined;
  if (keyword === 'update') return 'update';
  if (keyword === 'delete') return 'delete';
  if (keyword === 'insert' || keyword === 'replace' || keyword === 'upsert' || keyword === 'merge') return 'insert';
  return 'schema_change';
}

/**
 * 取出 `SET` 子句正文：从 `SET` 之后到**深度 0 的**终止关键字为止
 *
 * @param statement - 归一化后的语句
 * @returns 子句正文，语句里没有 `SET` 时 `undefined`
 *
 * @remarks
 * 终止关键字必须按括号深度找，不能用正则的「第一个 `from`/`where`/`returning`」。
 * `UPDATE post SET a = (SELECT x FROM y), b = 'v'` 里那个 `from` 在子查询内部，按正则找会把
 * 子句截到 `a = (select x ` 就停，**`b` 整列从被写列集里消失**——于是第 5 步拿一个残缺的列集去
 * 问 untracked 域，一条真在改 tracked 列的语句被判成「只碰 untracked 列」而放行。这类漏判不报错、
 * 不留痕，是五步门禁里最难在事后发现的一种。
 *
 * 深度跟踪在归一化文本上是安全的：{@link normalizeSql} 已经剥掉注释、并把字符串字面量整体换成
 * 不含括号的 {@link LITERAL_PLACEHOLDER}，所以此时的每一个括号都是真语法括号。
 *
 * 深度**转负**同样终止：`WITH moved AS (UPDATE post SET title = _lit_ )` 这种把写语句包在括号里的
 * 写法，那个 `)` 就是子句的右边界，越过它继续扫会把外层语句的词元读进列集。
 */
function setClauseOf(statement: string): string | undefined {
  const keyword = SET_KEYWORD_PATTERN.exec(statement);
  if (keyword === null) return undefined;
  const body = statement.slice(keyword.index + keyword[0].length);
  let depth = 0;
  let wordStart = -1;
  // 多扫一位（`body.length`）好让结尾处的词元也走一次边界判定，免得为它再写一段收尾分支。
  for (let index = 0; index <= body.length; index += 1) {
    const character = body[index] ?? ' ';
    if (WORD_CHARACTER.test(character)) {
      if (wordStart < 0) wordStart = index;
      continue;
    }
    if (depth === 0 && wordStart >= 0 && SET_CLAUSE_TERMINATORS.has(body.slice(wordStart, index)))
      return body.slice(0, wordStart);
    wordStart = -1;
    if (character === '(') depth += 1;
    else if (character === ')' && --depth < 0) return body.slice(0, index);
  }
  return body;
}

/**
 * 按括号深度切开顶层逗号
 *
 * @param clause - `SET` 子句正文
 * @returns 各段赋值文本
 *
 * @remarks
 * 直接 `split(',')` 会把 `SET tags = fn(a, b)` 切成两段，第二段匹配不上赋值形态，于是整条语句被
 * 判成「列集解析不出」而拦下——一条本该放行的写被拦，比漏拦更容易被当成 bug 绕过去修。
 */
function splitTopLevel(clause: string): readonly string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of clause) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      segments.push(current);
      current = '';
    } else current += character;
  }
  segments.push(current);
  return segments;
}

/**
 * 取出 UPDATE 的被写列集
 *
 * @param statement - 归一化后的语句
 * @returns 解析得出的列集，或 `{ kind: 'unknown' }`
 *
 * @remarks
 * 两处 fail-closed：多列赋值形态 `SET (a, b) = (SELECT …)` 不解析，任何一段不是「标识符 =」
 * 也不解析。两者都会被上游按「不是 untracked 子集」处理。
 */
function columnsOf(statement: string): WriteColumns {
  const clause = setClauseOf(statement);
  if (clause === undefined) return { kind: 'unknown' };
  if (clause.trimStart().startsWith('(')) return { kind: 'unknown' };
  const names: string[] = [];
  for (const segment of splitTopLevel(clause)) {
    const name = ASSIGNMENT_PATTERN.exec(segment)?.[1];
    if (name === undefined) return { kind: 'unknown' };
    names.push(lastSegment(name));
  }
  return { kind: 'columns', names };
}

/** 取出这条语句的全部写目标表（已去 schema 限定、已去重）。 */
function tablesOf(statement: string): readonly string[] {
  const tables = new Set<string>();
  for (const pattern of TABLE_PATTERNS) {
    for (const match of statement.matchAll(pattern)) {
      const table = match[1];
      if (table !== undefined) tables.add(lastSegment(table));
    }
  }
  return [...tables];
}

/** 单条语句的结论；`reject` 带上被命中的版本化表，供错误诊断使用。 */
type StatementVerdict =
  | { readonly kind: 'out_of_domain' }
  | { readonly kind: 'untracked_only' }
  | { readonly kind: 'reject'; readonly tables: readonly string[] };

/**
 * 这条写语句对某张版本化表构成净变化吗
 *
 * @remarks
 * 直接复用写入口语义矩阵的同一份判据（`entrance: 'raw_write'`）。raw 通道自己再写一遍
 * 「列集 ⊆ untracked 域」的话，两处口径迟早分家，而 raw 通道会成为那条更松的路。
 *
 * **列名在这里压成小写，因为语句那一侧已经被 {@link normalizeSql} 压过了。** 域给的是实体
 * 属性名（`remoteId` / `createdAt` / `updatedAt`，驼峰），矩阵做的是精确字符串子集判定——
 * 原样递过去的话 `remoteid` 永远不等于 `remoteId`，第 5 步的 `untracked_only` 在任何真实
 * 数据库上都不可达，一条只改审计时间的簿记写会被第 4 步拦成 `commit_capability_mismatch`。
 *
 * 压小写只发生在**表 / 列平面**，域本身不动：实体平面的 `isUntrackedField()` 必须保持大小写
 * 精确（`remoteId` 与 `remoteid` 在 JS 里是两个不同的属性）。归一化是判定对 SQL 做的事，
 * 两个平面各归一到自己的刻度上，不是把域改成小写让两边"凑巧"相等。
 */
function rejectsTable(
  table: string,
  operation: WriteOperation,
  columns: WriteColumns,
  domain: VersionedDomainView
): boolean {
  return (
    classifyWriteEntrance({
      entrance: 'raw_write',
      targetClass: 'versioned',
      operation,
      columns,
      untrackedFields: [...domain.untrackedFieldsOf(table)].map(field => field.toLowerCase()),
      capabilityEnabled: true
    }).kind === 'reject'
  );
}

/**
 * 判定单条写语句
 *
 * @param statement - 归一化后的语句
 * @param domain - 版本化域视图
 * @returns 三种结论之一
 */
function judgeStatement(statement: string, domain: VersionedDomainView): StatementVerdict {
  const tables = tablesOf(statement);
  // 目标表解析不出：fail-closed。空 `tables` 不是「没写表」，是「不知道写了哪张表」。
  if (tables.length === 0) return { kind: 'reject', tables: [] };
  const hits = tables.filter(table => domain.versionedTables.has(table));
  if (hits.length === 0) return { kind: 'out_of_domain' };
  const operation = operationOf(wordsOf(statement));
  // DDL 与解析不出操作种类的写：没有列级豁免可谈。
  if (operation === undefined || operation === 'schema_change') return { kind: 'reject', tables: hits };
  const columns = columnsOf(statement);
  const rejected = hits.filter(table => rejectsTable(table, operation, columns, domain));
  return rejected.length > 0 ? { kind: 'reject', tables: rejected } : { kind: 'untracked_only' };
}

/** 合并一批语句的结论：任一条被拦即整批被拦。 */
function combine(verdicts: readonly StatementVerdict[]): RawWriteJudgment {
  const rejected = verdicts.flatMap(verdict => (verdict.kind === 'reject' ? verdict.tables : []));
  const anyRejected = verdicts.some(verdict => verdict.kind === 'reject');
  if (anyRejected) {
    return {
      kind: 'reject',
      step: 4,
      code: CommitErrorCode.commit_capability_mismatch,
      tables: [...new Set(rejected)]
    };
  }
  const reason: RawWriteAllowReason =
    verdicts.some(verdict => verdict.kind === 'untracked_only') ? 'untracked_only' : 'out_of_domain';
  return { kind: 'allow', step: 5, reason };
}

/**
 * 判定一次 raw 调用该不该下发
 *
 * @param sql - 原始语句，可以是以分号分隔的语句批
 * @param context - 能力位、版本化域与可选的受信意图
 * @returns 落在第几步、放行还是拒绝；**纯函数**，不读全局状态、不改 `context`
 *
 * @remarks
 * 语句批整批判定，不只看第一条：追加一条语句是最省事的一种绕过方式，判定只看第一条的话，
 * 前面放一条无害语句就够了。
 *
 * @example
 * ```ts
 * judgeRawWrite('UPDATE post SET "remoteId" = \'r1\'', { capabilityEnabled: true, domain });
 * // → { kind: 'allow', step: 5, reason: 'untracked_only' }
 * ```
 */
export function judgeRawWrite(sql: string, context: RawWriteJudgmentContext): RawWriteJudgment {
  if (!context.capabilityEnabled) return { kind: 'allow', step: 1, reason: 'capability_disabled' };
  if (context.intent !== undefined) return { kind: 'allow', step: 2, reason: 'trusted_intent' };
  const statements = normalizeSql(sql)
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);
  const writes = statements.filter(statement => isWriteStatement(wordsOf(statement)));
  if (writes.length === 0) return { kind: 'allow', step: 3, reason: 'not_a_write' };
  return combine(writes.map(statement => judgeStatement(statement, context.domain)));
}

/**
 * 判定并在放行时执行语句；捕获运行时 `gateRawWrite()` 的实现体
 *
 * @typeParam T - 执行器的返回类型
 * @param sql - 原始语句
 * @param context - 判定上下文
 * @param execute - 真正下发语句的执行器
 * @returns 执行器的返回值原样透传
 * @throws {@link WorkingTreeWriteRejectedError} 落第 4 步时抛出，**执行器一次都不会被调用**
 *
 * @remarks
 * 拒绝发生在语句下发**之前**，业务表零变化——不是写完再回滚。raw 通道上根本没有事务可回滚，
 * 而那正是 raw 通道存在的原因。
 *
 * 名字不叫 `gateRawWrite`：那个名字归核心的接缝函数——适配器调的是它，六处调用点的 import
 * 也写的是它。两个同名函数一个在核心一个在插件，改错一处不会有编译错误。
 */
export async function applyRawWriteJudgment<T>(
  sql: string,
  context: RawWriteJudgmentContext,
  execute: () => Promise<T> | T
): Promise<T> {
  const judgment = judgeRawWrite(sql, context);
  if (judgment.kind === 'reject') {
    const target = judgment.tables.length > 0 ? judgment.tables.join(', ') : '无法解析的目标表';
    throw new WorkingTreeWriteRejectedError({
      entrance: 'raw_write',
      message: `raw 写被工作树门禁拒绝：${target}。启用提交能力的数据库上，业务表只能经 RxDB 写入。`
    });
  }
  return await execute();
}
