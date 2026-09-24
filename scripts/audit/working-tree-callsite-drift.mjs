/**
 * scripts/audit/working-tree-callsite-drift.mjs
 *
 * 受信写调用点的**漂移门禁**：仓库里每一处批量重写，要么带着登记在案的意图，要么就是一个
 * 未知入口（`specs/001-working-tree-commits/contracts/adapter-contract.md` §3、R5、SC-010）。
 *
 * 触发路径：`pnpm audit:callsite-drift`。
 *
 * 三类调用各有归宿，除此之外一律报出来：
 *
 * 1. **受信写原语** `adapter.switchBranch` / `adapter.mergeChanges` / `executor.mergeChanges`
 *    ——必须由所在函数用 `declareTrustedWrite()` 自报意图，且「文件 + 符号 + 意图」这个键
 *    必须已在 {@link TRUSTED_CALLSITE_REGISTRY} 里。
 * 2. **批量写** `upsertMany` / `deleteByIds` ——只有 QueryCache 那两处本地缓存路径可以调；
 *    版本化业务实体走这两个方法就绕开了工作树捕获（`bulk-write-gate.ts`）。
 * 3. **门面与远端重载** ——`versionManager.switchBranch()` 是 VersionManager 的公开 API，
 *    `remoteAdapter.mergeChanges()` 是 adapter-contract.md §1 明确排除在挂载点表外的远端重载。
 *    它们登记在 {@link KNOWN_NON_PRIMITIVE_RECEIVERS} 里，**连同理由**。
 *
 * 为什么第 3 类要写成一张带理由的登记表，而不是「不认识的接收者就跳过」：跳过是静默的。
 * 有人把 `const { adapter } = …` 改名成 `const { localAdapter } = …`，那处受信写就从第 1 类
 * 掉进「不认识」，门禁安静地少管一个地方——而这正是这条门禁存在的理由。所以**未登记即报出**。
 *
 * **与 `packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts` 的分工**：
 * 那份跑在 chromium 里，够得着 `TRUSTED_CALLSITE_REGISTRY` 这个 TS 值，能断言它与
 * adapter-contract.md §3 的表格逐格一致；但它只看得见 `packages/rxdb/src`，而且 vitest 的
 * `import.meta.glob` 本来就进不了 `dist/` 与别的包。这一份跑在 node 里，看得见整个
 * `packages/`（含 rxdb-devtools 那两处门面调用），但读不到 TS 导出，只能把登记表从源码里**词法解析**
 * 出来。两者互不覆盖，**不要合并**。
 *
 * **US-025 抽包之后，「9 行在真实代码里找不找得到」整半边只剩这一份在守。** 9 处声明搬进了
 * `rxdb-plugin-history`（#1~#6）与 `rxdb-plugin-sync`（#7~#9），8 处 QueryCache 批量写搬进了
 * `rxdb-plugin-querycache` 与 `rxdb-plugin-sync`——核心那份的 `import.meta.glob` 一处都看不见了。
 * 连同搬过来的还有 `verifiedAtLine` 的核对（{@link LINE_DRIFT_TOLERANCE}）：那是原先核心独有的一条，
 * 落在这里之前它已经在抽包里漂了 471 行而无人报警。
 *
 * 为什么符号取「最内层具名函数」而不是行号：行号每次格式化都在变；而委托门面会被重构成另一个
 * 门面，真正发起那次批量重写的函数不会。这也是 `trusted-write-intent.ts` 文件头写死的口径——
 * 本脚本是它唯一的机械执行者，因为运行时的 `declareTrustedWrite()` 只校验键在不在表里，
 * **不校验自报的 symbol 是不是所在函数**。
 *
 * **扫调用点那半边不用 TypeScript 解析器**：判据全部落在词法层（谁在调、调用点外面是哪个
 * 具名函数、那个函数有没有自报意图），而跨 `packages/` 也没有一份能覆盖全仓的类型化 Program
 * 可用。注释与字符串的涂白层直接复用 `working-tree-suite-callsites.mjs` 已导出的那一份——
 * 再抄一份词法扫描器，两份迟早会在不同的边角上分叉。
 *
 * **读登记表那半边用**（{@link parseRegistry}）：那是一张自家的常量表，是数据不是待扫描的
 * 代码。按固定键序的正则去读它，等于在门禁侧再编码一遍登记表的书写形状，重排字段就会让
 * 整行静默消失。`scripts/audit/api-surface.mjs` 早已按同样理由引了 `typescript`。
 *
 * **为什么扫调用点那半边不打算改成 AST/类型级校验**（epic-006 评审的遗留一问，2026-09-24 判定
 * 留在词法层）：这条门禁的每一种失败都是**响的**，不是静默的——
 *
 * - 接收者改名（`adapter` → `localAdapter`）：那处调用掉进第 3 类「不认识的接收者」，而未登记
 *   即报出（见上）。不是少管一处，是当场变红。
 * - 正则认不出某处声明：`auditRepository` 末尾那轮反查会报「登记表有 X，真实代码里却找不到」，
 *   spec 里还钉了 `seenKeys.size === rows.length`。一次「部分匹配旧形状」于是也是红的。
 * - 注释或 TSDoc 示例里写了一段 `declareTrustedWrite(...)`：涂白层挡在前面
 *   （{@link findDeclarations}），假阳性进不来。
 * - 词表与真实类型分叉：{@link assertScannerVocabulary} 在扫描之前抛。这是原先唯一**真的**
 *   静默的一格——三张词表是硬编码字面量，核心给 `TrustedWritePrimitive` 或
 *   `InterceptedBulkWrite` 加一项，这个脚本会继续只扫旧的那几个并打印 ✅。现在钉住了。
 *
 * 换成 AST 能多得到的只有「类型层面确认这个接收者真是 RxDBAdapterLocalBase」，而代价是让一条
 * 秒级的门禁依赖一份覆盖全仓的类型化 Program（跨 `packages/` 并没有这么一份，得现搭）——
 * 把 pre-commit 级的检查绑上一次全量 typecheck。收益与代价不成比例，**判定不做**；真要重提，
 * 先给出一处「现有词法判据放过了、AST 能拦住」的实例。顺延记录见
 * `requirements/roadmap.md` 的「epic-006 评审顺延的架构项」。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

import { blankStringLiterals, stripComments } from './working-tree-suite-callsites.mjs';

/** 登记表与意图枚举的源文件，供 {@link parseRegistry} 词法解析。 */
export const REGISTRY_SOURCE_FILE = 'rxdb/src/trusted-write/trusted-write-intent.ts';

