# `@aiao/utils` 代码评审

## 结论

🟢 好。自动质量门禁通过，`LeaderElection` 已把 disposed 建模为不可逆状态，释放后同步状态正确且不能重新参与选举。

## 修复状态（2026-07-15）

- UTILS-001 已修复：`elect()` 拒绝已销毁实例，`dispose()` 复位 `#isLeader`，Web Lock 回调进入前再次检查 disposed。
- 回归测试覆盖“持锁后 dispose 状态复位”和“dispose 后再次 elect 抛错且不重复申请锁”。
- `pnpm nx test utils --run src/@browser/leader-election.spec.ts --skipNxCache` 通过：7 个测试。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`packages/utils` 下源码、公开入口、测试和 Nx 配置；257 个文件，约 9,156 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过
- 测试现状：103 个 spec/test 文件；本次全包基线命中有效 Nx 本地缓存

## 问题

| ID        | 级别 | 位置                                                                      | 问题与影响                                                                                                                     | 建议                                            |
| --------- | ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| UTILS-001 | P1   | `src/@browser/leader-election.ts`、`src/@browser/leader-election.spec.ts` | 已修复。disposed 实例无法再次选举，释放 leadership 后 `isLeader` 立即为 false，延迟进入的 Web Lock 回调也不会重新成为 leader。 | 保留生命周期回归测试，disposed 语义保持不可逆。 |

## 其余观察

- `AsyncQueueExecutor` 对并发数、去重任务、清队列拒绝和 drain 生命周期处理完整。
- AES-GCM 使用随机 96-bit IV，RSA-OAEP 使用 SHA-256；未发现明文 fallback 或弱算法路径。
- 未发现 `any`、TypeScript 抑制指令或 ESLint 忽略。

## 验收条件

- 修复 `UTILS-001` 后执行 `pnpm nx test utils`、`pnpm nx typecheck utils`、`pnpm nx lint utils`。
- `dispose()` 后实例不能重新参与选举，且同步状态必须反映已释放 leadership。
