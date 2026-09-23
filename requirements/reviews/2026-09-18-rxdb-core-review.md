# RxDB 核心评审 · 2026-09-18

评审对象：`next-0912`，HEAD `fc30f1da`，以及评审时工作区的未提交代码。重点检查 `packages/rxdb` 的查询增量更新、实体关系与待保存状态、连接生命周期，并追踪相关同步调用链。

🔴 原 13 条发现中 11 条已随 `9c9f1ecc` 修复并按本目录约定从报告删除；**仍保留 2 条可复现问题（#5、#6，均为 P2）**，二者都在 `merge_create.ts`，评审后该文件未再针对这两条改动。

2026-09-22 复核：按当前 HEAD 重新核对代码，两条仍原样成立（`merge_create.ts` 的 `findByCursor` 无游标分支无 limit 截断；`count` 分支用永不被填充的 `task.resultEntityIds` 去重）。

验证记录：

| 验证                                         | 结果                                               | 边界                                                     |
| -------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `pnpm nx run rxdb:test --skipRemoteCache`    | 2048 通过、16 失败，107 个测试文件通过、3 个失败   | 工作区后续查询修复落地前的全包基线，不能当成最新全包结果 |
| HEAD `9c9f1ecc` 复核                         | 3 个审计 spec 16/16 通过；临时复现中 #5、#6 仍失败 | 临时复现按报告指引复制进临时 spec 运行后删除；未跑全包   |
| SQL 后端集成测试、三框架测试、lint/typecheck | 本轮未运行                                         | 本报告不声称验证全部适配器和框架组合                     |

补充复现源码：[2026-09-18-rxdb-core-probes.spec.ts.txt](./2026-09-18-rxdb-core-probes.spec.ts.txt)。把文本复制到 `packages/rxdb/src/__tests__/review-core-probes.temporary.spec.ts` 后执行：

```bash
pnpm nx run rxdb:test --skipRemoteCache --coverage=false review-core-probes.temporary
```

## 当前仍未解决

1. **[P2] 游标页处理 CREATE 时遗漏 limit。（🔴 仍可复现）**

   位置：[merge_create.ts:130-132](../../packages/rxdb/src/query/merge_create.ts#L130)：游标分支的无游标 `else` 直接 `calculateOrderBy(combined, orderBy)`，没有任何按 limit 截断。

   `findByCursor({ limit: 2, orderBy: [{ field: 'id', sort: 'asc' }] })` 首次返回 `[a,b]`，收到 c 的 CREATE 后直接发射 `[a,b,c]`。该分支过滤游标、排序，却没有任何按 limit 截断；持续插入会让分页结果不断膨胀，`limit: 0` 也无法保持空集。应按查询方向裁剪窗口：正向取前 limit 项，before 取紧邻游标的末尾 limit 项。临时复现返回 3 行，预期 2 行。

2. **[P2] 已被 COUNT 快照包含的迟到 CREATE 会重复计数。（🔴 仍可复现）**

   位置：[merge_create.ts:139-156](../../packages/rxdb/src/query/merge_create.ts#L139)：count 分支的 `resultEntityIds` 去重。

   SQL 已读到新增行并返回 1，随后这行的批处理 CREATE 才到达，计数会变成 2。`resultEntityIds` 只记录接收过的增量事件——`QueryTask#next` 只在 result 是数组/带 id 对象时才填充它，number 类型的 count 结果永远不会被填充——所以它无法证明事件是否已包含在当前快照里。SQLite 的变更投递本身有定时批处理，这个到达顺序是允许的。应使用可与快照对齐的事件水位，或者对无可靠基线的 count 变更重查；仅增加 ID 去重集合不足以解决问题。临时复现结果 2，预期 1；本轮未跑真实 SQLite 时序集成测试。

报告只保留当前未解决项；两项清空后按 `requirements/reviews/README.md` 约定删除本文件与配套 probes。
