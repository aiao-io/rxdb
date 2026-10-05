---
id: RV-058
title: 首次解锁取消后仍提交废弃密钥的 verifier
status: Resolved
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-058：首次解锁取消后仍提交废弃密钥的 verifier

## 问题

**P2，确认问题，已修复（2026-10-05）。** 新数据库尚无 keyring singleton，解锁 A 已进入 keyProvider，但 provider 还没返回。此时调用 lock()，再开始新密钥 B 的解锁；交付 A 后，A 请求虽拒绝为 unlock_aborted_by_lock，却已经把 A 的 salt/kid/verifier 写进真实数据库。B 被 verifier_mismatch 拒绝，数据库被废弃请求的凭据占用。

实际锁状态仍为 locked，**没有发现锁定后返回明文、AES 认证绕过或既有数据被覆写**。本问题是首次初始化的持久副作用不受取消屏障保护。仍知道 A 时可重新用 A 解锁；不宣称不可恢复的数据丢失。

## 根因

[keyring.ts](../../packages/rxdb-adapter-encrypted/src/keyring.ts)：unlock 在 220–223 捕获 lockEpoch，performUnlock 从 407 行读持久状态；provider await 在 433 行，生成 verifier 在 520–533，writeSingleton 在 543 行。**epoch 只在 554–559 行、持久写完成后检查**。

因此本轮 lock 不会使内存 key 被重新发布，却不能阻止取消已经发生在 provider 返回之前的请求继续首次持久化。第二个请求正确看到了已存在的 A verifier，于是拒绝 B；问题不在“B 的验证太严格”。

现有取消测试只检查 locked/不发 false 以及同凭据后来可解锁，没有断言取消的首次初始化不应消耗空库的凭据选择。

## 实际复验

三个独立测量面各 **2 failed /1 passed**，共 **6 failed /3 passed**：

- [原 Keyring + native SQLite singleton](../../packages/rxdb-adapter-encrypted/src/__tests__/review-aborted-initial-unlock.spec.ts)：实际 WebCrypto，SQLite memory 持久接口，仅 keyProvider 返回时间是 gate。
- [Electron 适配器](../../packages/rxdb-adapter-electron/src/__tests__/review-aborted-initial-unlock.spec.ts)：原 encryption facade、sqlite-core storage/client/host、实际临时 SQLite 文件；进程内 host 管道不是 GUI/真实 IPC 证明。
- [PGlite 适配器](../../packages/rxdb-adapter-pglite/src/__tests__/review-aborted-initial-unlock.spec.ts)：Chromium 中实际 PGlite/原 storage/原 encryption facade。表 COUNT 验证 singleton 状态；memory 档位，不外推磁盘崩溃持久性。

每个前置条件都确认未初始化，取消发生在 provider 尚未返回；第一负向确认取消后仍 initialized=true，第二负向确认 B 被 A 拦住。对照“正常完成 A 的首次初始化后再 lock”则 B 应拒绝、A 应可重开，原行为正确。

[核心最终整包日志](evidence/2026-10-05/encrypted/final-encrypted-all-tests.txt)：275 passed /2 failed，原 274 条全过。两个适配器聚焦 [最终日志](evidence/2026-10-05/encrypted/final-native-cancel-probes.txt) 各 1 passed /2 failed；[状态观测](evidence/2026-10-05/encrypted/final-observations.json) / [JUnit 计数](evidence/2026-10-05/encrypted/final-counts.json)。三项目严格 lint/typecheck 通过，业务未改。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run-many -t test --projects=rxdb-adapter-encrypted,rxdb-adapter-electron,rxdb-adapter-pglite --parallel=1 --args='review-aborted-initial-unlock --run --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 最小修复方向

在第一次不可逆 singleton 写入前，让取消状态参与初始化提交协议：本例 lock 早于 provider 交付，不能仅到最终内存 key 发布时才发现取消。检查与真正存储提交间的竞争也需要明确；不能在取消后随意删除 singleton，那可能删除另一个合法初始化者的凭据。

保留已初始化库的 verifier 校验/不同密钥拒绝、singleton 唯一约束冲突重读、unlock 串行化与 encrypt/decrypt 的 epoch 守卫。回归 provider/KDF/verifier/storage 各等待段、取消前后排队 B、两个 keyring 首次竞争、真实写失败和重连。不为修此问题增加旧密钥 fallback，也不削弱认证检查。

## 解决记录

- [x] 原 Keyring/native SQLite、Electron 文件 SQLite、Chromium/PGlite 的失败与正常凭据保护对照保留。
- [x] 首次初始化在不可撤销的 `writeSingleton` 之前同步调用 `assertUnlockNotAborted(epoch)`；写入进行中的 lock() 仍由发布内存 key 前的同一检查兜住内存态。三个复验面均 3 passed，encrypted 整包 277 passed。
- [ ] 当日加密台账（execution-2026-10-05-encrypted.md）仍链接本文件，台账入库后按清理规则整份删除。
