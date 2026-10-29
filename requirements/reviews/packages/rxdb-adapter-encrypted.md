# rxdb-adapter-encrypted 深度评审

评审日期：2026-10-29；源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。更新轮核对：自基线 `7bb16a9` 至 HEAD 本包无源码变更。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟢好：本次范围内未发现新的确定包内缺陷。AES-GCM 密钥生命周期与存储 adapter 的集成要分开验证；[sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)（P2）是调用方跳过加密转换并导致公开保存失败，不能用本包单元测试通过证明所有 adapter 的数据已加密。

| 评审重点         | 已读符号与源码                                                                                                                                                                                                                                            | 当前判断                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 解锁、并发与取消 | [`Keyring.unlock` / `performUnlock` / `lock` / `assertUnlockNotAborted`](../../../packages/rxdb-adapter-encrypted/src/keyring.ts)                                                                                                                         | unlockQueue 串行；lockEpoch 取消较早操作；首次 verifier 写入前检查 epoch |
| singleton 竞争   | [`Keyring.performUnlock`](../../../packages/rxdb-adapter-encrypted/src/keyring.ts)、[`KeyringStorageBinding`](../../../packages/rxdb-adapter-encrypted/src/keyring-storage.ts)                                                                            | 明确 insert-only 冲突契约，冲突后重新读取并验证已持久化的 keyring        |
| AAD 与信封       | [`buildAAD` / `decodeEnvelope`](../../../packages/rxdb-adapter-encrypted/src/envelope.ts)、[`aesGcmEncrypt` / `aesGcmDecrypt`](../../../packages/rxdb-adapter-encrypted/src/crypto.ts)                                                                    | v2 按字段长度编码、主键有类型标签；算法/版本/base64 长度被校验           |
| 明文往返         | [`serializeForEnvelope` / `deserializeFromEnvelope`](../../../packages/rxdb-adapter-encrypted/src/serialize.ts)、[`envelopePlaintextPatches`](../../../packages/rxdb-adapter-encrypted/src/encrypt-patch.ts)                                              | 写侧拒绝读不回来的结构化值，boolean/数值/bigint/binary 按类型约束        |
| Schema 与查询    | [`validateEncryptedPropertyMetadata` / `validateQueryAgainstEncryptedColumns`](../../../packages/rxdb-adapter-encrypted/src/metadata-validation.ts)、[`validateEncryptedQuery`](../../../packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts) | 主外键/索引/FTS 冲突拒绝，关系路径无法解析时 fail-closed                 |

## 问题清单

本次范围内没有达到确定缺陷门槛的新增条目。未将“缺少某种故障注入用例”直接当成产品 bug。

**2026-10-29 复核：**本包源码自基线起无变更。抽查加密 AAD 关键符号与上表判断一致：`buildAAD()` 仍按 uint32 大端长度前缀编码各认证域字段、主键带类型标签（`STRING_ID_TAG` / `NUMBER_ID_TAG` / `BIGINT_ID_TAG`）；`decodeEnvelope()` 的版本/算法/base64 规范形式与 kid/iv/tag 长度校验仍在；`Keyring` 的 `lockEpoch` 在入队前捕获、`writeSingleton` 前后断言（`assertUnlockNotAborted`）仍在；`crypto.ts` 维持 PBKDF2 600k、AES-256-GCM、12 字节 IV、128 位 tag。本更新轮未发现新的确定问题。

## 已核对的修复与契约

[`Keyring.performUnlock`](../../../packages/rxdb-adapter-encrypted/src/keyring.ts) 在首次 `writeSingleton` 前检查取消，未复报已修“provider 迟到后仍初始化凭据”。`decrypt()` 对发生 lock 的在途明文先清零再拒绝。旧 v1 实体信封默认拒绝，仅 migration policy 允许读取；verifier 的旧版兼容是独立路径。idleTimeoutMs 已限制 setTimeout 范围。

## 测试与后续验证计划

已检查 Keyring/信封/序列化测试入口与 [`review-aborted-initial-unlock.spec.ts`](../../../packages/rxdb-adapter-encrypted/src/__tests__/review-aborted-initial-unlock.spec.ts) 的真实 SQLite singleton 夹具。优先把 `*Id` 列、主键列映射、变更 patch、切分支、备份恢复接入共享真实后端套件。此次未测量 coverage，未做密码学审计，不把静态检查扩张为对所有持久化字节的保证。

## 调用链交叉核查

`validateEncryptedPropertyMetadata` 只按真实 foreignKeyNames/columnNames 拒绝加密外键，普通 `secretId` 不是外键，声明合法；调用方不能以它含 Id 后缀为由跳过加密。Keyring 的 lockEpoch 在在飞加解密结束后再次校验，解密取消时清零明文；未发现能绕过该取消检查的确定新路径。

## 本次 Nx 校验

首轮（2026-10-28）`rxdb-adapter-encrypted:test`：321 passed (321)；目标实际执行。命令及整体边界见[总索引](README.md)。
