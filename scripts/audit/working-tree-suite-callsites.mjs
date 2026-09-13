/**
 * scripts/audit/working-tree-suite-callsites.mjs
 *
 * 工作树一致性套件的**调用点**门禁：6 个 v1 适配器包各自都必须实际调用
 * `workingTreeCaptureConformanceSuite` 与 `workingTreeCommitConformanceSuite` 两套套件，
 * 缺一即失败（`specs/001-working-tree-commits/contracts/conformance-suites.md` §0、SC-006）。
 *
 * 触发路径：`pnpm audit:suite-callsites`。
 *
 * **还没接进 CI**，因为它现在就是红的：捕获侧的 6 个调用点要等 US-306 阶段 A（T068）落地。
 * 接进 `.github/workflows/ci-template.yml` 的 audit 段是 T068 的收口动作——在那之前把一条
 * 必红的门禁挂上 CI，唯一的后果是所有人学会忽略它。
 *
 * 为什么需要这条门禁：套件本体按 `*.suite.ts` 命名，因此被命名门禁与漂移扫描排除，
 * **vitest 也不收它**——套件写得再全，只要没有一个 `*.spec.ts` 去调它，它一条用例都不会跑。
 * 「导出了但没人跑」等于没覆盖，而这种没覆盖在 CI 上的形态是「全绿」，没有任何人会发现。
 * 运行矩阵是 6 × 2 = 12 个调用点，这条门禁就是那 12 个格子的唯一看守。
 *
 * 为什么包清单写死而不从文件系统推导：这条门禁要回答的恰恰是「该有的在不在」。
 * 从 `packages/` 里扫出「有调用点的包」再校验它们有调用点，是一条永远为真的同义反复——
 * 一个包被漏掉、被改名、被删掉时，它会安静地退 0。清单写死之后，删一个后端必须同时
 * 改这里，也就必须有人解释为什么 v1 矩阵少了一个后端。
 *
 * 为什么不用 TypeScript 解析器：这条门禁的判据全部落在词法层（有没有从公共入口具名导入、
 * 有没有真的调用、有没有被 skip 掉），而 scripts/ 下的审计脚本一律是零依赖的 .mjs，
 * 拖进一个 TS 编译器只为了数一个调用不划算。但**注释与字符串必须先抹掉**：一个被注释掉的
 * 调用在纯文本匹配下与真调用完全一样，而「先注释掉、回头再打开」正是这条门禁最该拦的情形。
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 两套套件的公共入口；调用点必须从这里导入，不得深路径直连套件文件。 */
export const SUITE_ENTRY = '@aiao/rxdb/testing';

/** conformance-suites.md §0 的两套套件，没有第三套。 */
export const CONFORMANCE_SUITE_NAMES = Object.freeze([
  'workingTreeCaptureConformanceSuite',
  'workingTreeCommitConformanceSuite'
]);

/** v1 运行矩阵的 6 个后端，见 spec.md「范围边界」。Tauri Rust host 不在 v1 内。 */
export const V1_ADAPTER_PACKAGES = Object.freeze([
  'rxdb-adapter-pglite',
  'rxdb-adapter-wa-sqlite',
  'rxdb-adapter-sqlite-wasm',
  'rxdb-adapter-sqlite',
  'rxdb-adapter-sqliteai',
  'rxdb-adapter-electron'
]);

/** 两套套件的导出处，供 {@link findMissingSuiteExports} 核对改名。 */
export const TESTING_ENTRY_FILE = 'rxdb/src/working-tree/testing/index.ts';

/** `/` 出现在这些字符之后时是正则开头，不是除号。 */
const REGEX_AFTER_PUNCTUATION = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '~',
  '^',
  '<',
  '>'
]);

/** `/` 出现在这些关键字之后时同样是正则开头（`return /x/`）。 */
const REGEX_AFTER_KEYWORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'void',
  'delete',
  'new'
]);

