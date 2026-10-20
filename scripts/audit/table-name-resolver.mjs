/**
 * scripts/audit/table-name-resolver.mjs
 *
 * 表名解析器门禁（US-314 B1.1）：业务实体的物理名只能从两个适配器的表名解析器
 * （`table-name-resolver.ts`）出，解析器之外不许自己拼。
 *
 * 触发路径：`pnpm audit:table-name-resolver`（CI setup job 也跑）。
 *
 * 为什么要机械门禁：可写检出位在同一个库里各有一套业务表（库内影子表）。物理名今天只来自实体
 * 元数据，没有改写口——哪里漏改一处、照旧用命名空间与表名自己拼，就会静默读写别的检出位的表，
 * 不报错、不崩溃，只有数据悄悄错位。解析器的表集参数必填，编译器能逼出「调用了解析器却没给表集」，
 * 但逼不出「根本没调解析器、自己拼了一个名字」——那正是本门禁要拦的。
 *
 * 判据全部落在词法层，不用 TypeScript 解析器（scripts/ 下的审计脚本一律零依赖 .mjs）：
 *
 * - **R1 原始拼名函数**：`get_table_name(`（sqlite-core）与 `getTableName(`（PGlite）只拼主表集的名字、
 *   不判表集，解析器之外不许调。
 * - **R2 手拼物理名**：模板里 `${x.namespace}$` 这种「命名空间 + `$`」的拼法。
 * - **R3 把命名空间当 schema 用**（PGlite）：目录查询的参数对 `[x.namespace, x.tableName]`
 *   与目录键 `${x.namespace}\u0000`——影子表集的 schema 不是命名空间。
 *
 * 只在**涂掉注释**的源码上匹配，字符串保留：SQL 就拼在模板字面量里，涂掉字符串等于什么都看不见。
 * 注释里指路性质的旧写法（「名字由 `get_table_name()` 给出」）不算数。
 *
 * **双向判定**：未登记的命中报出来，登记了却已经不存在的条目同样报出来——
 * 登记表的全部价值在于「还剩几条」是可信的，它只能变短。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stripComments } from './working-tree-suite-callsites.mjs';

/**
 * 被扫描的源码根，相对仓库根。
 *
 * @remarks
 * 写死而不是自动发现：哪个包被删了或改了名，门禁应当报错，而不是静默少扫一块。
 * 入选标准是「会为业务实体推物理名」：两个适配器家族，加上自己拼表名的图插件与搜索插件。
 */
export const SCAN_ROOTS = Object.freeze([
  'packages/rxdb-adapter-sqlite-core/src',
  'packages/rxdb-adapter-pglite/src',
  'packages/rxdb-plugin-graph/src',
  'packages/rxdb-plugin-search/src'
]);

/** 解析器模块：唯一允许推物理名的地方，相对仓库根。 */
export const RESOLVER_FILES = Object.freeze([
  'packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts',
  'packages/rxdb-adapter-pglite/src/table-name-resolver.ts'
]);

/** 解析器必须定义的函数：改了名而门禁的词表没跟上，就要在这里先失败，而不是开始漏扫。 */
export const RESOLVER_VOCABULARY = Object.freeze({
  'packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts': [
    'get_table_name',
    'get_table_name_info',
    'get_table_name_by_metadata',
    'get_table_name_by_entity_type',
    'get_companion_table_name',
    'getTableColumnIndexName',
    'get_storage_object_name'
  ],
  'packages/rxdb-adapter-pglite/src/table-name-resolver.ts': [
    'getTableName',
    'getSchemaName',
    'getTableNameByMetadata',
    'getChangeTriggerFunctionName'
  ]
});

/** 不得再定义原始拼名函数的模块：它们搬进解析器之前就住在这里，长回来就是第二个入口。 */
export const FORMER_HOMES = Object.freeze({
  'packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts': ['get_table_name', 'get_table_name_by_metadata'],
  'packages/rxdb-adapter-pglite/src/pglite.utils.ts': ['getTableName', 'getTableNameByMetadata']
});

/** 任意深度都不扫的目录名：测试里贴一段反例是常事。 */
export const EXCLUDED_DIR_NAMES = Object.freeze(['__tests__']);

