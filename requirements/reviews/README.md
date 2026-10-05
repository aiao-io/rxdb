# AI Review 规则与记录

这个目录集中存放**给 AI 做代码 review 用的规则/检查清单**，以及尚未处理的问题报告。

## 目录结构

报告只留**尚未处理**的条目。复核确认已修、或判定不值得做的条目直接删除——修法与判据都写在代码注释里，报告再留一份副本只会与代码漂移。整份报告清空即删文件，删前在下方「清理记录」留一行。

| 路径                                | 说明                               | 剩余项                                                                                              |
| ----------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `README.md`                         | 本说明、状态约定与清理记录         | —                                                                                                   |
| `review.template.md`                | 新建 review 记录的模板             | —                                                                                                   |
| `RV-022-us-029-readiness-review.md` | US-029 RBAC 与租户隔离立项准入评审 | 2 P0 + 9 P1 + 8 P2；US-029 转价值待证并移出多租户，R04 复现后拆出 US-218（其准入评审又拆出 US-220） |

## 状态约定

见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)。

## 工作流

1. AI review 发现问题 → 从 `review.template.md` 复制出 `RV-XXX-描述.md`，`status: Open`
2. 开 PR 修复 → 在 `pr` 字段记录 PR 链接
3. PR 合并、修复完成 → 删除报告文件，在下方清理记录留一行（修法与判据留在代码注释与回归测试里）

## 命名规范

见 [../CONVENTIONS.md](../CONVENTIONS.md#命名规范)。`RV-XXX-描述.md`，编号 `RV-001` 起递增。
例外：整分支 / 整包评审报告结论一次性给出、没有 Open/Resolved 生命周期，不占用 RV 编号；它们的「状态」体现为文件里还剩几条。

## 清理记录

每条只记删了什么、结论是什么；修法细节在代码注释与回归测试里。删除前的完整记录（含逐条修法、执行台账、进度页与 `evidence/` 取证目录）可用 `git show aaf155a1:requirements/reviews/<路径>` 取回。

- **2026-10-06（评审计划清理）**：删除 `packages/`（51 份）、`apps/`（22 份）评审计划与 `results/` 下一一对应的 73 份评审记录；可用 `git show 43d50d27:requirements/reviews/<路径>` 取回。遗留事实：RV-072（Tauri 宿主）、RV-075（Electron 宿主）只有单元/接缝级回归，真实宿主上未复验。
- **2026-10-06（文档清理）**：删除整个 `evidence/`（取证文件）、全部执行台账（`execution-2026-10-0*.md`、`follow-up-2026-10-03.md`）、进度页（`progress-2026-10-05.md`、`packages-progress-2026-10-05.md`）、`deep-review-plan.md` 与已修复的 RV-058，并去掉保留文件里指向它们的链接；README 压缩为现行约定与本记录。唯一被测试引用的夹具（working-tree-angular 的 ngc 编译产物）不再需要——该包补上 analog 插件后组件由测试编译，夹具组件直接写回 spec。
- **2026-10-06（遗留问题修复）**：wa-sqlite `executeHelper` finalize 失败不再漏收后续句柄、不再顶替原始错误；Supabase 树查询把整数 id `0` 当真实节点（`!= null` 判据，与 sqlite-core/PGlite 一致）；working-tree-angular 补 analog 插件后 R2-07 `setInput` 用例转绿；replay-angular R3-03 销毁断言前等 Angular 自身的 RAF 赛跑收尾；search-angular/react/vue 改用 workspace `@aiao/rxdb`，不再解析到过期的 0.0.25；fractional-indexing 随机序列用例去掉每步 O(n) 过滤，负载下不再超时。RV-074 复核为误判（同批多类型事件本就只广播一帧），补守卫用例，源码不改。
- **2026-10-06**：RV-059～RV-065、RV-069～RV-079 共 18 份（1 P1 + 17 P2）逐条复核属实并修复，整份删除。
- **2026-10-05**：RV-066/067/068 由外部任务修复，复跑回归通过后删除。
- **2026-10-05**：US-218 Supabase RLS 推送完整性准入评审未落文件，结论回写故事（❌ 不可按原文进入开发）。
- **2026-10-05**：RV-045/046/050（树筛选歧义、过滤祖先的树增量漂移、图查询 NaN 深度）与 RV-058（取消首次解锁仍落盘废弃凭据）修复；RV-058 文件于 2026-10-06 随台账一并删除。
- **2026-10-05**：RV-052/053/054/055（Sync 与 QueryCache 回推、回滚、SWR、outbox 覆盖）修复删除。
- **2026-10-05**：RV-030/031（dev-rxdb-http-server 非法 request-target 崩溃与请求边界）修复删除。
- **2026-10-05**：RV-027/028/029/034（核心 JS / SQLite / PGlite 三后端查询语义）修复删除。
- **2026-10-04～10-05**：RV-032/033、RV-037～RV-042、RV-051、RV-056/057（启动批与各边界批次）修复删除。
- **2026-10-03**：RV-026（US-028 分支评审）6 条修复删除；RV-024 / RV-025（US-028 开发准入复评）未落文件，结论回写故事。
- **2026-10-02**：RV-021（US-027）、RV-022（US-028 立项）、RV-023（US-602）结论全部回写对应故事后删除（现存 `RV-022-us-029-readiness-review.md` 是另一份同号准入评审）。
- **2026-10-01**：RV-017（US-029）、RV-018（US-028）、RV-019（US-602）、RV-020（Epic-009 BOM）结论全部回写对应故事/Epic 后删除。
- **2026-09-27**：US-026 实例级同步覆盖、US-211 多端小程序宿主、US-211 宿主契约三份分支评审修复删除。
- **2026-09-26**：`review-vs-main-2026-09-25.md` 删除——P1「生产代码从不登记分支物化来源，`syncBranches()` 后首次 `switchBranch()` 恒抛」已修（来源契约移入核心 sync）；顺延的五项转入 [roadmap](../roadmap.md#epic-006-评审顺延的架构项)。
- **2026-09-25**：`review-vs-main-branch-review.md`（`b18def11..4926c162`）复核后删除。
- **2026-09-24**：`next-0912-branch-review.md` 与 `-max.md` 全部收口删除。
- **2026-09-23**：RV-013/014（适配器分支方法去留）、RV-015（CLI 插件生成器的缝，判据「`rxdb-client-generator` 不再指向任何 `rxdb-plugin-*`」已满足）、`002-rxdb-model-port-branch-review.md`、`2026-09-18-rxdb-core-review.md`、`next-0915-branch-review.md` 收口删除。
- **2026-09-22**：RV-012（`RxDBBranch` 去树化）、RV-016（repository `mergeOperations`）删除。
- **2026-09-11 及更早**：`requirements-incomplete-stories-review.md`、`next-1123-branch-review.md`、`next-0831-branch-review.md`、`next-11-rxdb-adapter-tauri-review.md` 删除。
