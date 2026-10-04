# 2026-10-04 依赖兼容升级记录

## 结论

兼容升级已安装并写入锁文件，但**不能标记为“所有依赖已升到最新版且全量安全验收通过”**。本轮修改 24 个 npm 清单中 87 个外部依赖名称对应的声明，覆盖主工作区、网站、benchmarks 与独立 Angular 示例；另升级两个 Tauri Rust 工程的框架版本及 Cargo 锁文件。

未提交、未发布。没有修改业务实现、放宽测试阈值、删除失败测试或忽略安全审计。

执行期间另有任务持续修改评审测试与证据文件；这些改动原样保留，未纳入本轮依赖升级的业务补丁。

## 最终版本

| 依赖组                                            | 最终状态                                          |
| ------------------------------------------------- | ------------------------------------------------- |
| Angular runtime / compiler / CLI / build / devkit | 主工作区统一 22.2.1                               |
| ng-packagr                                        | 22.2.4                                            |
| React / React DOM                                 | 19.3.0；小程序继续 React 18                       |
| Vite                                              | 主工作区 8.3.2；Taro 专用 Vite 6 隔离保留         |
| Playwright                                        | 1.63.0                                            |
| Electron                                          | 44.5.1，已安装本机运行时并验证打包产物            |
| pnpm                                              | 10.34.6，主仓库与独立示例一致                     |
| Tauri JS API / CLI / Rust core / Rust runtime     | 2.12.1；tauri-build 2.7.1                         |
| Vue / Nx                                          | 保留 3.5.43 / 23.2.1                              |
| TypeScript / Vitest                               | 保留 6.0.3 / 4.1.11                               |
| Lucide Angular                                    | 精确 1.47.0，并通过全局 override 统一实际解析版本 |

Angular 与 CLI 通过 Nx 官方迁移流程更新，未产生新的待执行迁移，原有迁移记录保留。Angular 可发布包的 peer 范围由精确 22.1.6 放宽为 `^22.1.6`，没有抬高原有最低版本要求。

独立示例保留 Angular 21 与 TypeScript 5.9 的兼容线，更新至各自兼容补丁版本；没有强行升级其已发布的 `@aiao/*` 消费依赖。

## 捕获并处理的兼容问题

1. **Tauri Rust 核心与 runtime 不匹配**：仅刷新 Cargo 锁文件时，2.11.2 核心与新 runtime 出现上游类型错误。改为整套对齐 2.12.1 后，check / clippy / test 全部通过；没有修改 Rust 业务实现。
2. **Lucide Angular 多版本 AOT 符号冲突**：仅回退根依赖不能消除 workspace peer 自动安装的其他版本。精确锁定并全局统一 1.47.0 后，Angular 生产构建和网站构建通过。
3. **Electron 本机二进制缺失**：普通 rebuild 未安装运行时。执行包提供的 `install-electron --no` 后，44.5.1 二进制、未签名本地打包与真实桌面 E2E 通过。
4. **Nx 已有引用不同步**：通过 `nx sync` 补齐 SQLite adapter 对 tree 插件的项目引用，最终 sync check 通过。没有给构建脚本加入跳过同步的 fallback。

## 安全审计

| 等级     | 升级前 | 最终 |
| -------- | -----: | ---: |
| critical |      3 |    2 |
| high     |     21 |    5 |
| moderate |     17 |    5 |
| low      |      2 |    0 |
| 总计     |     43 |   12 |

通过按版本线限定的 override 修复 axios、image-size、fast-uri、DOMPurify，以及 brace-expansion 的 1 / 2 / 5 版本线；既有 serialize-javascript 等 override 也同步更新。没有把旧主版本依赖强行替换为不兼容的新主版本。

剩余 2 条 critical 均指向 Taro CLI 依赖链中的 `decompress@4.2.1`，当前审计将其标记为无修复版本。其他残留包括 got、git-clone、html-minifier、decode-uri-component、旧 faker、http-cache-semantics 与 braces。**审计并未清零，不能据此直接发版。**

`wa-sqlite` 的固定 Git commit、SHA-512 校验与 `@subframe7536/sqlite-wasm@1.3.1` 的 glue/wasm 完整性约束保留。后者统一为精确版本，防止不同 workspace 成员自行漂移。

## 暂缓项