/** 规则：编号 → 正则（跑在涂掉注释的源码上）与一句话说明。 */
export const RULES = Object.freeze({
  R1: {
    pattern: /(?<![\w.$])(?:get_table_name|getTableName)\s*\(/g,
    summary: '调用了只拼主表集名字的原始函数（get_table_name / getTableName）'
  },
  R2: {
    pattern: /\$\{\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.namespace\s*\}\$/g,
    summary: '模板里手拼「命名空间 + $」的物理名'
  },
  R3: {
    pattern:
      /\[\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.namespace\s*,\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.tableName|\$\{\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.namespace\s*\}\\u0000/g,
    summary: '把命名空间当 schema 用（目录查询参数对 / 目录键）'
  }
});

/**
 * 尚未改走解析器的推名点，键是 `文件·规则·行号`（文件相对仓库根），值是**它今天还在这里的理由**。
 *
 * @remarks
 * B1.1 把全部推名点收进解析器之后，这张表是空的，也应当一直是空的：新登记一条意味着又长出了
 * 解析器之外的入口，绝大多数时候正确的动作是改走解析器而不是登记它。
 */
export const PENDING_DERIVATIONS = Object.freeze({});

/** 一条命中的键。 */
const derivationKeyOf = (file, rule, line) => `${file}·${rule}·${line}`;

/**
 * 扫一份源码，报出它的全部违规推名点。
 *
 * @param file - 文件路径，相对仓库根
 * @param source - 源文件内容
 * @returns 键（`文件·规则·行号`），按出现顺序
 */
export const auditSource = (file, source) => {
  if (RESOLVER_FILES.includes(file)) return [];
  const code = stripComments(source);
  const keys = [];
  for (const [rule, { pattern }] of Object.entries(RULES)) {
    for (const match of code.matchAll(pattern)) {
      const line = code.slice(0, match.index).split('\n').length;
      keys.push(derivationKeyOf(file, rule, line));
    }
  }
  return keys;
};

/**
 * 词表自检：解析器定义了预期的函数，原先的住处不再定义原始拼名函数。
 *
 * @param readSource - 按相对仓库根的路径读源码
 * @returns 问题清单，空即通过
 */
export const checkVocabulary = async readSource => {
  const problems = [];
  const definitionOf = name => new RegExp(`export\\s+(?:const|function)\\s+${name}\\b`);
  for (const [file, names] of Object.entries(RESOLVER_VOCABULARY)) {
    const source = await readSource(file);
    for (const name of names) {
      if (!definitionOf(name).test(source)) problems.push(`${file} 没有定义 ${name}`);
    }
  }
  for (const [file, names] of Object.entries(FORMER_HOMES)) {
    const source = await readSource(file);
    for (const name of names) {
      if (definitionOf(name).test(source)) problems.push(`${file} 又定义了 ${name}：物理名的入口只能是解析器`);
    }
  }
  return problems;
};

/**
 * 列出一个源码根下要扫的 `.ts` 文件（不含测试）。
 *
 * @param repoRoot - 仓库根的绝对路径
 * @param scanRoot - 相对仓库根的源码根
 * @returns 相对仓库根的文件路径，按字典序
 */
export const collectFiles = async (repoRoot, scanRoot) => {
  const walk = async relDir => {
    const entries = await readdir(path.join(repoRoot, relDir), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const rel = path.posix.join(relDir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.includes(entry.name)) continue;
        files.push(...(await walk(rel)));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(rel);
      }
    }
    return files;
  };
  return (await walk(scanRoot)).sort();
};

/**
 * 跑一遍表名解析器门禁。
 *
 * @param options.repoRoot - 仓库根的绝对路径
 * @param options.registry - 登记表；缺省即 {@link PENDING_DERIVATIONS}
 * @returns `{ unregistered, stale, vocabulary }`，三者都空即通过
 */
export const auditTableNames = async ({ repoRoot, registry = PENDING_DERIVATIONS }) => {
  const readSource = file => readFile(path.join(repoRoot, file), 'utf8');
  const found = new Set();
  for (const scanRoot of SCAN_ROOTS) {
    for (const file of await collectFiles(repoRoot, scanRoot)) {
      for (const key of auditSource(file, await readSource(file))) found.add(key);
    }
  }
  const registered = new Set(Object.keys(registry));
  return {
    unregistered: [...found].filter(key => !registered.has(key)).sort(),
    stale: [...registered].filter(key => !found.has(key)).sort(),
    vocabulary: await checkVocabulary(readSource)
  };
};

const main = async () => {
  const { unregistered, stale, vocabulary } = await auditTableNames({ repoRoot: process.cwd() });

  if (vocabulary.length > 0) {
    console.error('\n表名解析器的词表与源码对不上（门禁会因此漏扫）：\n');
    for (const problem of vocabulary) console.error(`  ✗ ${problem}`);
    console.error('\n解析器改了名就同步 RESOLVER_VOCABULARY；原始拼名函数只能住在解析器里。\n');
  }
  if (unregistered.length > 0) {
    console.error(`\n解析器之外有 ${unregistered.length} 处自己推了物理名：\n`);
    for (const key of unregistered) {
      const [file, rule, line] = key.split('·');
      console.error(`  ✗ ${file}:${line}  ${rule} ${RULES[rule].summary}`);
    }
    console.error(
      '\n改走表名解析器（sqlite-core 的 get_table_name_by_metadata 一族、PGlite 的 getTableNameByMetadata / getSchemaName），' +
        '\n表集照调用方的语义给：本实例读写取 adapter.tableSet，只碰系统表取 WorktreeTableSet.MAIN。\n'
    );
  }
  if (stale.length > 0) {
    console.error(`\nPENDING_DERIVATIONS 里有 ${stale.length} 条已经不存在的推名点：\n`);
    for (const key of stale) console.error(`  ✗ ${key}`);
    console.error('\n已改走解析器，把对应条目从登记表里删掉。\n');
  }
  if (vocabulary.length > 0 || unregistered.length > 0 || stale.length > 0) process.exitCode = 1;
  else
    console.log(
      `表名解析器门禁通过：扫 ${SCAN_ROOTS.length} 个源码根，${Object.keys(PENDING_DERIVATIONS).length} 处待改，全部登记在案。`
    );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