/** vitest 上会让用例不跑、或只在某些机器上跑的修饰符。 */
const DISABLING_MODIFIER = /\b(describe|suite|it|test)\s*\.\s*(skip|todo|skipIf|runIf|failing)\b/;

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 抹成等长空白：换行留着，于是行号与列号都不漂，报错位置仍可直接定位。 */
const blankOut = chunk => chunk.replace(/[^\n]/g, ' ');

/**
 * 一次词法扫描，按需抹掉注释与字符串。
 *
 * 注释**永远**被识别（哪怕不抹），否则 `// it's fine` 里的撇号会被当成字符串开头，
 * 一路吃到下一个引号，把中间的真代码吞掉。同理，字符串永远被识别，否则字符串里的
 * `https://` 会被当成行注释开头。正则字面量与字符串同进同出：它里面的引号若不认，
 * `/['"]/` 之后的整段代码都会被误判成字符串。
 *
 * @param {string} source 源码
 * @param {{ blankComments: boolean, blankStrings: boolean }} options 抹哪些
 * @returns {string} 与入参等长的源码
 */
const scan = (source, { blankComments, blankStrings }) => {
  let out = '';
  let index = 0;
  let lastSignificant = '';
  let lastWord = '';

  const emitCode = char => {
    out += char;
    if (/\s/.test(char)) return;
    lastSignificant = char;
    lastWord = IDENTIFIER_CHAR.test(char) ? lastWord + char : '';
  };

  const emitChunk = (chunk, blank) => {
    out += blank ? blankOut(chunk) : chunk;
    lastSignificant = blank ? '' : chunk[chunk.length - 1];
    lastWord = '';
  };

  /** 找到成对的结束符位置（返回结束符之后的下标）；找不到返回 -1。 */
  const closeAt = (start, terminator, allowNewline) => {
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (!allowNewline && char === '\n') return -1;
      if (char === terminator) return i + 1;
    }
    return -1;
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      emitChunk(source.slice(index, stop), blankComments);
      index = stop;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      emitChunk(source.slice(index, stop), blankComments);
      index = stop;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      // 模板字面量整体抹掉，包括 `${}` 里的表达式：模板里的调用不是调用点，
      // 而把 `${}` 拆出来解析需要一个真解析器。
      const stop = closeAt(index + 1, char, char === '`');
      const end = stop === -1 ? source.length : stop;
      emitChunk(source.slice(index, end), blankStrings);
      index = end;
      continue;
    }

    if (
      char === '/' &&
      (REGEX_AFTER_PUNCTUATION.has(lastSignificant) || REGEX_AFTER_KEYWORD.has(lastWord) || lastSignificant === '')
    ) {
      const stop = closeAt(index + 1, '/', false);
      if (stop !== -1) {
        emitChunk(source.slice(index, stop), blankStrings);
        index = stop;
        continue;
      }
      // 同一行内没闭合：那它其实是除号，按普通代码处理。
    }

    emitCode(char);
    index += 1;
  }

  return out;
};

/**
 * 把注释抹成等长空白，字符串原样保留（导入语句的模块说明符还要读）。
 *
 * @param {string} source 源码
 * @returns {string} 与入参等长的源码
 */
export const stripComments = source => scan(source, { blankComments: true, blankStrings: false });

/**
 * 把字符串与正则字面量抹成等长空白，注释原样保留。
 *
 * @param {string} source 源码
 * @returns {string} 与入参等长的源码
 */
export const blankStringLiterals = source => scan(source, { blankComments: false, blankStrings: true });

/**
 * 在导入语句里找某个具名导入，解析出本地绑定名。
 *
 * @param {string} source 已抹掉注释、但保留字符串的源码
 * @param {string} exportedName 要找的导出名
 * @returns {{ local: string, from: string, typeOnly: boolean } | null}
 */
