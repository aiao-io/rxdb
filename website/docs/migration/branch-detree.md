# `RxDBBranch` 去树化

系统表 `RxDBBranch` 不再是树实体：装饰器从 `@TreeEntity` 换成 `@Entity`，随之移除四个树查询方法与一个类型导出。**这是破坏性变更**，但影响面极小——受众只有直接调用分支树查询的代码。

**表结构一个字都没改。** `rxdb_branch` 的列、索引、外键全部照旧，因此不触发系统表迁移、不需要改数据库版本，升级不做任何数据操作。

## 移除了什么

| 位置                                                       | 移除的成员                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `RxDBBranch` 静态方法                                      | `findDescendants` / `findAncestors` / `countDescendants` / `countAncestors` |
| `LocalRxDBBranchRepository` / `RemoteRxDBBranchRepository` | 同名的四个方法                                                              |
| `@aiao/rxdb` 顶层导出                                      | `RxDBBranchTreeRuleGroup` 类型                                              |

分支的其余查询（`find` / `findAll` / `findOne` / `count` / `get` 等）与 `parentId`、`parent$`、`children$` 全部保留，用法不变。

## 替代方案

改为全量 `find()` 之后在内存里按 `parentId` 组装：

```diff
-const descendants = await branchRepository.findDescendants({ where: { id: branchId } });
+const all = await branchRepository.find({ where: {} });
+const byParent = new Map<string | null | undefined, RxDBBranch[]>();
+for (const branch of all) {
+  const siblings = byParent.get(branch.parentId) ?? [];
+  siblings.push(branch);
+  byParent.set(branch.parentId, siblings);
+}
+// 从 branchId 出发逐层展开 byParent
```

这正是仓库内部一直以来的做法——分支的四处父链遍历（`getPathToRoot`、`collectBranchChain`、`sync_branches` 的落库拓扑排序、`remove_branch`）全部手写，没有一处用过树查询。

## 为什么移除

树查询给不出分支遍历需要的三样东西：

| 分支需要的                 | 递归 CTE 给的                                                        |
| -------------------------- | -------------------------------------------------------------------- |
| 断链 / 成环**报错**        | **静默截断**——返回一棵少了枝干的树，不是错误                         |
| **有序**路径               | 无序集合；共同祖先要靠路径下标比对才算得出                           |
| 每段的 `fromChangeId` 区间 | 只认 `parentId`，不认分支的 `fromChangeId` / `local` / `remote` 语义 |

也就是说这四个方法在分支上不只是没人用，而是**用了会错**：一条分支链中间断掉时，递归查询会安静地少返回一截，而版本控制拿这个结果去切换分支会把数据带到错误的时间点。类型上摆着四个「能查祖先」的方法，是在诱导调用方走上这条路。

## 相关

- [分支](../collaboration/branch.md)：分支模型与版本控制操作
- [版本与 API 稳定性策略](../versioning.md)：破坏性变更流程