/** 批量写方法名的真实出处，供 {@link parseBulkWriteMethods} 解析。 */
export const BULK_WRITE_GATE_SOURCE_FILE = 'rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts';

/**
 * 受信写原语的宿主变量名
 *
 * @remarks
 * 这三张词表是**字面量，但不是自由的字面量**：{@link assertScannerVocabulary} 每次跑都拿它们跟
 * 真实类型对一遍（宿主与方法出自 `TrustedWritePrimitive`，批量写方法出自 `METHOD_NAMES`），
 * 对不上就抛。写成字面量的理由只有一个——{@link CALL_PATTERN} 是模块级正则，在它构造出来之前
 * 没有读文件的时机；写成字面量**而不钉住**才是那条真问题：词表漏一项，扫描器不会报错，
 * 它会安静地一处都扫不到，然后打印一行 ✅。
 */
export const TRUSTED_PRIMITIVE_SCOPES = Object.freeze(['adapter', 'executor']);

/** 受信写原语的方法名；`switchBranch` 与 `mergeChanges` 各覆盖登记表的一部分。与上一条同钉。 */
export const TRUSTED_WRITE_METHODS = Object.freeze(['switchBranch', 'mergeChanges']);

/** 绕开工作树捕获的两个批量写方法（bulk-write-gate.ts）。与上两条同钉。 */
export const BULK_WRITE_METHODS = Object.freeze(['upsertMany', 'deleteByIds']);

/**
 * 允许调批量写的调用点，键是 `包内相对路径·接收者`
 *
 * @remarks
 * **不按实参判**：8 处真实调用传的都是 `this.entityName` / `entity` 这类运行期值，没有一处是
 * 字面量——想从实参读出「这是不是 QueryCache」的规则，在真实仓库上恒等于什么都报不出来，
 * 而它会以全绿的形态一直存在下去。
 */
export const QUERY_CACHE_BULK_WRITE_CALLSITES = Object.freeze([
  'rxdb-plugin-querycache/src/QueryCacheEngine.ts·this.localAdapter',
  'rxdb-plugin-sync/src/query-cache-outbox.ts·localAdapter'
]);

/**
 * `verifiedAtLine` 与真实声明之间允许的最大偏差
 *
 * @remarks
 * 存档行号唯一的用处是回答「上次核对的是不是同一段代码」。放任它漂，
 * 登记表上那句「已与真实代码核对」就只是一个日期——US-025 抽包时 #1 一次漂了 471 行，
 * 而当时守这条的那份测试正好跟着搬迁失明了。40 行是 adapter-contract.md §3 的既定口径：
 * 够一次重构在函数内挪位置，不够它挪出一个函数。
 */
export const LINE_DRIFT_TOLERANCE = 40;

/**
 * 同名但不是受信写原语的接收者，连同它不是的理由
 *
 * @remarks
 * 每一条都是一句会被人读到的解释。加一条就等于声明「这个接收者上的 switchBranch / mergeChanges
 * 不是那个写原语」，而那句话必须站得住。
 */
export const KNOWN_NON_PRIMITIVE_RECEIVERS = Object.freeze({
  versionManager: 'VersionManager 的公开 API，不是适配器写原语；它内部那次 adapter.switchBranch 才是（登记表 #1）',
  'rxdb.versionManager': '同上，经 RxDB 门面拿到的 VersionManager',
  remoteAdapter: '远端 mergeChanges 重载；adapter-contract.md §1 明确把它排除在 4 个挂载点之外'
});

/** 静态扫描不进的目录名（adapter-contract.md §3 末段，外加构建与缓存产物）。 */
export const SCAN_EXCLUDED_DIRS = Object.freeze([
  '.angular',
  '.nx',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
  '__tests__'
]);

/** 静态扫描不进的文件后缀（adapter-contract.md §3 末段；`.d.ts` 里没有函数体）。 */
export const SCAN_EXCLUDED_SUFFIXES = Object.freeze(['.spec.ts', '.suite.ts', '.d.ts']);

/**
 * 这个路径进不进静态扫描
 *
 * @param {string} relPath 相对 `packages/` 的路径，`/` 分隔
 * @returns {boolean}
 */
