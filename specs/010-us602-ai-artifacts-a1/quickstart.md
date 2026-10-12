# US-602 A1 验证记录

## 已通过的本地验证

验证日期：2026-10-11，分支 `codex/us602-a1`。

| 检查                                                                                                                           | 结果                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `pnpm nx run @aiao/source:test-scripts`                                                                                        | 414 项脚本测试通过；新增正反例只读 `scripts/audit/__fixtures__/`                        |
| `pnpm nx run-many --projects=@aiao/source -t lint-ai-artifacts test-scripts audit-api-surface audit-docs-plugins --parallel=1` | 4 个目标通过；文档插件扫描 168 个文件                                                   |
| `pnpm audit:package-graph`                                                                                                     | 51 个非 private 包登记、34 个 `v0.0.26` 发布范围包、9 个情景通过；生成物 `--check` 通过 |
| `pnpm verify:ai-example`                                                                                                       | 实际核心 `.tgz` 分文件声明、严格编译、PGlite memory CRUD、事务执行器和 disconnect 通过  |
| `pnpm nx run rxdb-adapter-pglite:test --coverage --coverage.reporter=text --coverage.reporter=json-summary`                    | statements 95.91%、branches 89.71%、functions 96.26%、lines 97.22%                      |
| 核心 `rxdb` 覆盖率                                                                                                             | statements 95.68%、branches 93.37%、functions 95.58%、lines 96.26%                      |
| `pnpm nx run website:typecheck`                                                                                                | 通过；补充了 Vite 8/Rolldown 类型别名兼容，运行时逻辑不变                               |

真实仓库临时副本的漏登记场景已通过顶层审计脚本验证：未改动输入通过，删除 `@aiao/utils` 登记后明确报告漏登记并返回非零。生成器同输入重复输出字节一致，手改生成物会被 `--check` 拒绝。

## 串行 affected 全量

最终命令（已通过）：

```sh
env -u RXDB_PGLITE_NODE_TEST -u RXDB_PGLITE_TEST_FILE NX_NO_CLOUD=true NX_DAEMON=false pnpm nx affected \
  -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e \
  --base=main --output-style=static --skipRemoteCache --parallel=1 --nxBail
```

首次执行在 `website:typecheck` 暴露了 Vite 8/Rolldown 的既有类型兼容错误；修复类型来源后，`dev-rxdb-vue-e2e:e2e` 首次复跑出现 2 个实体模型 UI 断言失败，单独重跑后 155/155 通过。最终使用 `NX_DAEMON=false` 执行同一条 affected 命令，返回 0，未产生 Failed tasks：81 个项目、16 个依赖任务，耗时 6 分 48 秒，306/333 个任务命中本地缓存。

## 评审修复后的验证（2026-10-12）

上表的 `lint-ai-artifacts` / `audit-api-surface` / `audit-docs-plugins` 与 `audit-requirements` 是 `@aiao/source` 上无调用方的重复 target，已删除：
前者改为根项目 `lint`（覆盖整个 `scripts/`，进 CI lint job），其余直接用对应的 `pnpm audit:*` 脚本。

| 检查                                                                                                    | 结果                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm test-scripts`                                                                                     | 424 项通过（不再缓存）                                                                           |
| `node --test scripts/*.test.mjs`（`website:test` 的命令）                                               | 43 项通过                                                                                        |
| `pnpm audit:package-graph`                                                                              | 51 包登记、事实源登记的 `v0.0.26` 下 34 包投递、9 个情景；生成物 `--check` 通过                  |
| `pnpm verify:ai-example`                                                                                | 核心 tgz 入口说明、两个事务重载一致、适配器覆写无 TSDoc、离线样例 CRUD 与事务执行器全部通过      |
| `pnpm nx run-many -t lint -p rxdb-adapter-pglite website @aiao/source`                                  | 通过                                                                                             |
| `pnpm audit:api-surface` / `audit:docs-plugins` / `audit:requirements` / `check-migration-release-gate` | 通过                                                                                             |
| 直接调用 `llms-txt` 插件的 `postBuild`（真实仓库、不依赖 git 标签）                                     | `llms.txt` 18,334 B、`llms-full.txt` 8,178,673 B；与改前输出相比只差措辞、宿主、备注与插件分隔符 |
