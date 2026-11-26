# 放弃与恢复回写业务表

从 0.0.28 之后的版本起，`workingTree.discard()` 与 `workingTree.restore()` 连业务表一起改：丢弃之后业务表逐行回到 HEAD，恢复之后业务表就是所选提交的数据、与 HEAD 的差异记作未提交改动。**这是语义上的破坏性变更**：门面方法与三端 `useWorkingTree()` 的签名、返回值、错误码一个都没变，变的是调用之后业务表里是什么。

不涉及系统表结构，升级不做任何数据迁移；但 0.0.28 留下的**进行中的恢复会话**要在升级前处理掉，见下文「已有数据库」。

## 变了什么

|                                  | 0.0.28 及更早                           | 现在                                                                                    |
| -------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `discard()` 之后的业务表         | 停在丢弃前的值，只清了工作树条目        | 逐行等于 HEAD：新建的删掉、改过的改回、删掉的插回（含多对多中间表与加密字段）           |
| `restore()` 之后的业务表         | 不动，仍是 HEAD 的数据                  | 等于所选提交的数据                                                                      |
| `restore()` 写进工作树的条目     | 目标提交**自己**的变更单元，原样抄过来  | HEAD → 目标的差异：插入 / 修改 / 删除各按两端判，修改只带取值不同的字段                 |
| 完整差异为空时的 `restore()`     | 只在目标就是 HEAD 时算 no-op            | 两次提交之间改过又改回、新建又删掉的，同样是 no-op：不建会话、不涨 revision、一行都不写 |
| `restore()` 的 `target.entities` | 筛目标提交自己的单元                    | 筛要恢复回去的行：点名的行只要两端不同就恢复，别的行留在 HEAD                           |
| `restore()` 的兼容性预检         | 重放路径加目标节点                      | 重放路径；目标节点自己的单元不再被读，也不再参与预检                                    |
| 变更日志、撤销栈与同步           | 不涉及                                  | 回写是一次普通的本地写入：进变更日志、在撤销栈里是一步、会被同步推送                    |
| `discardWorkingTree()`           | `discardWorkingTree(executor, options)` | `discardWorkingTree(executor, context, options)`，与 `restoreWorkingTree()` 同形        |

没变的：`discard(options)` / `restore(target, options)` 的入参与结果形状；三个捕获位的 CAS；revision 规则（丢弃与恢复各 +1，干净工作树上的丢弃仍是一条写语句都不发的 no-op）；恢复会话的生命周期；HEAD 与历史一个字节都不动。

[`@aiao/rxdb-plugin-replay`](/plugins/rxdb-plugin-replay/README.md) 的 `restoreToCommit()` 是现取凭据转调 `workingTree.restore()`，同样换成了上面的语义：点一个 commit 标记，业务表就变成那次提交的数据。

## 谁要改

### 1. 把 `discard()` 当成「清掉未提交标记、数据留着」来用的

业务表现在会退回 HEAD。想留下当前数据、只是不想再看到「有未提交改动」，改用 `commit()`：

```diff
-await db.workingTree.discard(credentials);
+await db.workingTree.commit('接受当前数据', { ...credentials, authorId, operationId: crypto.randomUUID() });
```

### 2. 在 `restore()` 之后自己把目标数据写进业务表的、在 `discard()` 之后自己把 HEAD 数据写回去的

这正是 0.0.28 需要的绕路，现在删掉即可：命令已经在同一个事务里写过了，再写一遍只会多出一批未提交改动（`restore()` 之后）或一批新的草稿（`discard()` 之后）。

### 3. 依赖「`restore()` 只带回目标提交自己改过的那几行」的

现在带回的是那次提交刚完成时的**整份**数据：恢复到 `HEAD~2`，`HEAD~1` 改过的行也会回到当时的值。只想动几行，用 `target.entities` 点名：

```typescript
await db.workingTree.restore(
  { commitId, entities: [{ namespace: 'public', entity: 'Task', entityId: task.id }] },
  credentials
);
```

### 4. 直接调用 `discardWorkingTree()` 的