export const isScannedSourcePath = relPath => {
  const segments = relPath.split('/');
  if (segments.some(segment => SCAN_EXCLUDED_DIRS.includes(segment))) return false;
  if (!relPath.endsWith('.ts')) return false;
  return !SCAN_EXCLUDED_SUFFIXES.some(suffix => relPath.endsWith(suffix));
};

/**
 * 登记键：文件 + 符号 + 意图
 *
 * @param {{ file: string, symbol: string, intent: string }} row 登记表的一行，或一处自报
 * @returns {string}
 */
export const registryKeyOf = row => `${row.file}·${row.symbol}·${row.intent}`;

/** 涂白后的偏移量对应的 1-based 行号。 */
const lineAt = (code, index) => code.slice(0, index).split('\n').length;

/** 注释、字符串与正则字面量全部涂成等长空白。 */
const blankAll = source => blankStringLiterals(stripComments(source));

const IDENTIFIER_TAIL = /(#?[A-Za-z_$][\w$]*)\s*$/;

const skipSpaceBack = (code, index) => {
  let cursor = index;
  while (cursor >= 0 && /\s/.test(code[cursor])) cursor -= 1;
  return cursor;
};

/** 从 `)` 往回找配对的 `(`；找不到返回 -1。 */
const matchParenBack = (code, closeIndex) => {
  let depth = 0;
  for (let cursor = closeIndex; cursor >= 0; cursor -= 1) {
    if (code[cursor] === ')') depth += 1;
    else if (code[cursor] === '(') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
};

/** 把 `<T extends X>` 这样的尾部泛型参数去掉，露出名字。 */
const stripTrailingGenerics = head => {
  if (!head.endsWith('>')) return head;
  let depth = 0;
  for (let cursor = head.length - 1; cursor >= 0; cursor -= 1) {
    if (head[cursor] === '>') depth += 1;
    else if (head[cursor] === '<') {
      depth -= 1;
      if (depth === 0) return head.slice(0, cursor);
    } else if (head[cursor] === '\n') return head;
  }
  return head;
};

/** `const f = (…) =>` / `f: (…) =>` 这类箭头函数的名字藏在参数表之前；匿名箭头返回 `null`。 */
const arrowOwnerName = head => {
  // `\s*` 而不是 `\s+`：head 是 trimEnd 过的，`export const merge_branch = async (` 传进来时
  // 以 `async` **结尾**，要求它后面还有空白就永远匹配不上——而那正是登记表 #5 / #6 那一行。
  const bound = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?$/.exec(head);
  if (bound) return bound[1];
  const property = /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?$/.exec(head);
  return property === null ? null : property[1];
};

/** 后面跟着 `(…) {` 却不是函数头的关键字；`if (…) {` 的名字不是 `if`。 */
const NOT_A_FUNCTION_NAME = Object.freeze(['catch', 'for', 'function', 'if', 'switch', 'while', 'with']);

/**
 * `)` 与 `{` 之间只允许一段返回类型标注
 *
 * @remarks
 * 边界必须收死。放开成「往回找最近的 `)`」的话，`cond ? new Resolver() : other;` 之后的任意一个
 * `try {` 都会跨过分号接上那个 `()`，把 `Resolver` 当成外层函数名——这不是假想，pull-batch.ts
 * 的 `pullBatchOnce` 第一版就是这么被认成 `LWWConflictResolver` 的。
 */
const RETURN_TYPE_BETWEEN = /^\s*:[^;{}]*$/;

/**
 * 这个 `{` 开的是不是某个具名函数的函数体，是的话叫什么
 *
 * @param {string} code 已涂白的源码
 * @param {number} braceIndex `{` 的下标
 * @returns {string | null} 具名函数名；匿名、对象字面量、普通块与类体都是 `null`
 *
 * @remarks
 * 从 `{` 往回读：先吃掉可能的 `=>`，再吃掉可能的返回类型标注，落到参数表的 `)` 上，配对回到 `(`，
 * 参数表之前那个标识符就是名字。读不出来就返回 `null`——**而 `null` 会让外层报「找不到具名函数」**，
 * 不会被当成通过。词法层认不出的形状（比如返回类型里带括号）在这里是一条可见的失败，不是静默放行。
 */
export const enclosingNameOfBrace = (code, braceIndex) => {
  let cursor = skipSpaceBack(code, braceIndex - 1);
  const isArrowBody = cursor >= 1 && code[cursor] === '>' && code[cursor - 1] === '=';
  if (isArrowBody) cursor = skipSpaceBack(code, cursor - 2);
  if (cursor < 0) return null;
  if (code[cursor] !== ')') {
    const annotated = code.lastIndexOf(')', cursor);
    if (annotated === -1) return null;
    if (!RETURN_TYPE_BETWEEN.test(code.slice(annotated + 1, cursor + 1))) return null;
    cursor = annotated;
  }
  const open = matchParenBack(code, cursor);
  if (open === -1) return null;
  const head = stripTrailingGenerics(code.slice(0, open).trimEnd());

  // 箭头函数的名字只能从「谁绑定了它」读出来；读不出来它就是匿名的，**不能**退回去取参数表前
  // 那个标识符——`this.#runSerialized(async () => {` 的参数表前面是 `async`，退回去就会把这个
  // 匿名回调叫成 `async()`，外层那个真正的具名方法反而被它挡住。
  if (isArrowBody) return arrowOwnerName(head);

  const named = IDENTIFIER_TAIL.exec(head);
  if (named === null) return null;
  return NOT_A_FUNCTION_NAME.includes(named[1]) ? null : named[1];
};

/**
 * 每个字符所处的最内层具名函数
 *
 * @param {string} code 已涂白的源码
 * @returns {(index: number) => string | null} 按下标查询
 *
 * @remarks
 * 一趟花括号栈：`{` 入栈（具名函数体入其名，别的入 `null`），`}` 出栈，取栈里最靠近栈顶的非 `null`。
 * 栈里留 `null` 帧而不是只压具名帧，是为了让 `}` 与 `{` 严格配对——只压具名帧的话，函数体里
 * 任何一个 `if (…) { … }` 的 `}` 都会把函数帧弹掉。
 */
export const enclosingFunctionLookup = code => {
  const frames = [];
  const marks = [];
  for (let cursor = 0; cursor < code.length; cursor += 1) {
    if (code[cursor] === '{') {
      frames.push(enclosingNameOfBrace(code, cursor));
      marks.push({ index: cursor, depth: frames.length, name: frames[frames.length - 1] });
      continue;
    }
    if (code[cursor] !== '}') continue;
    marks.push({ index: cursor, depth: frames.length, name: null, close: true });
    frames.pop();
  }

  return index => {
    const stack = [];
    for (const mark of marks) {
      if (mark.index > index) break;
      if (mark.close === true) stack.pop();
      else stack.push(mark.name);
    }
    for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
      if (stack[depth] !== null) return stack[depth];
    }
    return null;
  };
};

/** 形状完整的意图自报；字段顺序与 `TrustedWriteDeclaration` 一致。 */
const DECLARATION_PATTERN =
  /declareTrustedWrite\(\s*([A-Za-z_$][\w$]*)\s*,\s*\{\s*file:\s*'([^']*)',\s*symbol:\s*'([^']*)',\s*intent:\s*TrustedWriteIntent\.([A-Za-z_]\w*)\s*,?\s*\}\s*\)/g;

/** 成员访问的三种写法：`.` 直调、可选链、非空断言后再取属性。 */
const MEMBER_ACCESS = String.raw`(?:\?\.|!\.|\.)`;

/** 受信写原语与批量写方法名的择一。 */
const WRITE_METHODS = [...TRUSTED_WRITE_METHODS, ...BULK_WRITE_METHODS].join('|');

/**
 * `<接收者><取成员><方法>(`；要求有接收者，于是接口成员与 `abstract` 声明天然落选。
 *
 * 取成员那一段认四种形态——`a.m()` / `a?.m()` / `a!.m()` / `a['m']()`（含 `a?.['m']()`）。
 * 只认 `.` 直调的那一版里，后三种都被读成「这文件里没有受信写」：调用真的会执行，
 * 闸门却一声不吭。**当前仓库里一条这样的写法都没有**，收紧是为了挡住还没写出来的那一行。
 *
 * 下标形态的方法名捕进第 4 组（第 3 组是引号，`\3` 要回指它），点形态捕进第 2 组。
 */
const CALL_PATTERN = new RegExp(
  String.raw`((?:this|[A-Za-z_$][\w$]*)(?:\s*${MEMBER_ACCESS}\s*#?[A-Za-z_$][\w$]*)*)` +
    String.raw`\s*(?:${MEMBER_ACCESS}\s*(${WRITE_METHODS})|(?:\?\.|!)?\s*\[\s*(['"])(${WRITE_METHODS})\3\s*\])\s*\(`,
  'g'
);

/**
 * 一个文件里的全部意图自报
 *
 * @param {string} source 源文件原文
 * @returns {{ scope: string, file: string, symbol: string, intent: string, line: number, index: number, enclosing: string | null }[]}
 *
 * @remarks
 * 三个字段都是字符串字面量，涂白之后一个引号都不剩——所以正则跑在**原文**上，再拿匹配位置去
 * 涂白源码里看一眼：那里还留着 `declareTrustedWrite` 才算真声明，被涂掉了就说明它躺在注释或
 * 字符串里（TSDoc 里贴一段示例声明是常事）。涂白与原文等长，偏移量因此可以互换。
 */
export const findDeclarations = source => {
  const code = blankAll(source);
  const enclosingAt = enclosingFunctionLookup(code);
  return [...source.matchAll(DECLARATION_PATTERN)]
    .filter(matched => code.startsWith('declareTrustedWrite', matched.index))
    .map(matched => ({
      scope: matched[1],
      file: matched[2],
      symbol: matched[3],
      intent: matched[4],
      index: matched.index,
      line: lineAt(source, matched.index),
      enclosing: enclosingAt(matched.index)
    }));
};

/**
 * 一个文件里的全部受信写原语 / 批量写调用
 *
 * @param {string} source 源文件原文
 * @returns {{ receiver: string, method: string, line: number, index: number, enclosing: string | null }[]}
 *
 * @remarks
 * 正则跑在**留字符串**的那一份上，不是全涂白的那份：`a['upsertMany']()` 的方法名自己就是
 * 一个字面量，涂白之后这一整类调用连名字都不剩。于是「整条调用躺在注释或字符串里」这件事
 * 改由 {@link findDeclarations} 那套偏移互换法来判——两份视图等长，拿匹配起点（也就是接收者
 * 的首字符）去全涂白的那份看一眼：还在就是真代码，被涂掉了就说明这段是示例文本。
 *
 * 接收者里的 `?` / `!` 连同空白一起去掉，`this?.adapter` 与 `this.adapter` 归一成同一个键；
 * 不归一的话，本来登记在 `KNOWN_NON_PRIMITIVE_RECEIVERS` /
 * `QUERY_CACHE_BULK_WRITE_CALLSITES` 里的调用点会因为多了一个 `?` 而对不上，凭空变成假阳性。
 */
export const findPrimitiveCalls = source => {
  const blanked = blankAll(source);
  const code = stripComments(source);
  const enclosingAt = enclosingFunctionLookup(blanked);
  return [...code.matchAll(CALL_PATTERN)]
    .filter(matched => blanked[matched.index] === code[matched.index])
    .map(matched => ({
      receiver: matched[1].replace(/[\s?!]/g, ''),
      method: matched[2] ?? matched[4],
      index: matched.index,
      line: lineAt(blanked, matched.index),
      enclosing: enclosingAt(matched.index)
    }));
};

/**
 * 在一棵 AST 里按变量名找出它的初始化表达式。
 *
 * @param {import('typescript').SourceFile} sourceFile 已解析的源文件
 * @param {string} name 变量名
 * @returns {import('typescript').Expression | null} 找不到时为 `null`
 *
 * @remarks
 * 穿透 `as const` / `satisfies` 这类只影响类型的包装：登记表写成
 * `= [...] as const` 还是裸数组，是 `trusted-write-intent.ts` 的自由，不该让本脚本读不出来。
 */
const findInitializer = (sourceFile, name) => {
  let found = null;
  const visit = node => {
    if (found !== null) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      let initializer = node.initializer;
      while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))
        initializer = initializer.expression;
      found = initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
};