const findNamedImport = (source, exportedName) => {
  const importPattern = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3/g;

  for (const match of source.matchAll(importPattern)) {
    const clauseIsTypeOnly = match[1] !== undefined;
    for (const raw of match[2].split(',')) {
      const specifier = raw.trim();
      if (specifier === '') continue;
      const inlineType = /^type\s+/.test(specifier);
      const [imported, local] = specifier.replace(/^type\s+/, '').split(/\s+as\s+/);
      if (imported !== exportedName) continue;
      return { local: local ?? imported, from: match[4], typeOnly: clauseIsTypeOnly || inlineType };
    }
  }

  return null;
};

/**
 * 判定一个源文件对某套套件的调用形状。
 *
 * @param {string} source 源码
 * @param {string} suiteName 套件导出名
 * @returns {{ local: string | null, importedFrom: string | null, typeOnly: boolean, called: boolean, disabledBy: string | null }}
 */
export const inspectSource = (source, suiteName) => {
  const withStrings = stripComments(source);
  const code = blankStringLiterals(withStrings);

  const binding = findNamedImport(withStrings, suiteName);
  const local = binding === null ? null : binding.local;
  const callPattern = local === null ? null : new RegExp(`(?<![A-Za-z0-9_$.])${escapeRegExp(local)}\\s*\\(`);
  const disabling = DISABLING_MODIFIER.exec(code);

  return {
    local,
    importedFrom: binding === null ? null : binding.from,
    typeOnly: binding !== null && binding.typeOnly,
    called: callPattern !== null && callPattern.test(code),
    disabledBy: disabling === null ? null : `${disabling[1]}.${disabling[2]}`
  };
};

/**
 * 这份判定为什么不算合格调用点。
 *
 * @param {ReturnType<typeof inspectSource>} inspection {@link inspectSource} 的结果
 * @returns {string | null} 合格时为 `null`
 */
export const describeRejection = inspection => {
  if (inspection.local === null) {
    return `未从 '${SUITE_ENTRY}' 具名导入套件（命名空间导入不算：调用点必须能被 grep 到）`;
  }
  if (inspection.typeOnly) return 'type-only 导入：类型不会在运行时调用任何东西';
  if (inspection.importedFrom !== SUITE_ENTRY) {
    return `从 '${inspection.importedFrom}' 导入，绕过了公共入口 '${SUITE_ENTRY}'`;
  }
  if (!inspection.called) return '导入了但未调用——「导出了但没人跑」等于没覆盖';
  if (inspection.disabledBy !== null) {
    return `被 ${inspection.disabledBy} 关掉了：运行矩阵是 6 × 2，条件运行等于允许它在某些机器上悄悄缩水`;
  }
  return null;
};

/** 递归收集目录下的 `*.spec.ts`（套件本体是 `*.suite.ts`，vitest 不收，这里也不算）。 */
const listSpecFiles = async dir => {
  const found = [];

  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      found.push(...(await listSpecFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.spec.ts')) found.push(full);
  }

  return found;
};

/**
 * 扫一个包，找某套套件的调用点。
 *
 * @param {string} packageDir 包目录绝对路径
 * @param {string} suiteName 套件导出名
 * @returns {Promise<{ satisfied: string[], rejected: Array<{ file: string, reason: string }> }>}
 *   `rejected` 只收**提到了套件名**却不合格的文件，用作违规信息里的线索
 */
export const findPackageCallsites = async (packageDir, suiteName) => {
  const srcDir = path.join(packageDir, 'src');
  const satisfied = [];
  const rejected = [];

  if (!existsSync(srcDir)) return { satisfied, rejected };

  for (const file of await listSpecFiles(srcDir)) {
    const source = await readFile(file, 'utf8');
    const code = blankStringLiterals(stripComments(source));
    if (!code.includes(suiteName)) continue;

    const relative = path.relative(packageDir, file);
    const reason = describeRejection(inspectSource(source, suiteName));
    if (reason === null) satisfied.push(relative);
    else rejected.push({ file: relative, reason });
  }

  return { satisfied, rejected };
};

/**
 * 两套套件是不是都还从 testing 入口导出。
 *
 * 套件改名时，这一条让门禁报「导出名变了」，而不是 12 条「缺调用点」——后者会把一次
 * 重命名伪装成一场全面塌方，排查的人得先自己还原出真正发生了什么。
 *
 * @param {string} source `working-tree/testing/index.ts` 的源码
 * @returns {string[]} 缺失的套件名
 */
export const findMissingSuiteExports = source => {
  const code = stripComments(source);
  const exported = new Set();

  for (const match of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of match[1].split(',')) {
      const specifier = raw.trim().replace(/^type\s+/, '');
      if (specifier === '') continue;
      const parts = specifier.split(/\s+as\s+/);
      exported.add(parts[parts.length - 1]);
    }
  }

  return CONFORMANCE_SUITE_NAMES.filter(name => !exported.has(name));
};

