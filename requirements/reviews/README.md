# AI Review 规则与记录

这个目录集中存放**给 AI 做代码 review 用的规则/检查清单**，以及 review 过程中产出的结论记录。

## 用途

- **规则文件**：告诉 AI「review 时看什么、按什么标准判」的 md 文件
- **结论记录**：某次 review 发现的问题 + 根因 + 修复方案，修复后标记解决

## 目录结构

评审报告只留**尚未处理**的条目。复核确认已修、或判定不值得做的条目直接删除——修法与判据都写在代码注释里，报告再留一份副本只会与代码漂移。整份报告清空即删文件。

| 文件                                                | 说明                                                                                  | 剩余项                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| `README.md`                                         | 本说明与状态约定                                                                      | —                            |
| `review.template.md`                                | 新建 review 记录的模板                                                                | —                            |
| `next-0915-branch-review.md`                        | next-0915 分支相对 main 的插件拆包与依赖调度评审（四轮）                              | 5 条 P2                      |
| `next-0912-branch-review.md`                        | next-0912 分支相对 main 的 epic-006「工作树 + 提交历史」评审（2026-09-19 第四次复核） | 6 条 P1 + 6 条 P2 + 其余待办 |
| `next-0912-branch-review-max.md`                    | 同上，max 独立复核轮（已修条目已删）                                                  | 7 条 Top + 19 条 §5 + 6 顺延 |
| `2026-09-18-rxdb-core-review.md`                    | RxDB 核心查询/关系/生命周期定向评审（含复跑记录）                                     | 4 条 P1 + 9 条 P2            |
| `2026-09-18-rxdb-core-probes.spec.ts.txt`           | 上者的补充复现用例源码（文本，从测试目录移出）                                        | —                            |
| `next-11-rxdb-package-review.md`                    | next-11 分支 `packages/rxdb` 包评审                                                   | 4 块 + 1 条规格决策          |
| `RV-012-rxdb-branch-detree.md`                      | `RxDBBranch` 去树化（US-025 阶段 E 前置）                                             | Open                         |
| `RV-013-adapter-local-system-repository-helpers.md` | 删除适配器的 `localRxDBBranch()` / `localRxDBChange()` 及 PGlite 孤儿 `createBranch`  | Open                         |
| `RV-014-rv-013-execution-scope.md`                  | 补齐 RV-013 的继承 API 面、测试处置与验证矩阵                                         | Open                         |

> 最近一次整分支复核：2026-09-19，见 [`next-0912-branch-review.md`](./next-0912-branch-review.md)（HEAD `cef3abf0`；仍有 6 条 P1 + 6 条 P2，其中跨连接、切换、合并与误丢弃问题影响当前路径）；
> [`next-0915-branch-review.md`](./next-0915-branch-review.md) 另记 next-0915 插件拆包评审。
> 2026-09-18 按「只留尚未处理的条目」约定清理了本目录全部报告：已修条目（含两轮修复记录）删除，剩余条目逐条对照 HEAD 核实并刷新锚点；
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