/**
 * 读一个对象字面量里某个键的值，按**键名**取。
 *
 * @param {import('typescript').ObjectLiteralExpression} literal 对象字面量
 * @param {string} key 键名
 * @returns {import('typescript').Expression | null} 键不在时为 `null`
 */
const propertyOf = (literal, key) => {
  for (const property of literal.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    const text = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
    if (text === key) return property.initializer;
  }
  return null;
};

/**
 * 取一个字符串字面量的内容，不是字符串就抛。
 *
 * @param {import('typescript').Expression | null} node 待读取的表达式
 * @param {string} where 报错时用来定位的说明
 * @returns {string}
 */
const stringValueOf = (node, where) => {
  if (node === null || !ts.isStringLiteralLike(node)) throw new Error(`${where} 不是字符串字面量`);
  return node.text;
};

/**
 * 从 `trusted-write-intent.ts` 里解析登记表与意图枚举
 *
 * @param {string} source `trusted-write-intent.ts` 原文
 * @returns {{ intents: string[], rows: { file: string, symbol: string, writePrimitive: string, intent: string, entrance: string, verifiedAtLine: number }[] }}
 * @throws {Error} 解析不出登记表或枚举时抛——这个脚本没有「表是空的所以全都合规」这条出路
 *
 * @remarks
 * **登记表是数据，用 AST 按键名读，不用正则按键序读。** 正则那一版把「六个字段按这个顺序、
 * 中间只准有逗号和空白」写死在本脚本里，等于在门禁侧再编码一遍登记表的书写形状——而那是
 * `trusted-write-intent.ts` 的自由。重排一行的字段、给某一行补一个与本门禁无关的新字段，
 * 都会让那一行**静默**从登记表里消失；对应的真实声明随即变成「不在 TRUSTED_CALLSITE_REGISTRY
 * 里」的假阳性，而门禁指出的位置是一处没有问题的代码。
 *
 * 这与文件头「不用 TypeScript 解析器」那条**不冲突**：那条说的是跨 `packages/` 扫调用点的那
 * 半边——判据落在词法层，也没有一份能覆盖全仓的类型化 Program 可用。读一张自家的常量表是另
 * 一件事，`scripts/audit/api-surface.mjs` 早已按同样理由引了 `typescript`。
 */
