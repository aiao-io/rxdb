# `@aiao/rxdb-adapter-encrypted` 代码评审

## 结论

🔴 不通过。首次初始化时并发 `unlock()` 没有串行化，可能把内存中的 key/kid 与持久化 verifier 写成不同版本，随后加密的数据无法再解密。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：源码、加密协议、Keyring、测试和公开入口；34 个文件，约 3,435 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| ENCRYPTED-001 | P1 | `src/keyring.ts:153` | 两个首次 `unlock()` 可同时读到空 `readSingleton()`，各自生成不同 salt/kid/verifier 并竞争 `writeSingleton()`。后写者决定持久化 verifier，先完成者仍把另一把 key 写入内存；它加密出的内容将在下次解锁时无法验证或解密。 | 对 `unlock()` 加 single-flight/mutex，并为首次初始化使用原子 create-if-absent；完成持久化后重新读取确认 winner。增加并发首次 unlock 后跨实例加解密的测试。 |

## 其余观察

- AES-GCM-256、96-bit IV、128-bit tag、AAD 和 PBKDF2-SHA-256/600,000 次迭代配置合理。
- Key bytes 长度、CryptoKey 算法/usages、envelope 版本与加密字段查询均有显式校验。
- 未发现 `any`、TypeScript 抑制指令或 ESLint 忽略。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-adapter-encrypted`、`pnpm nx typecheck rxdb-adapter-encrypted`、`pnpm nx lint rxdb-adapter-encrypted`、`pnpm nx build rxdb-adapter-encrypted`。
- 并发 unlock 必须收敛到唯一 verifier/key，失败不能留下半初始化状态。
