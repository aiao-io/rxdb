# Review：rxdb-adapter-encrypted

## 结论

🟡 二次评审发现 2 条问题（1 P2 + 1 P3）：序列化写侧宽松/读侧严格的组合会产出永久不可读的行或静默写错值；unlock 对损坏 keyring 存储泄漏错误类别。

## 检查范围

检查了 `package.json` 的主入口与 `/testing` 子路径、`project.json` build/typecheck/lint 推断、README 的 AES-GCM/PBKDF2、v1 迁移和零明文保证；走读 `src/crypto.ts`、`envelope.ts`、`keyring.ts`、`keyring-storage.ts`、`serialize.ts`、`encrypt-patch.ts`、`metadata-validation.ts`、`validate-encrypted-query.ts`、`errors.ts` 及 `src/__tests__/**`（KDF、信封、keyring 并发锁、篡改、类型边界和查询拒绝）。二次评审额外核对了 `serializeForEnvelope` / `deserializeFromEnvelope` 两侧类型契约与 `performUnlock` 的错误类别。

## 发现

### P2：序列化写侧宽松、读侧严格——类型不符的值被加密落盘后永久不可读或静默写错

- 证据：`src/serialize.ts:41` boolean 按 truthiness 编码（`'false'` 字符串 → `1`，静默变 true）；`44-47` date 对非法串回退为原串加密（该行为被 `serialize.spec.ts:101-106` 用例「falls back for invalid ones」固化）；`48-50` number/integer 直接 `String(value)`（`'abc'`、`1.5` 照写）。读侧 `serialize.ts:107-133` 对同样载荷拒绝（非有限数 → `EncryptedDecryptError 'auth_failure'`、integer 非安全整数拒绝、boolean 只认单字节 0/1）。docblock（`serialize.ts:27`）承诺「throws TypeError 值与属性类型不匹配」，实际只对 binary/bigint 生效。
- 触发：生产模式（dev schema 校验关闭）下 `{encFlag: 'false'}` 静默存成 true；`{encNum: 'abc'}` / `{encInt: 1.5}` 写入成功，之后每次读取 `auth_failure`——加密列禁止查询，被砖的行无法定位与清理，读先行删除同样失败；`{encDate: 'not-a-date'}` 同样写入后读失败。GCM 认证保证了「坏明文」唯一来源就是这条写路径，写侧收紧即可封死整类。
- 建议：写侧镜像读侧严格性——boolean 查 `typeof`、number 查 `Number.isFinite`、integer 查 `Number.isSafeInteger`、date 只接受 Date/数字/可解析串（非法抛 TypeError，不再回退原串）；keyValue/stringArray/numberArray 加密前跑 `assertStructuredShape`。

### P3：`unlock()` 对损坏的 keyring 存储泄漏 `EncryptedDecryptError`，破坏解锁错误契约

- 证据：`src/keyring.ts:418` `fromBase64Url(existing.salt)` 与 `466` `decodeEnvelope(existing.verifier)` 在 `performUnlock` 内裸调；存储被篡改时二者分别抛 `EncryptedDecryptError {code:'malformed_envelope'}`。文档契约（`keyring.ts:216`、`errors.ts:120-129`）规定 unlock 失败是 `EncryptedUnlockError`、存储格式问题是 `EncryptedConfigurationError`——从不抛 `EncryptedDecryptError`。
- 触发：salt 含非 base64url 字符（如 `!!!`）或 verifier 段数不对/非规范 base64 → 按 `EncryptedUnlockError` 分流「错误口令」UX/重试逻辑的调用方被错误类别误导；现有篡改测试（`keyring-verifier.spec.ts:123`）只篡改结构合法的密文，此路径无覆盖。
- 建议：`performUnlock` 内把 salt/verifier 两处解码 try/catch 后重抛为 `EncryptedUnlockError({code:'verifier_mismatch', cause})` 或 `EncryptedConfigurationError('invalid_key')`。

## 风险/未覆盖

WebCrypto 可用性和密钥托管由宿主决定；未在所有小程序/旧浏览器 JavaScriptCore 上执行原生 WebCrypto 矩阵。

## 建议验证

执行 `pnpm nx run rxdb-adapter-encrypted:build`、`pnpm nx run rxdb-adapter-encrypted:typecheck`，并在目标宿主补跑 `crypto.subtle` 不存在、跨 realm CryptoKey 与长 idle timeout 的集成测试。