export const parseRegistry = source => {
  const sourceFile = ts.createSourceFile(REGISTRY_SOURCE_FILE, source, ts.ScriptTarget.Latest, true);

  const enumLiteral = findInitializer(sourceFile, 'TrustedWriteIntent');
  if (enumLiteral === null || !ts.isObjectLiteralExpression(enumLiteral)) {
    throw new Error(`${REGISTRY_SOURCE_FILE} 里找不到 TrustedWriteIntent 枚举`);
  }
  const intents = enumLiteral.properties.map(property => {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      throw new Error("TrustedWriteIntent 的成员必须是 `名字: '名字'` 形态");
    }
    const member = property.name.text;
    const value = stringValueOf(property.initializer, `TrustedWriteIntent.${member} 的值`);
    if (member !== value) {
      throw new Error(`TrustedWriteIntent.${member} 的值是 '${value}'：本脚本按成员名比对，两者必须同名`);
    }
    return member;
  });
  if (intents.length === 0) throw new Error('TrustedWriteIntent 解析出 0 个成员');

  const tableLiteral = findInitializer(sourceFile, 'TRUSTED_CALLSITE_REGISTRY');
  if (tableLiteral === null || !ts.isArrayLiteralExpression(tableLiteral)) {
    throw new Error(`${REGISTRY_SOURCE_FILE} 里找不到 TRUSTED_CALLSITE_REGISTRY`);
  }
  const rows = tableLiteral.elements.map((element, index) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error(`TRUSTED_CALLSITE_REGISTRY 第 ${index + 1} 项不是对象字面量`);
    }
    const where = `TRUSTED_CALLSITE_REGISTRY 第 ${index + 1} 项`;

    // `intent` 是唯一一个不写字符串的字段：它必须是 `TrustedWriteIntent.成员`。
    // 允许裸字符串的话，登记表就能引用一个枚举里没有的意图而不被下面那条交叉校验看见。
    const intentNode = propertyOf(element, 'intent');
    if (intentNode === null || !ts.isPropertyAccessExpression(intentNode)) {
      throw new Error(`${where} 的 intent 不是 TrustedWriteIntent.成员 形态`);
    }

    const verifiedAtLineNode = propertyOf(element, 'verifiedAtLine');
    if (verifiedAtLineNode === null || !ts.isNumericLiteral(verifiedAtLineNode)) {
      throw new Error(`${where} 的 verifiedAtLine 不是数字字面量`);
    }

    return {
      file: stringValueOf(propertyOf(element, 'file'), `${where} 的 file`),
      symbol: stringValueOf(propertyOf(element, 'symbol'), `${where} 的 symbol`),
      writePrimitive: stringValueOf(propertyOf(element, 'writePrimitive'), `${where} 的 writePrimitive`),
      intent: intentNode.name.text,
      entrance: stringValueOf(propertyOf(element, 'entrance'), `${where} 的 entrance`),
      verifiedAtLine: Number(verifiedAtLineNode.text)
    };
  });
  if (rows.length === 0) throw new Error('TRUSTED_CALLSITE_REGISTRY 解析出 0 行');

  const unknown = rows.filter(row => !intents.includes(row.intent));
  if (unknown.length > 0) {
    throw new Error(`登记表引用了不存在的意图：${unknown.map(row => row.intent).join('、')}`);
  }

  return { intents, rows };
};

