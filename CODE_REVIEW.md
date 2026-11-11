# `live-store` 分支代码评审记录

- 评审基线：`origin/main`
- 评审分支：`live-store`
- 变更规模：66 个文件，`+2732/-85`
- 评审结论：发现 2 个 P1 数据一致性风险，建议修复后再合入 `main`

## P1-1：复合同步只在入口核对一次远端身份

### 位置

- `packages/rxdb-plugin-sync/src/SyncManager.ts:302`
- `packages/rxdb-plugin-sync/src/SyncManager.ts:313`
- `packages/rxdb-plugin-sync/src/SyncManager.ts:467`
- `packages/rxdb-plugin-sync/src/sync-repository.ts:270`
- `packages/rxdb-plugin-sync/src/sync-repository.ts:291`

### 问题

`sync()`、`syncRepository()` 和 `bulkSync()` 只在同步入口调用一次 `verifyRemoteBackend()`。入口校验通过后，如果 pull 阶段或分页 pull 期间远端被重置，后续 push 仍会把本地变更写入新的远端，并推进 `lastPushedChangeId`，不会抛出 `RemoteBackendMismatchError`。

多页 `fetchAll` pull 也存在相同的时间窗口：第一次请求核对通过后，后续请求使用的远端身份可能已经发生变化。

### 触发条件

1. 同步入口第一次校验时，远端身份为 A。
2. pull 进行中，或 pull 完成、push 开始前，远端被重置为 B。
3. 当前同步继续使用原来的本地同步状态执行后续 pull/push。

### 影响

本地变更可能被写入与入口校验不同的远端，且同步游标会被当作成功推进，造成跨远端写入和数据一致性破坏。该问题在远端重置、租户切换或后端实例替换场景下尤其危险。

### 修复建议

把远端身份作为本次同步阶段的不可变快照，并在以下边界重新核对：

- 每个分页请求前；
- pull 与 push 的切换处；
- 复合同步开始 push 前；
- 任何会使用同步游标更新远端的操作前。

至少应在复合同步开始 push 前再次调用远端身份校验；校验失败时停止同步，不得推进 `lastPushedChangeId`。

## P1-2：分支物化冻结游标未绑定远端身份

### 位置

- `packages/rxdb-plugin-sync/src/branch-materialization-source.ts:384`
- `packages/rxdb-plugin-sync/src/branch-materialization-source.ts:386`
- `packages/rxdb-plugin-sync/src/branch-materialization-source.ts:394`
- `packages/rxdb-plugin-sync/src/remote-backend.ts:65`
- `packages/rxdb-plugin-sync/src/remote-backend.ts:91`

### 问题

`freezeIntent()` 从远端 A 获取 cutoff，但冻结数据没有保存对应的 backend ID。`pages()` 虽然会再次验证远端身份，但验证依赖已有的 `RxDBSync.remoteBackendId` 记录。

首次物化且本地没有任何 `RxDBSync` 记录时，远端 A 在冻结后被重置为 B，后续校验无法用冻结时的身份识别这次变化。代码随后可能使用 A 的 cutoff 在 B 上分页；如果 B 的变更序列早于该 cutoff，物化会提前结束并遗漏 B 上的数据。

### 触发条件

1. 首次物化时从远端 A 获取并冻结 cutoff。
2. 本地还没有对应的 `RxDBSync` 记录。
3. 远端被重置为 B，且 B 的变更序列与 A 不同。
4. 继续调用 `pages()`，使用旧 cutoff 读取新远端。

### 影响

分支物化可能在远端切换后静默返回不完整的数据集，调用方无法区分“已完整物化”和“因远端身份变化而提前结束”。

### 修复建议

把冻结时核实的 backend ID 写入 `FrozenWatermark` 或 intent，并在续拉和每次分页读取前与当前远端身份比较。该校验不能依赖本地是否已经存在 `RxDBSync` 记录；首次物化也必须能检测到远端变化。

## 已完成的验证

以下检查均已通过：

- typecheck 与 lint：40 个 Nx task；
- 受影响包测试：21 个 Nx task；
- 受影响包 build：17 个 Nx task；
- Supabase SQL security regressions；
- website `check-doc-code`；
- `git diff --check`。

`website:build` 在进入内部 `pnpm nx api-docs website` 后约 4 分钟无输出且没有活动子任务，已停止。该结果属于构建环境挂起，不能视为通过或失败；代码包的 typecheck、lint、test 和 build 验证不受影响。

## 评审结论

当前分支的常规自动化验证通过，但上述两个 P1 问题都涉及远端身份变化时的数据完整性。修复远端身份快照和冻结游标绑定后，应补充远端重置发生在分页 pull、pull→push 边界以及首次分支物化期间的回归测试，再合入 `main`。
