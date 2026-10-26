---
package: rxdb-adapter-encrypted
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-adapter-encrypted 增量代码评审

## 结论

🟡 待处理：1 条 P2、1 条 P3。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 0 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P2：序列化写侧宽松、读侧严格——类型不符的值被加密落盘后永久不可读或静默写错

- 证据：`src/serialize.ts:41` boolean 按 truthiness 编码（`'false'` 字符串 → `1`，静默变 true）；`44-47` date 对非法串回退为原串加密（该行为被 `serialize.spec.ts:101-106` 用例「falls back for invalid ones」固化）；`48-50` number/integer 直接 `String(value)`（`'abc'`、`1.5` 照写）。读侧 `serialize.ts:107-133` 对同样载荷拒绝（非有限数 → `EncryptedDecryptError 'auth_failure'`、integer 非安全整数拒绝、boolean 只认单字节 0/1）。docblock（`serialize.ts:27`）承诺「throws TypeError 值与属性类型不匹配」，实际只对 binary/bigint 生效。
- 触发：生产模式（dev schema 校验关闭）下 `{encFlag: 'false'}` 静默存成 true；`{encNum: 'abc'}` / `{encInt: 1.5}` 写入成功，之后每次读取 `auth_failure`——加密列禁止查询，被砖的行无法定位与清理，读先行删除同样失败；`{encDate: 'not-a-date'}` 同样写入后读失败。GCM 认证保证了「坏明文」唯一来源就是这条写路径，写侧收紧即可封死整类。
- 建议：写侧镜像读侧严格性——boolean 查 `typeof`、number 查 `Number.isFinite`、integer 查 `Number.isSafeInteger`、date 只接受 Date/数字/可解析串（非法抛 TypeError，不再回退原串）；keyValue/stringArray/numberArray 加密前跑 `assertStructuredShape`。

### P3：`unlock()` 对损坏的 keyring 存储泄漏 `EncryptedDecryptError`，破坏解锁错误契约

- 证据：`src/keyring.ts:418` `fromBase64Url(existing.salt)` 与 `466` `decodeEnvelope(existing.verifier)` 在 `performUnlock` 内裸调；存储被篡改时二者分别抛 `EncryptedDecryptError {code:'malformed_envelope'}`。文档契约（`keyring.ts:216`、`errors.ts:120-129`）规定 unlock 失败是 `EncryptedUnlockError`、存储格式问题是 `EncryptedConfigurationError`——从不抛 `EncryptedDecryptError`。
- 触发：salt 含非 base64url 字符（如 `!!!`）或 verifier 段数不对/非规范 base64 → 按 `EncryptedUnlockError` 分流「错误口令」UX/重试逻辑的调用方被错误类别误导；现有篡改测试（`keyring-verifier.spec.ts:123`）只篡改结构合法的密文，此路径无覆盖。
- 建议：`performUnlock` 内把 salt/verifier 两处解码 try/catch 后重抛为 `EncryptedUnlockError({code:'verifier_mismatch', cause})` 或 `EncryptedConfigurationError('invalid_key')`。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