/**
 * 找一个类型别名的右侧
 *
 * @param {import('typescript').SourceFile} sourceFile 已解析的源文件
 * @param {string} name 别名名字
 * @returns {import('typescript').TypeNode | null}
 */
const findTypeAlias = (sourceFile, name) => {
  let found = null;
  const visit = node => {
    if (found !== null) return;
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) {
      found = node.type;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
};

/**
 * 从 `TrustedWritePrimitive` 解析出扫描器该认的宿主与方法
 *
 * @param {string} source `trusted-write-intent.ts` 原文
 * @returns {{ scopes: string[], methods: string[] }} 各自去重，顺序按联合里首次出现
 * @throws {Error} 别名不在、不是字符串字面量联合、或某一项不是 `宿主.方法` 形状时抛
 *
 * @remarks
 * **这里读的是类型，不是登记表的数据行。** 拿 9 行 `writePrimitive` 去推词表也能得到同一个集合，
 * 但那是「现在恰好有人这么调」；联合是「允许这么调」。核心加一个宿主或方法时，先变的是联合——
 * 而这条门禁要在第一处调用写出来之前就认得它。
 */
export const parsePrimitiveVocabulary = source => {
  const sourceFile = ts.createSourceFile(REGISTRY_SOURCE_FILE, source, ts.ScriptTarget.Latest, true);
  const alias = findTypeAlias(sourceFile, 'TrustedWritePrimitive');
  if (alias === null) throw new Error(`${REGISTRY_SOURCE_FILE} 里找不到 TrustedWritePrimitive`);

  const members = ts.isUnionTypeNode(alias) ? alias.types : [alias];
  const scopes = [];
  const methods = [];
  for (const member of members) {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteralLike(member.literal)) {
      throw new Error('TrustedWritePrimitive 的每一项都必须是字符串字面量');
    }
    const segments = member.literal.text.split('.');
    if (segments.length !== 2 || segments.some(segment => segment === '')) {
      throw new Error(`TrustedWritePrimitive 的 '${member.literal.text}' 不是 宿主.方法 形状`);
    }
    if (!scopes.includes(segments[0])) scopes.push(segments[0]);
    if (!methods.includes(segments[1])) methods.push(segments[1]);
  }
  return { scopes, methods };
};

/**
 * 从 `bulk-write-gate.ts` 的 `METHOD_NAMES` 解析出对外方法名
 *
 * @param {string} source `bulk-write-gate.ts` 原文
 * @returns {string[]} 按书写顺序
 * @throws {Error} 表不在、不是对象字面量、或解析出 0 项时抛
 *
 * @remarks
 * 那张表是 `Record<BulkWriteOperation, string>`，于是它被穷尽性检查钉在核心的
 * `InterceptedBulkWrite` 上——从它读，等于间接从核心读，而不必让本脚本再认得
 * 「内部键怎么折成对外方法名」这条规则（`upsert_many` → `upsertMany` 看着像纯驼峰化，
 * 但那是那张表的自由，不是本脚本的判据）。
 */
export const parseBulkWriteMethods = source => {
  const sourceFile = ts.createSourceFile(BULK_WRITE_GATE_SOURCE_FILE, source, ts.ScriptTarget.Latest, true);
  const literal = findInitializer(sourceFile, 'METHOD_NAMES');
  if (literal === null || !ts.isObjectLiteralExpression(literal)) {
    throw new Error(`${BULK_WRITE_GATE_SOURCE_FILE} 里找不到 METHOD_NAMES`);
  }
  const methods = literal.properties.map((property, index) => {
    if (!ts.isPropertyAssignment(property)) throw new Error(`METHOD_NAMES 第 ${index + 1} 项不是 键: 值 形态`);
    return stringValueOf(property.initializer, `METHOD_NAMES 第 ${index + 1} 项的值`);
  });
  if (methods.length === 0) throw new Error('METHOD_NAMES 解析出 0 个方法名');
  return methods;
};

