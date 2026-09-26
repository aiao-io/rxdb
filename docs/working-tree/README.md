# 工作树与提交历史：规格与契约

[epic-006 本地工作树与提交历史](../../requirements/epics/epic-006-working-tree-commits.md)的规格、数据模型与契约。代码注释里的 `spec.md FR-xxx`、`data-model.md §x`、`core-api.md §x`、`adapter-contract.md §x`、`research.md Rx` 都指本目录下的文件。

| 文件                                                                 | 内容                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| [spec.md](./spec.md)                                                 | 需求、v1 硬裁决、FR / SC 编号、写入口语义矩阵         |
| [data-model.md](./data-model.md)                                     | 系统表、存储契约、编解码与加密边界、迁移              |
| [research.md](./research.md)                                         | 实现前定下的技术选型（R1–R12）                        |
| [threat-model.md](./threat-model.md)                                 | 提交能力的防线边界、跨连接与跨进程的残留窗口          |
| [quickstart.md](./quickstart.md)                                     | 验证场景与执行记录                                    |
| [contracts/core-api.md](./contracts/core-api.md)                     | 核心公开 API、命名门禁、错误码                        |
| [contracts/tri-framework-api.md](./contracts/tri-framework-api.md)   | 三框架对称的判据与能力清单                            |
| [contracts/adapter-contract.md](./contracts/adapter-contract.md)     | 适配器义务、raw 写 bypass 判定、受信调用点登记表      |
| [contracts/conformance-suites.md](./contracts/conformance-suites.md) | 捕获 / 提交两套具名一致性套件                         |
| [contracts/benchmark-report.md](./contracts/benchmark-report.md)     | benchmark JSON 契约、相对 / 绝对门禁、commit 预算例外 |

## 有测试逐字比对的两处

下面两张表由测试当场解析、与代码逐行比对，改措辞会让测试变红。这是刻意的：表是契约，措辞变了通常意味着语义变了。

- `spec.md` 的「写入口语义矩阵」第一列：[write-entry-matrix.spec.ts](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/write-entry-matrix.spec.ts)
- `contracts/adapter-contract.md` §3「受信调用点登记表」：[trusted-callsite-registry.spec.ts](../../packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts) 与 [trusted-callsite-capture.spec.ts](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/trusted-callsite-capture.spec.ts)

## 不在这里的

spec-kit 的过程产物（`plan.md`、`tasks.md`、`checklists/`）不在仓库里。任务编号（T0xx / T1xx）与执行过程留在 git 历史：`git show f9528e8f:specs/001-working-tree-commits/tasks.md`。`plan.md` 里仍然生效的只有 commit 的性能预算例外，已并入 `contracts/benchmark-report.md` §4。
