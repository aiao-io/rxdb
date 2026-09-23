# AI Review 规则与记录

这个目录集中存放**给 AI 做代码 review 用的规则/检查清单**，以及 review 过程中产出的结论记录。

## 用途

- **规则文件**：告诉 AI「review 时看什么、按什么标准判」的 md 文件
- **结论记录**：某次 review 发现的问题 + 根因 + 修复方案，修复后标记解决

## 目录结构

评审报告只留**尚未处理**的条目。复核确认已修、或判定不值得做的条目直接删除——修法与判据都写在代码注释里，报告再留一份副本只会与代码漂移。整份报告清空即删文件。

| 文件                                                | 说明                                                                                           | 剩余项                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| `README.md`                                         | 本说明与状态约定                                                                               | —                            |
| `review.template.md`                                | 新建 review 记录的模板                                                                         | —                            |
| `002-rxdb-model-port-branch-review.md`              | `002-rxdb-model-port` 相对 main 的实体模型与三框架 UI 移植评审                                 | 2 条 P2                      |
| `next-0915-branch-review.md`                        | next-0915 分支相对 main 的插件拆包与依赖调度评审（四轮）                                       | 4 条 P2                      |
| `next-0912-branch-review.md`                        | next-0912 分支相对 main 的 epic-006「工作树 + 提交历史」评审（2026-09-19 第四次复核 + 修复轮） | 4 条 P1 + 4 条 P2 + 其余待办 |
| `next-0912-branch-review-max.md`                    | 同上，max 独立复核轮（已修条目已删）                                                           | 5 条 Top + 15 条 §4 + 5 顺延 |
| `next-11-rxdb-package-review.md`                    | next-11 分支 `packages/rxdb` 包评审                                                            | 4 块 + 1 条规格决策          |
| `REVIEW-rxdb-tree-vs-main.md`                       | `rxdb-tree` 分支相对 main 的评审                                                               | C8 + 2 条 PR 说明            |
| `RV-013-adapter-local-system-repository-helpers.md` | 删除适配器的 `localRxDBBranch()` / `localRxDBChange()` 及 PGlite 孤儿 `createBranch`           | Open                         |
| `RV-014-rv-013-execution-scope.md`                  | 补齐 RV-013 的继承 API 面、测试处置与验证矩阵                                                  | Open                         |
| `RV-015-cli-plugin-generator-seam.md`               | CLI 没有加载插件生成器的缝，插件自带的 `RepositoryGenerator` 零接线                            | Open                         |

> **2026-09-23 清理**：`2026-09-18-rxdb-core-review.md` 与配套 probes 整份删除——两条 P2 已修（游标页 CREATE 合并按翻页方向裁到 limit；count 的 CREATE 不再本地加法而是回 SQL 重数），判据落在 `packages/rxdb/src/query/merge_create.ts` 的注释与 `review-query.regression.spec.ts` 的 Q4 / Q5 用例里。
> **2026-09-22 清理**：按上面的约定重扫全目录，删掉了已完成与判定不改的条目——`RV-012`（`RxDBBranch` 去树化，已 Resolved）、`RV-016`（repository `mergeOperations`，自身判据「`packages/**` 零命中」已满足）两份文件整份删除；各整分支报告里的「证伪项 / REFUTED」「❌ 不值得做」「误报订正」小节与行一并删除（判据均已落在代码注释与 TSDoc 里，报告不再留副本）。
> 最近一次整分支复核：2026-09-19，见 [`next-0912-branch-review.md`](./next-0912-branch-review.md)（HEAD `cef3abf0`）；该分支已于同日以 `2132c30d`（`feat(aiao): 添加 working-tree 能力 (#55)`）合入 main，报告里原「不建议合并」的结论已过期，但**仍有 4 条 P1 + 4 条 P2 未修**，全为架构级（跨连接能力传播、切换事务内 CAS、物化流水线接公开入口、前置条件进最终事务）。
> [`next-0915-branch-review.md`](./next-0915-branch-review.md) 另记 next-0915 插件拆包评审。
> 2026-09-11 的全量复核已清空 `requirements-incomplete-stories-review.md`；更早的
> `next-1123-branch-review.md`、`next-0831-branch-review.md` 与 `next-11-rxdb-adapter-tauri-review.md` 同样已删除。

## 状态约定

见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)。

## 工作流

1. AI review 发现问题 → 从 `review.template.md` 复制出 `RV-XXX-描述.md`，`status: Open`
2. 开 PR 修复 → 在 `pr` 字段记录 PR 链接
3. PR 合并、修复完成 → `status: Resolved`，补 `updated` 日期

## 命名规范

见 [../CONVENTIONS.md](../CONVENTIONS.md#命名规范)。`RV-XXX-描述.md`，编号 `RV-001` 起递增。
例外：整分支 / 整包评审报告（如 `next-0831-branch-review.md`）结论一次性给出、没有 Open/Resolved 生命周期，不占用 RV 编号；它们的「状态」体现为文件里还剩几条。