/**
 * 一张词表与它的真实出处逐项对照，两边多出来的都抛
 *
 * @param {string} what 这张词表是什么，进错误信息
 * @param {readonly string[]} derived 从真实源码读出来的
 * @param {readonly string[]} literal 本脚本里写着的
 * @param {string} source 真实出处，进错误信息
 * @throws {Error} 任一侧多出条目时抛
 *
 * @remarks
 * **按集合比，不按顺序比。** 顺序是那份联合 / 那张表的书写自由，把它也当判据，就等于再犯一次
 * {@link parseRegistry} 上面那条注释说的错。
 */
const assertSameVocabulary = (what, derived, literal, source) => {
  const missing = derived.filter(item => !literal.includes(item));
  if (missing.length > 0) {
    throw new Error(
      `${source} 里的${what} ${missing.join('、')} 不在本脚本的词表里：` +
        '这个扫描器现在一处都看不见它们，把它加进词表（改完这里，本文件的 spec 会告诉你还差哪一格）'
    );
  }
  const stale = literal.filter(item => !derived.includes(item));
  if (stale.length > 0) {
    throw new Error(
      `本脚本词表里的${what} ${stale.join('、')} 在 ${source} 里已经没有对应项：` + '扫描器在认一个不存在的东西，删掉它'
    );
  }
};

/**
 * 校验扫描器的三张词表与真实类型一致
 *
 * @param {{ registrySource: string, bulkWriteGateSource: string }} sources 两个出处的原文
 * @throws {Error} 任一张词表与出处不一致时抛
 *
 * @remarks
 * 这条校验的位置很关键：它跑在**扫描之前**。放在扫描之后的话，词表漏一项的那一轮会先打印
 * 一行「0 处违规」，再抛一个没人看的错。
 */
export const assertScannerVocabulary = ({ registrySource, bulkWriteGateSource }) => {
  const { scopes, methods } = parsePrimitiveVocabulary(registrySource);
  assertSameVocabulary('宿主', scopes, TRUSTED_PRIMITIVE_SCOPES, 'TrustedWritePrimitive');
  assertSameVocabulary('写原语方法', methods, TRUSTED_WRITE_METHODS, 'TrustedWritePrimitive');
  assertSameVocabulary('批量写方法', parseBulkWriteMethods(bulkWriteGateSource), BULK_WRITE_METHODS, 'METHOD_NAMES');
};

/** 一处受信写原语调用的归属判定结果。 */
const classifyPrimitiveCall = (call, { relPath, declarationsByFunction, registryByKey }) => {
  const receiverKey = `${relPath}·${call.receiver}`;
  const scope = call.receiver.includes('.') ? null : call.receiver;

  if (BULK_WRITE_METHODS.includes(call.method)) {
    if (QUERY_CACHE_BULK_WRITE_CALLSITES.includes(receiverKey)) return null;
    return `${call.method}() 只许打 QueryCache 的本地缓存表；版本化业务实体走它就绕开了工作树捕获（bulk-write-gate.ts）`;
  }

  if (!TRUSTED_PRIMITIVE_SCOPES.includes(scope)) {
    if (Object.hasOwn(KNOWN_NON_PRIMITIVE_RECEIVERS, call.receiver)) return null;
    return `接收者 \`${call.receiver}\` 既不是受信写原语的宿主（${TRUSTED_PRIMITIVE_SCOPES.join(' / ')}），也没登记在 KNOWN_NON_PRIMITIVE_RECEIVERS 里：按未知入口拒绝`;
  }

  if (call.enclosing === null) return '这处批量重写不在任何具名函数里，登记键无从谈起：抽成具名函数再自报意图';

  const declared = declarationsByFunction.get(call.enclosing);
  if (declared === undefined) {
    return `\`${call.enclosing}()\` 调了 ${call.receiver}.${call.method}() 却没有 declareTrustedWrite()：未携带意图标记的批量重写按未知入口拒绝`;
  }

  const matching = declared.filter(declaration => registryByKey.has(registryKeyOf(declaration)));
  if (matching.length === 0) {
    return `\`${call.enclosing}()\` 自报的意图都不在登记表里：${declared.map(registryKeyOf).join('、')}`;
  }
  return null;
};

/**
 * 审计一个源文件
 *
 * @param {{ relPath: string, source: string, registryByKey: Map<string, { verifiedAtLine: number }>, seenKeys: Set<string> }} input 相对路径、原文、按登记键索引的登记表，以及一个由调用方持有的「已见到的登记键」集合（本函数往里加）
 * @returns {string[]} 每条都是一句可直接照着修的说明；空数组即通过
 *
 * @remarks
 * 收的是整行而不只是键：`verifiedAtLine` 的核对要拿登记的行号跟真实声明的行号比
 * （{@link LINE_DRIFT_TOLERANCE}），只给一个键集合就做不了这件事。
 */