/**
 * 全量：6 个 v1 适配器包 × 2 套套件。
 *
 * @param {{ packagesRoot: string }} options packages/ 目录绝对路径
 * @returns {Promise<{ packages: number, offenders: string[] }>} `packages` 是真正扫到的包数
 */
export const auditCallsites = async ({ packagesRoot }) => {
  const offenders = [];
  let packages = 0;

  for (const name of V1_ADAPTER_PACKAGES) {
    const packageDir = path.join(packagesRoot, name);
    if (!existsSync(packageDir)) {
      offenders.push(`${name}: 包目录不存在——v1 运行矩阵少了一个后端`);
      continue;
    }
    packages += 1;

    for (const suiteName of CONFORMANCE_SUITE_NAMES) {
      const { satisfied, rejected } = await findPackageCallsites(packageDir, suiteName);
      if (satisfied.length > 0) continue;
      const hints = rejected.map(item => `${item.file}: ${item.reason}`);
      const detail = hints.length === 0 ? '' : ` —— ${hints.join('；')}`;
      offenders.push(`${name}: 缺 ${suiteName}() 的调用点${detail}`);
    }
  }

  return { packages, offenders };
};

const main = async () => {
  const packagesRoot = path.resolve('packages');
  const testingEntry = path.join(packagesRoot, TESTING_ENTRY_FILE);

  if (!existsSync(testingEntry)) {
    console.error(
      `❌ 找不到套件导出入口 ${path.relative(process.cwd(), testingEntry)}：这条审计必须在仓库根目录运行。`
    );
    process.exit(1);
  }

  const missingExports = findMissingSuiteExports(await readFile(testingEntry, 'utf8'));
  if (missingExports.length > 0) {
    console.error(`❌ ${TESTING_ENTRY_FILE} 没有导出这些套件：`);
    for (const name of missingExports) console.error(`   ${name}`);
    console.error('\n套件改名了就同步改本脚本的 CONFORMANCE_SUITE_NAMES，并把 6 个适配器包的调用点一起改掉。');
    process.exit(1);
  }

  const { packages, offenders } = await auditCallsites({ packagesRoot });

  if (offenders.length > 0) {
    console.error('❌ 工作树一致性套件的调用点缺失（conformance-suites.md §0、SC-006）：');
    for (const offender of offenders) console.error(`   ${offender}`);
    console.error(
      `\n修法：在该包加一个 src/__tests__/*.spec.ts，从 '${SUITE_ENTRY}' 具名导入套件并在顶层调用，` +
        '复用本包既有的 adapter factory 造已启用提交能力的库。'
    );
    process.exit(1);
  }

  const expected = V1_ADAPTER_PACKAGES.length * CONFORMANCE_SUITE_NAMES.length;
  process.stdout.write(
    `✅ Working tree suite call sites passed (${packages} packages × ${CONFORMANCE_SUITE_NAMES.length} suites = ${expected} call sites).\n`
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
