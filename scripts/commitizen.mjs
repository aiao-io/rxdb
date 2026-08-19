/**
 * scripts/commitizen.mjs
 *
 * commitizen 的 prompt / scope / type 配置。
 * 被 `pnpm commit` (czg) 消费，被 `commit-lint.mjs` 通过正则读取 scopes 做校验。
 *
 * 不要直接执行：本身只是导出 default 配置对象。
 */

import { execSync } from 'node:child_process';

// prettier-ignore
const scopes = [
  { value: 'aiao',                        name: 'aiao:                           框架变更' },
  { value: 'website',                     name: 'website:                        website 变更' },
  { value: 'utils',                       name: 'utils:                          utils 变更' },
  { value: 'code-editor',                 name: 'code-editor:                    code-editor 变更' },
  { value: 'rxdb',                        name: 'rxdb:                           rxdb 变更' },
  { value: 'rxdb-test',                   name: 'rxdb-test:                      rxdb-test 变更' },
  { value: 'rxdb-devtools',               name: 'rxdb-devtools:                  rxdb-devtools 变更' },
  { value: 'rxdb-client-generator',       name: 'rxdb-client-generator:          rxdb-client-generator 变更' },
  { value: 'rxdb-adapter-electron',       name: 'rxdb-adapter-electron:          rxdb-adapter-electron 变更' },
  { value: 'rxdb-adapter-encrypted',      name: 'rxdb-adapter-encrypted:         rxdb-adapter-encrypted 变更' },
  { value: 'rxdb-adapter-miniprogram',    name: 'rxdb-adapter-miniprogram:       rxdb-adapter-miniprogram 变更' },
  { value: 'rxdb-adapter-pglite',         name: 'rxdb-adapter-pglite:            rxdb-adapter-pglite 变更' },
  { value: 'rxdb-adapter-sqlite',         name: 'rxdb-adapter-sqlite:            rxdb-adapter-sqlite 变更' },
  { value: 'rxdb-adapter-sqlite-core',    name: 'rxdb-adapter-sqlite-core:       rxdb-adapter-sqlite-core 变更' },
  { value: 'rxdb-adapter-sqlite-wasm',    name: 'rxdb-adapter-sqlite-wasm:       rxdb-adapter-sqlite-wasm 变更' },
  { value: 'rxdb-adapter-sqliteai',       name: 'rxdb-adapter-sqliteai:          rxdb-adapter-sqliteai 变更' },
  { value: 'rxdb-adapter-supabase',       name: 'rxdb-adapter-supabase:          rxdb-adapter-supabase 变更' },
  { value: 'rxdb-adapter-tauri',          name: 'rxdb-adapter-tauri:             rxdb-adapter-tauri 变更' },
  { value: 'rxdb-adapter-wa-sqlite',      name: 'rxdb-adapter-wa-sqlite:         rxdb-adapter-wa-sqlite 变更' },
  { value: 'rxdb-plugin-graph',           name: 'rxdb-plugin-graph:              rxdb-plugin-graph 变更' },
  { value: 'rxdb-plugin-search',          name: 'rxdb-plugin-search:             rxdb-plugin-search 变更' },
  { value: 'rxdb-plugin-storage',         name: 'rxdb-plugin-storage:            rxdb-plugin-storage 变更' },
  { value: 'rxdb-plugin-workspace',       name: 'rxdb-plugin-workspace:          rxdb-plugin-workspace 变更' },
];

// 根据 `git status` 推测当前改动的包作为默认 scope：
//   git status --porcelain 一行列如 `M  packages/rxdb/src/foo.ts`，
//   从中抽出 `packages` 后面的包名（限定 \w|-，避免掉进深层路径）。
// 没改 packages/ 时保持 undefined，由 commitizen 走手动选择。
const scopeComplete = execSync('git status --porcelain || true')
  .toString()
  .trim()
  .split('\n')
  .find(statusLine => statusLine.indexOf('M  packages') !== -1)
  ?.replace(/\//g, '%%')
  ?.match(/packages%%((\w|-)*)/)?.[1];

export default {
  /** @usage `pnpm commit :f` */
  alias: {
    f: 'docs(core): fix typos',
    b: 'chore(repo): bump dependencies'
  },
  messages: {
    type: '选择您要提交的更改类型：',
    scope: '\n更改的范围：',
    customScope: '提交的范围：',
    subject: '简短的代码描述：\n',
    body: '详细的代码描述，使用 "|" 符号换行：\n',
    breaking: '不兼容的描述：\n',
    footer: '关闭的问题（例如："fix #123", "re #123".）\n',
    confirmCommit: '你确认要这样提交吗？'
  },
  scopes,
  defaultScope: scopeComplete,
  scopesSearchValue: true,
  maxSubjectLength: 100,
  allowCustomScopes: false,
  allowEmptyScopes: false,
  allowCustomIssuePrefix: false,
  allowEmptyIssuePrefix: false,
  types: [
    { value: 'feat', name: 'feat:     ✨ 新功能' },
    { value: 'fix', name: 'fix:      🐛 修复错误' },
    { value: 'docs', name: 'docs:     📖 修改文档' },
    {
      value: 'cleanup',
      name: 'cleanup:  🧹代码清理 (不是 feat，不是 fix，且是 "src" 内的源代码更改)'
    },
    {
      value: 'chore',
      name: 'chore:    🔨杂活 (其他非 "src" 更改)'
    }
  ]
};