export const auditSource = ({ relPath, source, registryByKey, seenKeys }) => {
  const offenders = [];
  const declarations = findDeclarations(source);
  const basename = relPath.split('/').pop();
  const lineCount = source.split('\n').length;

  for (const declaration of declarations) {
    const where = `${relPath}:${declaration.line}`;
    if (declaration.file !== basename) {
      offenders.push(`${where} 自报 file 为 '${declaration.file}'，实际在 ${basename}`);
    }
    if (declaration.enclosing === null) {
      offenders.push(`${where} 不在任何具名函数里：登记键的 symbol 段取的是最内层具名函数`);
    } else if (declaration.enclosing !== declaration.symbol) {
      offenders.push(
        `${where} 自报 symbol 为 '${declaration.symbol}'，最内层具名函数却是 '${declaration.enclosing}'：登记键取实际发起写的函数，不是委托门面`
      );
    }
    const registered = registryByKey.get(registryKeyOf(declaration));
    if (registered === undefined) {
      offenders.push(`${where} 的登记键 \`${registryKeyOf(declaration)}\` 不在 TRUSTED_CALLSITE_REGISTRY 里`);
    } else if (registered.verifiedAtLine < 1 || registered.verifiedAtLine > lineCount) {
      offenders.push(
        `${where} 的存档行号 ${registered.verifiedAtLine} 落在 ${basename}（共 ${lineCount} 行）之外：「已与真实代码核对」核的不是这一版`
      );
    } else if (Math.abs(declaration.line - registered.verifiedAtLine) > LINE_DRIFT_TOLERANCE) {
      offenders.push(
        `${where} 与存档行号 ${registered.verifiedAtLine} 相差 ${Math.abs(declaration.line - registered.verifiedAtLine)} 行（上限 ${LINE_DRIFT_TOLERANCE}）：把 verifiedAtLine 与 adapter-contract.md §3 的「行」一起刷新`
      );
    }
    if (!TRUSTED_PRIMITIVE_SCOPES.includes(declaration.scope)) {
      offenders.push(
        `${where} 的作用域实参是 \`${declaration.scope}\`，不是 ${TRUSTED_PRIMITIVE_SCOPES.join(' / ')}：受信声明必须挂在真正执行写的那个宿主上`
      );
    }
    seenKeys.add(registryKeyOf(declaration));
  }

  const declarationsByFunction = new Map();
  for (const declaration of declarations) {
    const bucket = declarationsByFunction.get(declaration.enclosing) ?? [];
    bucket.push(declaration);
    declarationsByFunction.set(declaration.enclosing, bucket);
  }

  for (const call of findPrimitiveCalls(source)) {
    const rejection = classifyPrimitiveCall(call, { relPath, declarationsByFunction, registryByKey });
    if (rejection !== null) offenders.push(`${relPath}:${call.line} ${rejection}`);
  }

  return offenders;
};

/** 递归列出 `packages/` 下所有参与扫描的 `.ts`，返回相对 `packages/` 的路径。 */
export const collectSourceFiles = async (root, prefix = '') => {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SCAN_EXCLUDED_DIRS.includes(entry.name)) continue;
      files.push(...(await collectSourceFiles(root, relPath)));
      continue;
    }
    if (isScannedSourcePath(relPath)) files.push(relPath);
  }
  return files.sort();
};

/**
 * 扫描整个 `packages/`
 *
 * @param {{ packagesRoot: string }} options 仓库的 `packages/` 目录
 * @returns {Promise<{ files: number, offenders: string[], seenKeys: Set<string>, registry: ReturnType<typeof parseRegistry> }>}
 * @throws {Error} 扫描词表与真实类型不一致时**先**抛（{@link assertScannerVocabulary}），一个文件都不扫
 */
export const auditRepository = async ({ packagesRoot }) => {
  const registrySource = await readFile(path.join(packagesRoot, REGISTRY_SOURCE_FILE), 'utf8');
  assertScannerVocabulary({
    registrySource,
    bulkWriteGateSource: await readFile(path.join(packagesRoot, BULK_WRITE_GATE_SOURCE_FILE), 'utf8')
  });
  const registry = parseRegistry(registrySource);
  const registryByKey = new Map(registry.rows.map(row => [registryKeyOf(row), row]));
  const seenKeys = new Set();
  const files = await collectSourceFiles(packagesRoot);
  const offenders = [];

  for (const relPath of files) {
    const source = await readFile(path.join(packagesRoot, relPath), 'utf8');
    offenders.push(...auditSource({ relPath, source, registryByKey, seenKeys }));
  }

  for (const key of registryByKey.keys()) {
    if (!seenKeys.has(key)) offenders.push(`登记表有 \`${key}\`，真实代码里却找不到对应的 declareTrustedWrite()`);
  }

  return { files: files.length, offenders, seenKeys, registry };
};

const main = async () => {
  const packagesRoot = path.resolve('packages');

  let result;
  try {
    result = await auditRepository({ packagesRoot });
  } catch (error) {
    console.error(`❌ ${error.message}`);
    console.error('\n这条审计必须在仓库根目录运行，且登记表与意图枚举必须能被词法解析出来。');
    process.exit(1);
    return;
  }

  if (result.offenders.length > 0) {
    console.error('❌ 受信写调用点漂移（adapter-contract.md §3、R5、SC-010）：');
    for (const offender of result.offenders) console.error(`   ${offender}`);
    console.error(
      '\n修法：受信路径在**发起写的那个具名函数**里调 declareTrustedWrite()，' +
        `并把「文件 + 符号 + 意图」这一行加进 ${REGISTRY_SOURCE_FILE} 与 contracts/adapter-contract.md §3；` +
        '\n批量写请改用 Repository 的写入 API，使其经过工作树捕获。'
    );
    process.exit(1);
    return;
  }

  process.stdout.write(
    `✅ Working tree callsite drift passed (${result.files} files, ${result.seenKeys.size}/${result.registry.rows.length} registered call sites).\n`
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