绝大多数调用方走的是门面 `db.workingTree.discard(options)`，不受影响。自己包了一层门面、或在测试里直接调命令体的，
补上第二个参数——与 `commitWorkingTree()` / `restoreWorkingTree()` 收的是同一个写上下文（实体管理器加解码上下文），
照那两个命令的调用方式传同一个对象：

```diff
 await adapter.transaction(executor =>
-  discardWorkingTree(executor, credentials)
+  discardWorkingTree(executor, context, credentials)
 );
```

```typescript
const context: Parameters<typeof discardWorkingTree>[1] = {
  entityManager: db.entityManager,
  codec: {
    resolveTargetMetadata: (entity, namespace) => db.schemaManager.getEntityMetadata(entity, namespace),
    resolveEntityMetadata: (entity, namespace) => db.schemaManager.getEntityMetadata(entity, namespace),
    isEncryptedAtRest: adapter.isEncryptedAtRest?.bind(adapter)
  }
};
```

上下文用来解码条目里的 `bigint` / `binary` 列：回写要的是它们的原值，不是 `$rxdbChangeValue` 信封。

### 5. 订阅变更日志或撤销栈的

丢弃与恢复各产生一批变更日志行（同一个事务），撤销栈因此多一步：撤销一次丢弃就是把草稿取回来，取回来的改动重新进工作树；它也像任何新写入一样作废 redo 栈。界面上把「丢弃」当作不可撤销操作提示的，可以改提示文案。

## 已有数据库

### 进行中的恢复会话：升级前先在旧版本上丢弃

0.0.28 的 `restore()` 只写条目，条目是目标提交自己的变更单元，它们的 `inversePatch` 不是 HEAD 上的值，业务表也从没被改过。升级之后对这样一个会话调 `discard()`，新版本会按这些 `inversePatch` 回写业务表，退到的不是 HEAD。

升级前，在旧版本上对每条 `status()` 报 `restoring` 或 `conflicted` 的分支调一次 `discard()`——0.0.28 的丢弃只删条目与会话，而那时业务表本来就停在 HEAD，正好是对的。`status()` 只报当前分支，所以要逐条分支切过去看。需要恢复的，升级之后重新 `restore()`。

### 0.0.28 丢弃留下的残留不会被追溯清理

0.0.28 的 `discard()` 不改业务表：以前丢弃过的编辑还躺在业务表里，工作树却是干净的。新版本只回写工作树条目覆盖到的行，这些残留没有条目，新版本不会去碰它们。产品依赖「业务表等于 HEAD」的，升级之后把这些行当作普通编辑改回（或删掉）并 `commit()`。

## 回写的边界

- **远端同步来的条目一并退回。** 工作树不按来源豁免，`origin = 'remote_sync'` 的改动也会被丢掉；退回是一次本地写入，会被推上远端，等于用本地 HEAD 的值覆盖远端那次修改。不想这样就先 `commit()` 再丢。
- **簿记字段不跟着回写。** `remoteId` 与审计时间（`createdAt` / `updatedAt`）不进版本控制，改回去的行保持它们的现值，`updatedAt` 记成回写那一刻。
- **`createdBy` / `updatedBy` 在 UPDATE 回写上写不回去。** 它们是只读列，适配器的 UPDATE 路径会过滤掉（撤销与切分支是同一条路径、同一个限制）：多人编辑过的行，丢弃之后 `updatedBy` 停在最后一次写入的主体上。被插回来的行整行取自 HEAD，不受影响。
- **可写检出位上同一条路径。** 回写落在那套影子表上、记在持有分支名下，主检出位一张表都不碰。
- **认不出的实体整次拒绝。** 工作树里有条目指向本客户端没注册的实体时，`discard()` 抛 `UnknownWorkingTreePatchEntityError`，一个字节都不写——没有元数据就写不了那张表，只退一半再报成功会让业务表与 `status()` 对不上。

## 相关

- [工作树插件 · 放弃与恢复回写业务表](/plugins/rxdb-plugin-working-tree/README.md)
- [版本与 API 稳定性策略](/versioning.md)：破坏性变更流程