- TypeScript 7：当前 Angular compiler-cli 的声明要求 TypeScript `>=6.0 <6.1`；保留 6.0.3 本地补丁。
- Vitest 5、Babel 8、VueUse 15、PWA/CRX 插件及其他跨主版本更新：未强推，需单独迁移与验证。
- Taro 4.3：4.2.1 runner 有本地补丁，且小程序使用独立 React 18 / Vite 6 工具链，保留这一组合。
- SQLiteAI 多组件版本、wa-sqlite commit 与 Subframe WASM：保留审核过的固定组合。
- Rust git-stats：全量 `cargo update` 因 gix 0.86 的 bisync 0.3 依赖已撤回而失败；仅更新 rayon / colored 的兼容尝试没有新版本变化，原锁文件保留，未跨 gix 的 0.x 次版本。
- 未在本机验证 Windows / Linux 桌面产物；本轮原生验证平台为 macOS ARM64。

## 验证结果

| 检查                                       | 结果                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| 主仓库与独立示例冻结锁安装                 | 通过，使用 CI 模式与离线缓存验证                                                |
| 修改的 npm 清单 Prettier / diff 空白检查   | 通过                                                                            |
| Nx sync check                              | 通过                                                                            |
| WASM 供应链完整性检查                      | 通过                                                                            |
| Tauri 两个 Rust 工程 check / clippy / test | 通过，210 个测试；另有 1 个上游已有忽略的文档示例                               |
| Angular 生产构建                           | 通过，仍有 bundle budget 警告                                                   |
| 网站构建                                   | 通过，未调高预算或屏蔽文档警告                                                  |
| benchmarks 校验与构建                      | 通过                                                                            |
| 独立 Angular 示例构建 / 单测               | 通过，2 个单测；仍有预算及 CommonJS 警告                                        |
| Angular E2E                                | 147 通过                                                                        |
| Electron 未签名本地打包 / E2E              | 打包通过；56 通过、4 个套件原有跳过                                             |
| React E2E                                  | 原依赖和升级后均为 141 通过、同一项失败                                         |
| sync / querycache 复跑                     | 原依赖与新依赖完整套件均通过；初次全门禁失败未稳定复现                          |
| 全量门禁                                   | 未全绿；初次执行 280 个任务，后续修复并复测兼容问题，但没有将初次结果改写为成功 |

冻结锁安装的 CI 模式会按仓库现有逻辑跳过 postinstall 预构建；实际库、应用、网站与桌面打包另外通过 Nx 执行验证，并非只验证清单可以安装。

### 核心包覆盖率

| 包           |  lines | statements | functions | branches |
| ------------ | -----: | ---------: | --------: | -------: |
| rxdb         | 95.84% |     95.24% |    94.90% |   92.73% |
| rxdb-angular |   100% |     98.87% |    99.05% |   97.02% |
| rxdb-react   |   100% |     99.35% |    98.93% |   96.29% |
| rxdb-vue     | 98.78% |     98.60% |    99.00% |   93.28% |

四项指标均超过核心包 90% 门槛，**但覆盖率达标不代表测试全绿**：rxdb 原有 3 个评审测试仍失败。

### 既有失败的隔离对照

使用原提交清单、原锁文件与离线依赖创建隔离副本，复测匹配的失败文件；扩展后台使用执行期间相同的评审测试副本。已复现 core、utils、storage、workspace、devtools、Vue search、SQLite core 及多个 backend 的对应评审失败。

React 原依赖与升级后失败均为 `review-opfs-navigation.spec.ts:74` 的目录切换期间上传测试。没有为了让门禁变绿而修改上传行为或测试断言。

Electron 备份内存测试的原依赖对照在 4 分钟时限内未结束，保留为未完全归因的性能验证问题；并未修改阈值。执行期间新增/修改的其他评审测试也没有被冒认成“升级前已全部复现”。

## 证据

机器可读摘要（依赖声明差异、最终版本、审计、覆盖率、隔离对照结果）：

`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-04/dependency-upgrade/summary.json`

本机完整命令日志：

`/Users/jimmy/Documents/aiao/rxdb/tmp/dependency-upgrade/`

下一步应先收敛正在进行的业务评审改动并修复既有失败，再重跑完整门禁与跨平台 CI；不能把本记录当作全量安全发版批准。
