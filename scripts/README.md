# scripts/ 工具索引

本目录是仓库的 **运维 / 工具层**，所有 `.mjs` 都是用 Node ESM 写的一次性脚本，
通常被 `package.json` 的 npm scripts、husky 钩子、CI 流程或开发者本人在终端手动调用。
它们不在 Nx 图谱里，也不会被打进任何包产物。

阅读顺序建议：先看 [§1 一览表](#1-一览表) 找到目标脚本，再跳到对应小节看使用细节。

本目录下的 `*.spec.mjs` 由 `pnpm test-scripts`（= `node --test "scripts/**/*.spec.mjs"`）统一跑，
CI 的 `setup` job 每轮都会执行。表格里各 spec 那一行写的 `node --test <单个文件>` 是本地调试用的窄入口。
新增 spec 只要放在 `scripts/` 下并以 `.spec.mjs` 结尾就会被自动纳入，不需要改 workflow。

---

## 1. 一览表

| 脚本                                                                        | 触发场景                                     | 一句话用途                                                                      | npm script / 调用方式                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [audit/wa-sqlite-integrity.mjs](#auditwa-sqlite-integritymjs)               | `pnpm install` 钩子 / `pnpm audit:wa-sqlite` | 校验 `wa-sqlite` 不可变 tarball + SHA-512 完整性                                | `preinstall` 首段 + `audit:wa-sqlite`                                         |
| [preinstall.mjs](#preinstallmjs)                                            | `pnpm install` 钩子                          | 检查 Node ≥ 26 / pnpm ≥ 10，清理冲突子包                                        | `preinstall` 末段                                                             |
| [check-workspace.mjs](#check-workspacemjs)                                  | `pnpm install` 后                            | 复制 `.env.example` → `.env`，预构建依赖库                                      | `postinstall` → `check-workspace`                                             |
| [clean.mjs](#cleanmjs)                                                      | 想彻底清盘                                   | 递归删除 `dist` / `tmp` / `coverage` / 构建产物                                 | `pnpm clean`                                                                  |
| [commitizen.mjs](#commitizenmjs)                                            | 交互式写 commit                              | 定义 cz-gui 的 scope/type 选项                                                  | `pnpm commit`（czg）                                                          |
| [commit-lint.mjs](#commit-lintmjs)                                          | `pre-commit` / `pre-push` / main 分支        | 校验最新 commit 是否符合 `<type>(<scope>): subject`                             | `pre-commit` / `pre-push` / `pnpm check-commit`                               |
| [check-doc-code.mjs](#check-doc-codemjs)                                    | 改 `website/docs/**` 后                      | 抽取文档代码块里的 `@aiao/*` import，验证指向真实包                             | `node scripts/check-doc-code.mjs [--strict]`                                  |
| [check-externals.mjs](#check-externalsmjs)                                  | 新增/删除包依赖后                            | 检查 `vite.config.mts` 的 `external` 是否覆盖 `dependencies + peerDependencies` | `node scripts/check-externals.mjs`                                            |
| [check-migration-release-gate.mjs](#check-migration-release-gatemjs)        | 发 bridge / migration release 前             | 校验 `requirements/migration-release.json` 字段语义                             | `pnpm check-migration-release-gate` / `check-migration-release-gate.spec.mjs` |
| [git-stats.mjs](#git-statsmjs)                                              | 统计代码归属                                 | 跑 `git blame` 汇总各项目 / 作者的代码 / 测试 / 注释 / 文档行数                 | `node scripts/git-stats.mjs`                                                  |
| [git-stats-worker.mjs](#git-stats-workermjs)                                | 同上                                         | 真正的 worker：解析 `git blame --line-porcelain` 并累加统计                     | 由 `git-stats.mjs` 通过 `worker_threads` 拉起                                 |
| [git-stats-worker.test.mjs](#git-stats-worker-testmjs)                      | 改 worker 后                                 | Node test runner，覆盖 blame 解析逻辑                                           | `node --test scripts/git-stats-worker.test.mjs`                               |
| [git-stats-rs/](#git-stats-rs)                                              | 大仓库统计太慢                               | Rust 版 git-stats，Rayon 并发 `git blame`                                       | `cargo run --release --manifest-path scripts/git-stats-rs/Cargo.toml`         |
| [coverage-serve.mjs](#coverage-servemjs)                                    | 本地查覆盖率                                 | 起一个静态 HTTP 服务，把 Istanbul HTML 报告渲染出来                             | `pnpm coverage:serve`                                                         |
| [e2e-static-server.mjs](#e2e-static-servermjs)                              | Playwright webServer                         | 直接 `node` 起 SPA 静态服务，避免 nx file-server 残留孤儿进程占端口             | `node scripts/e2e-static-server.mjs --root <dir> --port <n>`                  |
| `e2e-static-server.spec.mjs`                                                | 改静态服务后                                 | Node test runner，覆盖缺 root / 端口占用 / SPA fallback / 路径穿越              | `node --test scripts/e2e-static-server.spec.mjs`                              |
| [merge-vitest-reports.mjs](#merge-vitest-reportsmjs)                        | browser 覆盖跑完                             | 把 Node 与 browser 的 Istanbul JSON + JUnit testsuite 合并到唯一门禁目录        | `rxdb-plugin-search:test-browser`                                             |
| [merge-vitest-reports.spec.mjs](#merge-vitest-reports-specmjs)              | 改 merger 后                                 | Node test runner，覆盖 coverage union + JUnit 计数累加                          | `node --test scripts/merge-vitest-reports.spec.mjs`                           |
| [test-all-log.mjs](#test-all-logmjs)                                        | 跑 `test-all` 想留档                         | 包一层 Nx affected，跑后写结构化报告（耗时/缓存/失败/跳过）到日志               | `pnpm test-all:log`                                                           |
| [test-all-log.spec.mjs](#test-all-log-specmjs)                              | 改 test-all-log 后                           | Node test runner，覆盖 `formatNxLog` / `parseNxLog` / `renderReport`            | `node --test scripts/test-all-log.spec.mjs`                                   |
| [ci/plan-test-lanes.mjs](#ciplan-test-lanesmjs)                             | CI `setup` job                               | 按实测耗时把 test 项目 LPT 装箱成并行 lane，输出 `strategy.matrix` JSON         | `node scripts/ci/plan-test-lanes.mjs --projects=a,b,c`                        |
| [ci/plan-test-lanes.spec.mjs](#ciplan-test-lanesspecmjs)                    | 改分桶算法后                                 | Node test runner，覆盖不丢不重 / 可复现 / Supabase 独立 lane / 新包告警         | `node --test scripts/ci/plan-test-lanes.spec.mjs`                             |
| [runner.mjs](#runnermjs)                                                    | 内部依赖                                     | `spawn` 封装：彩色错误打印、参数透传                                            | `import { run } from './runner.mjs'`                                          |
| [workspace.mjs](#workspacemjs)                                              | 内部依赖                                     | 共享常量：NPM scope、需预构建的库名、需校验的分支                               | `import { NPM_SCOPE, NEED_BUILDS } from './workspace.mjs'`                    |
| [audit/api-surface.mjs](#auditapi-surfacemjs)                               | PR 改动公共 API                              | 对比基线，捕捉公开包导出符号的增删/种类变化                                     | `pnpm audit:api-surface` / `:update`                                          |
| [audit/package-api-docs.mjs](#auditpackage-apidocsmjs)                      | 受保护包的 build                             | TS 编译器检查根 export；`--members` 递归检查公开成员                            | storage / encrypted / sqlite / sqliteai `:build`                              |
| `audit/package-api-docs.spec.mjs`                                           | 改公开 API 文档门禁后                        | pass/fail fixture 验证成员路径、非零退出及排除规则                              | `node --test scripts/audit/package-api-docs.spec.mjs`                         |
| [audit/package-runtime-conditions.mjs](#auditpackage-runtime-conditionsmjs) | 改包 `exports` 后                            | 静态扫 `packages/*/package.json`，揪出指向源码的非可执行 export condition       | `pnpm audit:conditions`                                                       |
| [audit/wa-sqlite-integrity.mjs](#auditwa-sqlite-integritymjs)               | 同上 / `preinstall`                          | 锁仓库 `wa-sqlite` 到固定 commit + SHA-512，并校验小程序 vendored WASM/CJS 资产 | `preinstall` / `audit:wa-sqlite`                                              |
| [audit/coverage-check.mjs](#auditcoverage-checkmjs)                         | CI 门禁                                      | 聚合 `coverage-summary.json`，按核心 90% / 其余 80% 卡线                        | `pnpm audit:coverage` / `:update`                                             |
| [audit/coverage-baseline.json](#auditcoverage-baselinejson)                 | 上次 `:update` 写入                          | 覆盖率历史趋势快照                                                              | 由 `coverage-check.mjs --update` 维护                                         |

---

## 2. 安装与启动阶段

`pnpm install` 时会按顺序跑三道关：

```text
audit/wa-sqlite-integrity.mjs    →  锁文件 + 多仓库 manifest 的供应链一致性（硬失败）
preinstall.mjs                   →  包管理器 / 运行时版本 + Angular 子包清理
check-workspace.mjs              →  .env 初始化 + rxdb-test 预构建（postinstall 钩子）
```

### `audit/wa-sqlite-integrity.mjs`

- **触发**：`package.json#preinstall` 第一段（包管理器解析前硬失败）；也可手动 `pnpm audit:wa-sqlite`。CI 上同样会跑（无 CI 跳过逻辑）。
- **做什么**：
  1. 读 `package.json / benchmarks/package.json / examples/angular-todo/package.json / packages/rxdb-adapter-wa-sqlite/package.json / packages/rxdb-adapter-miniprogram/package.json`，断言 `dependencies.wa-sqlite` 都锁定到 `https://codeload.github.com/rhashimoto/wa-sqlite/tar.gz/2bf1c59d89eb6497535a4217bc62fec68a0bb994`；
  2. 解析 `pnpm-lock.yaml` 中 `wa-sqlite@<url>` 段，断言 `tarball / integrity` 字段与上面的固定值一致，并扫掉任何 `codeload.github.com/.../refs/tags/`（即可变 tag URL）形态的残留；
  3. 对 `packages/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs` 和 `.wasm` 校验固定 SHA-256；
  4. 传 `--archive <path-to-tgz>` 时，对下载的本地 tarball 再算一次 `sha512-<base64>`，与上面硬编码的完整性指纹对齐。
- **何时手动跑**：升级 `wa-sqlite` 后想确认全仓 manifest 与 lockfile 一致；怀疑本地 tarball 被中间人替换；CI 上 `wa-sqlite supply-chain pin OK` 失败时定位。

### `preinstall.mjs`

- **触发**：`package.json#preinstall` 末段，跑完上面 wa-sqlite integrity 之后；CI 上 `process.env.CI === 'true'` 时立即整体退出。
- **做什么**：
  1. 校验 `npm_config_user_agent` / `npm_execpath`：必须是 `pnpm`（npm/yarn/bun 一律拒绝）；
  2. 校验 `process.version` ≥ `26.0.0`，`pnpm --version` ≥ `10.0.0`；
  3. 强制清理 `packages/code-editor-angular` 和 `packages/rxdb-angular` 的 `node_modules`，避免这些 Angular 包在不同运行时间之间形成陈旧的 link。
- **何时手动跑**：本地装错包管理器 / 装了旧 pnpm 想看具体报错；或 angular 子包的 node_modules 出现幽灵依赖想重置。

### `check-workspace.mjs`

- **触发**：`postinstall`，CI 模式下跳过。
- **做什么**：
  1. 如果 `.env` 不存在但 `.env.example` 存在，自动复制一份；`docker/.env` 同理；
  2. 调用 `nx run-many --target=build --projects=rxdb-test --no-cloud` 预构建 `workspace.mjs#NEED_BUILDS` 列出的库（默认只有 `rxdb-test`）。
     子进程强制 `NX_DAEMON=false` / `NX_NO_CLOUD=true`。图损坏（陈旧 daemon / 隔离 worker 提前退出）时先 `nx reset` 再试一次。
- **何时手动跑**：clone 完仓库第一次 `pnpm install` 后；或 `.env` 文件被误删想恢复默认模板。

### `clean.mjs`

- **触发**：`pnpm clean`。
- **做什么**：`Promise.all` 并发删除 `dist / tmp / coverage / website/build / website/.docusaurus / benchmarks/dist / node_modules/.cache`。
- **何时手动跑**：CI 出诡异错误怀疑是陈旧产物；或磁盘爆了想回收。**会清空覆盖率结果**，先确认无未保存报告。

---

## 3. 提交流程

### `commitizen.mjs`

- **触发**：`pnpm commit` → 调起 `czg`。
- **做什么**：导出 commitizen 的 scope 列表（仓库里所有 `@aiao/*` 子包）、中文 prompt 文案、别名 `f` / `b`、自动从 `git status` 推断默认 scope。
- **何时手动跑**：改完后想交互式生成合规 commit。

### `commit-lint.mjs`

- **触发**：`husky#pre-commit` / `husky#pre-push` / `pnpm check-commit`。
- **做什么**：
  1. 本地路径（`commit-msg` 文件 / 无参）只在 `NEED_CHECK_BRANCHES`（= `workspace.mjs#NEED_CHECK_COMMIT_BRANCH_NAMES`，默认 `main`）上执行，其余分支直接放行；
  2. 读最新 commit（或 commit msg 文件）正则匹配 `type(scope)!?: subject`，类型来自 `commitizen.types`，scope 来自 `commitizen.scopes`，同时放行 `Revert` / `Release` / `wip`；
  3. 失败时把首行的不可见空白（空格/Tab/换行）用 `·` `→` `↵` 可视化输出，便于排查 CJK 输入法的隐形空格。
- **何时手动跑**：想在 push 前手动确认 commit 文案合规。

---

## 4. 文档与代码同步

### `check-doc-code.mjs`

- **触发**：改 `website/docs/**` 之后，PR CI 或本地预检。
- **做什么**：
  1. 扫描 `website/docs/**` 的 markdown/mdx 文件，抽出 `ts/tsx/js/jsx` 代码块；
  2. 在代码块里抓 `import ... from '@aiao/<x>'` / `from '@aiao/<x>'`，校验 `<x>` 必须存在于 `packages/<x>/package.json`；
  3. `--strict` 时多跑一步：对非 `@Component template` / `<script setup>` / 省略号片段的代码块，喂给 `ts.transpileModule` 试解析，能抓出文档里贴错的语法。
- **何时手动跑**：新增文档、写示例代码、怀疑文档里某个 import 指向已删除的包。

### `check-externals.mjs`

- **触发**：包依赖调整之后（例如新增 `peerDependencies`、删除一个 adapter）。
- **做什么**：遍历 `packages/`，对每个有 `dependencies` 或 `peerDependencies` 的包解析 `vite.config.mts` 的 `external` 数组（支持字符串 + `/^@aiao\//` 形式的正则），断言覆盖到所有依赖；ng-packagr 产物跳过。漏配则打印 issue 列表。
- **何时手动跑**：新加/移除包、升级依赖后想确认打包不会把第三方打进产物。

---

## 5. 同步与发布

### `check-migration-release-gate.mjs`

- **触发**：
  - `pnpm check-migration-release-gate`（手工发布前自行执行——**没有任何 CI 会自动跑它**）；
  - `pnpm test-scripts` → 连同其它脚本 spec 一起跑 `check-migration-release-gate.spec.mjs`，用 Node 自带 test runner 覆盖 `validateManifest` 的所有分支。
- **做什么**：纯函数 `validateManifest(manifest, options)` 校验 `requirements/migration-release.json`：
  - `$schemaVersion`、`release.kind`（normal / bridge / migration）、`release.version`（semver）、`protocolVersion`、schema/codec upgrade 布尔位；
  - `release.version` 必须同时等于发布 tag（去掉 `v`）与 `packages/rxdb/package.json` 的 `version`——两处任一漂移即 fail；
  - `normal` 与 `bridge` 都禁止升级系统 schema / change codec；`normal` 额外要求 `bridge.tag` / `bridge.version` 为 null（不进入 bridge 链）；
  - migration 必须有 `bridge.tag`、bridge 与 release 的协议兼容性、bridge tag 必须存在且是 release 的祖先；
  - `oldBundlePolicy` 不能用被淘汰的 `force-update / cache-invalidation / server-version / database-namespace` 策略；
  - 通过注入 `bridgeTagExists / bridgeTagIsAncestor / bridgeTagSupportsProtocol` 三个钩子和 `packageVersion`，纯函数可在测试里无网络跑通。
- **三种 kind 怎么选**：日常发布一律 `normal`；只有真正发布 writer lease/upgrade guard 协议的那一次写 `bridge`（它才能被后续 migration 引用为 `bridge.tag`）；带系统 schema 或 change codec 升级的写 `migration`。
- **清单何时改**：`release.version` 跟着 `packages/rxdb/package.json` 走，**在版本 bump 的同一个提交里更新**；`nx release` 不会替你改清单，漏改会被门禁拦下。
- **何时手动跑**：改了 `requirements/migration-release.json` 想确认字段没写歪；写 release 流程前 dry-run。

---

## 6. 代码统计

### `git-stats.mjs`

- **触发**：`node scripts/git-stats.mjs`，需要完整 git 历史。
- **做什么**：
  1. 扫描 `apps/ packages/ modules/ website/ benchmarks/ scripts/` 下被 Git 跟踪的文件；
  2. 按扩展名（`.js .mjs .jsx .ts .mts .tsx .rs .md .mdx .css .scss .html .sh Dockerfile .json .yml`）分类；
  3. 对每个文件并行 spawn 一个 `git-stats-worker.mjs`，跑 `git blame --line-porcelain`；
  4. 汇总两类结果：**项目维度**（apps/packages/modules/website/benchmarks/scripts）与 **作者维度**，每类拆出代码行 / 测试行（`.spec.*` / `.test.*`）/ 注释行 / 文档行 / 占比。
- **何时手动跑**：月度回顾、新成员 onboarding、对外宣传材料、年度报告。

### `git-stats-worker.mjs`

- **触发**：被 `git-stats.mjs` 通过 `node:worker_threads` 拉起（每个文件一个 worker）。
- **做什么**：解析 `git blame --line-porcelain` 输出，把 commit 作者归一化（`Jimmy Liu` → `Jimmy`），按文件类型 + 行内容累加到传入的 `stats` 对象。
- **何时手动跑**：永远不直接调用。改它的解析逻辑后跑 `git-stats-worker.test.mjs` 验证。

### `git-stats-worker.test.mjs`

- **触发**：`node --test scripts/git-stats-worker.test.mjs`。
- **做什么**：Node test runner，覆盖重复 commit 作者合并、`.spec.ts` 计入测试行、`.md` 计入 Markdown 行等行为。
- **何时手动跑**：改了 `git-stats-worker.mjs` 的解析规则。

### `git-stats-rs/`

- **触发**：`cargo run --release --manifest-path scripts/git-stats-rs/Cargo.toml`。需要最新稳定版 Rust（`rustup update stable`，`rustc` ≥ 1.88）。
- **做什么**：JS 版的 Rust 改写（`rayon` 并发 + `colored` 终端着色），保留**完全一致**的统计口径。详见 [`scripts/git-stats-rs/README.md`](./git-stats-rs/README.md)。支持 `GIT_STATS_CONCURRENCY` 环境变量控制 worker 数。
- **何时手动跑**：JS 版跑大仓库太慢，或想对比两侧结果保证语义没漂移。

---

## 7. E2E 静态服务

### `e2e-static-server.mjs`

- **触发**：`apps/dev-rxdb-angular-e2e` 的 Playwright `webServer.command`；也可手动
  `node scripts/e2e-static-server.mjs --root dist/apps/dev-rxdb-angular/browser --port 8200`。
- **做什么**：
  1. 用原生 `http` 服务指定目录，缺文件回退 `index.html`（SPA），不往 dist 里 copy `404.html`；
  2. 端口被占立刻 `EADDRINUSE`，**不** `detectPort` 换端口；
  3. 必须作为 Playwright 的直接 `node` 子进程启动。再套 `nx run …:serve-e2e` 会把真正监听端口的进程变成孙子，teardown 杀不掉，下次就报 “port already used”。
- **何时手动跑**：改了静态服务本身、或想在不启动 Playwright 的情况下确认某份 `dist/` 能被 SPA fallback 打开。

## 8. 覆盖率

### `coverage-serve.mjs`

- **触发**：`pnpm coverage:serve [pkg] [--port N]`。
- **做什么**：
  1. 起一个原生 `http` 服务，根目录指向仓库根的 `coverage/`；
  2. 默认监听 `:8765`，`/` 重定向到指定包或根目录 index；
  3. 主页展示一张按 packages/* 排序的指标表 + 全局聚合 statements / branches / functions / lines；
  4. 带正确 MIME 的静态文件服务（Istanbul 的多页报告在 `file://` 下渲染会坏，所以强制 localhost）。
- **何时手动跑**：本地跑完 `nx run-many -t test --coverage` 想在浏览器里点开结果。

### `audit/coverage-check.mjs`

- **触发**：
  - `pnpm audit:coverage`（默认 `--check`，CI 门禁）；
  - `pnpm audit:coverage:update`（把当前 summary 写入 baseline）；
  - 可叠加 `--projects=a,b,c`（Nx affected 模式，只评估指定包）。
- **做什么**：
  1. 探测各包候选路径下的 `coverage-summary.json`；
  2. 应用硬门槛：`rxdb` / `rxdb-angular` / `rxdb-react` / `rxdb-vue` 四个核心包 ≥ 90%，其余公开包 ≥ 80%（statements / branches / functions / lines 四指标），不达标直接 `process.exit(1)`；
  3. 达标的包若低于 `scripts/audit/coverage-baseline.json` 历史值，发 WARN（不阻塞），用于趋势告警；
  4. `--update` 模式：现值覆写 baseline（含下降），无 summary 或不在 `--projects` 内的包**保留旧记录**。
- **何时手动跑**：提 PR 前想确认没有新拖低覆盖率；每个 sprint 末更新 baseline 留档。

### `audit/coverage-baseline.json`

- **触发**：由 `coverage-check.mjs --update` 维护。
- **做什么**：每个包一段 `{ statements, branches, functions, lines }`，记录「上一次 CI 跑出的覆盖率」。
- **何时手动跑**：别手改。需要重新生成就跑 `pnpm audit:coverage:update`。

### `merge-vitest-reports.mjs`

- **触发**：`packages/rxdb-plugin-search:test-browser` target（`dependsOn: ['coverage']`），跑完浏览器 Chromium 套件之后调用。**也可作为 CLI**：`node scripts/merge-vitest-reports.mjs --node=path --browser=path --output=path`。
- **做什么**：
  1. `mergeCoverageDirectories(nodeDir, browserDir, outputDir)`：
     - 读两份 `coverage-final.json`（Istanbul v6 raw 形式），按文件路径取**并集** —— 同一文件两边都覆盖时 `s/f/b` 计数器累加；
     - 重算每文件的 `lines / statements / functions / branches` 百分比（`total === 0` 时按 100%）；
     - 输出合并后的 `coverage-final.json` + `coverage-summary.json` 到 `outputDir`，供 `audit/coverage-check` 当成单一门禁读；
  2. `mergeJunitFiles(nodeFile, browserFile, outputFile)`：
     - 解析两份 JUnit XML，按 `<testsuites>` 根属性累加 `tests / failures / errors / time`；
     - 两边的 `<testsuite>` 块原文追加到合并文件，避免 Nx 端 CI 报告只看到某一份。
- **何时手动跑**：CI 上 `coverage-summary.json` 显示覆盖率被另一份跑的产物覆写时；想离线把 Node + browser 的报告合并成一份。

### `merge-vitest-reports.spec.mjs`

- **触发**：`node --test scripts/merge-vitest-reports.spec.mjs`。
- **做什么**：Node 自带 test runner：在 `tmpdir/` 下铺两份 fake `coverage-final.json` + JUnit，跑 `mergeCoverageDirectories` / `mergeJunitFiles`，断言并集保留、`s`/`f`/`b` 累加、JUnit 属性累加 + testsuite 拼接。
- **何时手动跑**：改了 `merge-vitest-reports.mjs` 的合并语义。

### `test-all-log.mjs`

- **触发**：`pnpm test-all:log`（也是单独的 `node scripts/test-all-log.mjs`）。`test-all` 走的是 `nx affected -t ...` 的裸跑；`-log` 版只是包了一层，让结果**写盘 + 结构化总结**。
- **做什么**：
  1. `parseArgs(argv)` 解析一组开关：
     - `--targets=<a,b,...>` 限定 Nx target（默认 `lint,typecheck,test,test-browser,build,e2e`）；
     - `--style=stream|static|buffer`（Nx 输出样式，默认 `stream`）；
     - `--log=<path>` 自定义日志路径（默认 `./logs/test-all/YYYY-MM-DD/HHMMSS.log`）；
     - `--parallel=<n>`、`--max-line=<n>`（日志单行字节上限）、`--no-bail`、`--all`、`--dry-run`、`-v`、`--` 后透传额外 nx 参数（如 `-- --base=develop`）。
  2. `buildNxArgs` 拼出 `pnpm exec nx affected -t <targets> --output-style=<style> --skipRemoteCache --parallel=<n> [--nxBail] [--untracked|--uncommitted|--base=main]`；用 `git status --porcelain` 选默认 base flag（有 `??` 用 `--untracked`，否则有改动用 `--uncommitted`，干净用 `--base=main`）。
  3. `runNx`：
     - 同时 `stdout` 透传到终端 + 写到 `logPath` 流；
     - 收尾后 `formatNxLog` 清掉 ANSI / `\r`、压缩连续空行、超过 `--max-line` 截成 `前 75% ... 省略 N 字符 ... 后 20%`；
     - `parseNxLog` 抽 `Cache: N/M (P%)` / `Run duration` / `Failed tasks:` / `Tasks not run` / `NX Nx detected K flaky tasks` / Playwright 的 `Error Context:` / `trace.zip`；失败任务再 `findFailureDetails` 反查首个错误行 + 测试名 + 源码位置；
     - `renderReport` 输出 `测试结果 / 任务统计 / 失败任务 / 不稳定任务 / Nx 详细输出` 四段结构化报告，**直接写回** `logPath`，覆盖原始 Nx 输出。
  4. `renderConsoleSummary` 在终端打印一行彩色的 `通过/失败 + 失败列表`，便于一眼判断。
- **何时手动跑**：长跑 `test-all` 时需要事后回溯失败栈；CI 上 `pnpm test-all` 失败或输出被截断时，重跑 `-log` 版拿到结构化报告。

### `test-all-log.spec.mjs`

- **触发**：`node --test scripts/test-all-log.spec.mjs`。
- **做什么**：Node 自带 test runner，覆盖 `parseArgs`（参数校验 / 边界）、`formatNxLog`（ANSI 剥离 + `\r` 合并 + 空行压缩 + 超长截断）、`parseNxLog`（scheduled / succeeded / cached / failed / skipped / flaky / 缓存百分比 / Nx 时长 / Playwright trace）、`renderReport`（失败任务 / 不稳定任务两段的字段排版）。
- **何时手动跑**：改了 `test-all-log.mjs` 的解析或报告样式。

### `ci/plan-test-lanes.mjs`

- **触发**：`.github/workflows/ci-template.yml` 的 `setup` job；本地调试用
  `node scripts/ci/plan-test-lanes.mjs --projects=a,b,c [--lanes=4]`。
- **做什么**：把「本次要跑 `test` 的项目」按实测耗时做 LPT 装箱，分到若干条 CI lane
  （一条 lane = 一个并行 GitHub job），输出可直接喂给 `strategy.matrix` 的 JSON。
  需要本地 Supabase 栈的项目（`SUPABASE_PROJECTS`）钉在独立 lane —— 起一次 Supabase 约 60s，
  散在多条 lane 上就要交多次这笔税。
- **`lane` 与 `label` 是两个字段，别合并**：`lane`（`t1`…/`supabase`）是机器用的稳定 id，
  进 artifact 名 `coverage-lane-<lane>`，必须文件名安全；`label`（`rxdb-adapter-pglite +8`）
  只进 job 名 `test (<label>)`，报出这条 lane 最重的项目 + 还有几个 —— `test (t1)` 在 PR 的
  checks 列表里等于没说，红了得点进去才知道是哪个包。两者的映射打进 `setup` 的 job summary。
- **为什么不在 workflow 里写死项目名**：写死的清单会在新增包时静默漏测。这里从
  `nx show projects` 的实际输出分桶，权重表里没有的新包按 60s 估算并**打印告警**。
- **改它要同步改什么**：`WEIGHTS` 是 CI 冷跑（全部 Cache Miss）的实测秒数，只影响分桶是否均衡，
  不影响正确性；跑一轮 CI 后把偏差大的值补回来即可，**别拿本地耗时填**（本地 M 系列比 runner 快 3 倍）。
  `LANE_COUNT` 受 GitHub 免费额度的 20 并发 job 约束。
- **当前瓶颈**：`rxdb-adapter-pglite` 261s，是第二名（76s）的 3.4 倍，LPT 会单独给它一条 lane，
  其余三条各 ~174s。也就是说 test 阶段的下界就是它一个包 —— 想再压只能拆它自己的用例，加 lane 没用。

### `ci/plan-test-lanes.spec.mjs`

- **触发**：`node --test scripts/ci/plan-test-lanes.spec.mjs`。
- **做什么**：Node 自带 test runner，覆盖「不丢不重」「Supabase 项目独立成 lane」
  「重任务被拆散」「同输入同输出（matrix 必须可复现）」「输入顺序无关」「lane 名唯一」
  「未登记权重的新包照常调度且必须告警」「`label` 报出最重项目 +N 且唯一」。
- **何时手动跑**：改了装箱算法、lane 数、Supabase 项目清单或 lane 展示名。

---

## 9. API 表面

### `audit/api-surface.mjs`

- **触发**：
  - `pnpm audit:api-surface`（默认 `--check`，PR 必跑）；
  - `pnpm audit:api-surface:update`（更新 `requirements/api-baseline/*.json`）。
- **做什么**：
  1. 遍历 `packages/`，跳过 `private === true` 或没有 `src/index.ts` 的包（默认排除 `rxdb-test`）；
  2. 用 TypeScript 编译器解析每个入口的真实可见导出（展开 `export *` / re-export），得到 `{ name, kind: 'type' | 'value' | 'both' }[]`；
  3. 对比 `requirements/api-baseline/<pkg>.json`：
     - **removed / kind changed** → 退出码非 0，PR 必须附带迁移说明；
     - **added only** → 仅打印警告，提示跑 `:update` 落基线；
     - **完全一致** → 通过。
  4. 路径用 `tsconfig.base.json` 的 `paths` 解析，不依赖 `node_modules`，本地与 CI 结果一致。
- **何时手动跑**：新增/删除/重命名一个公开导出、调整类型/值性质（type-only ↔ value）、合并 PR 前最后一次本地校验。

### `audit/package-api-docs.mjs`

- **触发**：被 `rxdb-plugin-storage` / `rxdb-adapter-desktop` / `rxdb-adapter-encrypted` / `rxdb-adapter-sqlite` / `rxdb-adapter-sqliteai` 的 `build` target 串在 `vite build` 之后（共 5 个包，原文漏了 desktop）。历史 adapter 保持根导出检查；storage 使用 `node ../../scripts/audit/package-api-docs.mjs . --members` 开启成员门禁。
- **做什么**：
  1. 取目标包根目录作为 CLI 第一个参数（默认 `.`），从 `src/index.ts` 起 TypeScript program；
  2. 用 `checker.getExportsOfModule()` 拿到入口的全部可见 symbol，过滤出**声明就在本包源码里**的那些（避免将 `Type` 节点归到 `@types/*`/`node_modules/*` 而误判）；
  3. 默认继续检查根 symbol 的 TSDoc；传 `--members` 后，额外递归检查本包公开 class / interface / type alias 的直接公开成员和内联 object type；
  4. 成员必须有自己的 TSDoc，不能借用容器注释；输出使用 `Root.member.nestedMember` 完整路径；
  5. 只读声明 AST，不展开 `extends`，并跳过 `private` / `protected` / `#private`，因此不会把外部依赖的继承成员算进本包；
  6. 任一缺失都以非零状态退出。`package-api-docs.spec.mjs` 的故意缺成员 fixture 固定验证失败路径，pass fixture 固定验证私有成员和外部基类不会误报。
- **何时手动跑**：新增 / 重命名 export 后忘了写 TSDoc；storage 新增公开 option / method / field 后运行 `node scripts/audit/package-api-docs.mjs packages/rxdb-plugin-storage --members`；改扫描规则后运行 `node --test scripts/audit/package-api-docs.spec.mjs`。

### `audit/package-runtime-conditions.mjs`

- **触发**：`pnpm audit:conditions`；CI 在 `ci-template.yml` 的 `setup` job 里作为**阻塞门禁**跑。
  （脚本名不能占用 `audit` —— `pnpm audit` 是 pnpm 的内置漏洞扫描命令，会把同名 npm script 遮蔽掉。）
- **做什么**：遍历 `packages/*/package.json` 的 `exports`，找出指向 `.ts` 等**非可执行**文件的
  condition。这类 condition 在 workspace 里靠 tsconfig paths 能解析，装进用户项目后就是死链。
- **白名单**：`BUILD_TIME_CONDITIONS = { types, @aiao/source }`。
  `@aiao/source` 从来不由 Node 在运行时解析——它只被三处构建期消费方读取：
  `tsconfig.base.json` 的 `customConditions`、`audit/api-surface.mjs`、各 vite config 的
  `resolve.conditions`。所以它指向 `.ts` 是**设计如此**，与 `types` 指向 `.d.ts` 同性质。
  豁免按 **condition 名**判定，不是按包或路径：同一个 `exports` 里若有
  `default: './src/x.ts'`，照样报错。`package-runtime-conditions.spec.mjs` 固定住了这条边界。
- **何时手动跑**：给某个包加/改 `exports`（尤其是新增自定义 condition）之后。

## 10. 内部依赖（不可直接执行）

这些不是工具脚本，而是被其他脚本 `import` 的小工具。

### `runner.mjs`

- **做什么**：`run(command, args, collect?, extra?)` 包装 `child_process.spawn`，统一 `stdio: 'inherit'`、非零退出码打印红字并 `reject(Error)`。`collect=true` 时把 stdout 拼成字符串 resolve 出去。`extra.env` 与 `process.env` 合并。
- **调用方**：`check-workspace.mjs` 等需要跨进程串行的脚本。

### `workspace.mjs`

- **做什么**：导出 3 个共享常量：
  - `NPM_SCOPE = 'aiao'`；
  - `NEED_BUILDS = ['rxdb-test']`（`check-workspace` 在 install 后预构建哪些库）；
  - `NEED_CHECK_COMMIT_BRANCH_NAMES = ['main']`（`commit-lint` 在哪些分支强制校验）。
- **调用方**：`check-workspace.mjs`、`commit-lint.mjs` 等需要跨文件共享配置的脚本。

---

## 11. 通用调用约定

- 所有脚本统一用 **Node ESM**（`import ... from`，无构建产物），最低 Node 26（由 `preinstall.mjs` 强制）；
- 工作目录默认是仓库根（用 `process.cwd()` 或 `import.meta.dirname` 解析相对路径），所以从根目录直接 `node scripts/<x>.mjs` 即可；
- 错误约定：
  - **硬失败（阻断 PR）**：`audit/wa-sqlite-integrity` 锁漂移、`check-doc-code` import 无效、`check-externals` 漏配、`check-migration-release-gate` 字段错、`audit/coverage-check` 低于阈值、`audit/api-surface` removed/kind changed、`audit/package-api-docs` 缺 TSDoc；
  - **软警告**（仅打印）：`audit/coverage-check` 低于历史 baseline、`audit/api-surface` 仅新增；
  - **覆盖率基线更新**总是覆写（含下降），无需显式 `--force`，防止漏声明的「基线外降」被悄悄吞掉；
- 没在 `package.json` 注册为 npm script 的脚本（`check-doc-code`、`check-externals`、`git-stats*`、`push-docs`）通常是临时排查用，懒得加命令。

---

## 12. 给新成员的一段话

如果你只是想 **跑起来**仓库，路径只有一条：

```sh
pnpm install          # 触发 preinstall（wa-sqlite integrity + 版本校验）+ check-workspace
pnpm test-packages    # 跑 packages/* 的 lint/typecheck/test/build/e2e
```

如果你想 **提交**，按 `pnpm commit` 走 czg 交互式流程，husky 会在 `pre-commit` / `pre-push` 自动过 `commit-lint.mjs`。

如果你要 **发版**，按顺序跑：

```sh
pnpm audit:coverage         # 先看 90/80 硬门槛过没过
pnpm audit:api-surface      # 再看导出表面有没有未声明变化
pnpm check-migration-release-gate   # 若动的是 bridge / migration manifest
pnpm audit:conditions       # packages/ 的 exports conditions 静态审计
pnpm audit:wa-sqlite        # 怀疑 wa-sqlite 供应链完整性时定位
```

如果你想 **留档或排查** 一次失败的全量跑：

```sh
pnpm test-all:log           # 写一份结构化报告到 ./logs/test-all/<时间戳>.log
pnpm coverage:serve         # 跑完覆盖率后浏览器开 :8765 看 Istanbul 报告
node scripts/git-stats.mjs  # 月度统计 / 年度对外材料
```

剩下的脚本按需翻本文件，不要凭印象 grep。
