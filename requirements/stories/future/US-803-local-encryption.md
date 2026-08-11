---
id: US-803
title: 本地字段级加密 MVP
status: Done
priority: Medium
epic: epic-002-data-sync
created: 2026-05-10
updated: 2026-05-21
tags: [security, adapter, encryption, local-first, mvp]
---

## 用户故事：本地字段级加密 MVP

## 作为/我想要/以便

**作为** 在 Local-first 应用里存储敏感数据（个人记录、API 凭证、未上行的草稿）的开发者
**我想要** 通过实体 metadata 把指定字段标记为 `encrypted`，由本地适配器在持久化前自动加密、读取时自动解密
**以便** 攻击者拿到 OPFS / IndexedDB / PGlite 本地文件后无法直接读取敏感字段明文，而非加密字段的 Repository / 查询 / 索引能力一字不改

## 可行性评审结论

✅ **值得做，按 MVP 交付**。范围一旦扩到「整库加密 + passkey + native keychain + audit log + 性能门槛」立即变成不值得，必须拆。

**可行性等级**：中风险可行。源码盘点结果比初版更乐观——

| 验证点                                     | 现状                                                                                                                                                                                               | 含义                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| SQLite core 与 PGlite 是否共享转换点       | **是**。两边都有同名 `transformEntityValueToSql()` / `getEntityObjectFromResult()`；insert / inserts / update / mutations / transaction result / Repository `addQueryCache()` **全部**走这两个函数 | 加 / 解密钩子收敛在每个适配器的 `utils.ts` 一对函数上，**不需要散点改 5+ 文件**                  |
| 表结构生成是否单点                         | 是，两边 DDL 都走 `PropertyType → column type` 单一 switch                                                                                                                                         | 列类型强制覆写也是单点                                                                           |
| `saveMany` / `mergeChanges` / `upsertMany` | 最终复用 `transformEntityValueToSql` + `getEntityObjectFromResult`                                                                                                                                 | 不需要给批量路径单独写转换                                                                       |
| undo/redo 历史快照                         | `packages/rxdb/src/version/HistoryManager.ts` 持有 materialized 实体快照                                                                                                                           | **初版漏列的泄漏面**：内存快照必须存 envelope 而非明文                                           |
| 系统变更历史表 `rxdb_change`               | `packages/rxdb/src/system/change.ts` 记录的 `patch` / `inversePatch`                                                                                                                               | **初版漏列的严重泄露面**：变更历史中的 JSON patch 必须深层脱敏，对应加密列数据转为 envelope 保存 |
| FTS5 / pglite tsvector                     | `packages/rxdb-adapter-sqlite-core/src/fts5/`、`packages/rxdb-adapter-pglite/src/fts/`                                                                                                             | **初版漏列**：加密字段绝不能进 FTS 索引，必须 schema 启动期硬拒                                  |

**收敛后的接入点**：

1. 共享核心包：crypto / envelope / keyring / errors / metadata 校验。
2. `packages/rxdb/src/entity/metadata-options.interface.ts` + `metadata-transition.ts`：加 `encrypted?: boolean` 与配置校验。
3. SQLite core / PGlite 各自 `*.utils.ts` 里的 `transformEntityValueToSql` 与 `getEntityObjectFromResult`：加 / 解密单点。
4. SQLite core / PGlite 各自的 DDL 列类型映射：`encrypted: true` 一律改为 `TEXT` / `text`。
5. FTS / search 注册路径：拒绝加密字段。
6. `HistoryManager`：快照阶段调用 envelope 序列化，不存明文。
7. `rxdb_change` 记录的 `patch` / `inversePatch` 单点拦截处理：每个适配器的 utils 双单点中深层遍历加密/解密对象叶子节点。

**不变目标**：开发者对非加密字段的 Repository / 查询 / 索引调用零修改。**任何**对加密字段做 where / order / index / FTS / join / groupBy 的尝试 = 配置错误，启动期 throw。

## 范围边界

### In Scope

- **新包** `@aiao/rxdb-adapter-encrypted`：共享 crypto / keyring / envelope / metadata 校验 / typed errors / test helpers。**不是 wrapper 适配器**，是被各适配器内部引用的工具包。
- **元数据**：属性基础接口加 `encrypted?: boolean`；不引入 `@Encrypted` 装饰器。
- **存储格式**：版本化文本 envelope，固定字段 `v / alg / kid / iv / ct / tag`。AAD 必含 `namespace + tableName + columnName + primaryKey + kid`。
- **算法**：WebCrypto AES-256-GCM，96-bit 随机 IV。默认派生 PBKDF2(SHA-256, 600k iters) + per-database salt；允许 app 传自定义 key provider。
- **列类型规则**：`encrypted: true` 字段无视逻辑类型，DDL 一律产出 SQLite `TEXT` / PGlite `text`。
- **覆盖适配器**：wa-sqlite + pglite 跑完整 contract；sqlite-wasm + sqliteai 通过 SQLite core 复用同一实现，至少 smoke。
- **覆盖写入路径**：Repository CRUD、`saveMany()`、`mergeChanges()`、`createTables(..., initialEntities)`、QueryCache `upsertMany()`、`rxdb_adapter_mutations()`，以及系统变更表 `rxdb_change` 行记录的写入。统一通过 utils 单点 → 一次接入全覆盖。
- **覆盖读取路径**：`getEntityObjectFromResult` 所有调用点、`addQueryCache`、`transaction_*_result` materialize、undo/redo 内存快照，以及系统变更表 `patch`/`inversePatch` 的解密。
- **密钥生命周期**：`unlock(passphrase | key)` / 显式 `lock()` / idle timeout 自动 lock。CryptoKey 仅留内存。
- **schema 启动期硬约束**（typed error，fail-fast）：加密字段不可作为主键 / 外键 / 索引列 / unique / sortable / computed 表达式输入 / FTS 字段（在 transition 阶段进行全交叉校验阻断）。
- **运行时硬约束**：查询的 where / order / projection / group / FTS 引用加密字段时，SQL 生成前 throw。
- **null 语义**：`null` / `undefined` 不加密、直接落 `NULL`；这是允许 of 泄漏，文档化。
- **明文泄漏扫描**：哨兵字符串扫描实体表、`rxdb_change`（深层遍历 `patch` & `inversePatch`）、QueryCache 对应表、持久化 dump、undo/redo 序列化快照。
- **benchmark**：create / find / batch 三档基线报告，不设硬门槛。

### Out of Scope

- 整库加密 / SQLCipher 风格 page-level hook
- passkey / WebAuthn 解锁因子
- 解密 / 写入 audit log、redaction 模式、`[encrypted]` 占位符
- Native keychain 集成（macOS Keychain / Windows DPAPI / libsecret）
- 跨端密钥同步、KMS、远端密钥管理、多 data key、共享解锁策略
- `@Encrypted` 属性装饰器语法糖
- 加密字段的 where / order / FTS / join / groupBy / aggregate
- 密文在线 rekey（key rotation 后批量重加密）
- 可搜索加密 / 同态加密
- 三框架绑定层适配（本故事不到 framework 层）

## 验收标准

> P = `wa-sqlite` ∥ `pglite`，参数化跑两遍；任一 P 不通过即本故事不通过。

| #   | 前置                                                                                                    | 操作                                                                                                                  | 预期                                                                                      | 状态 |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| 1   | P 启用加密；实体含 `encrypted: true` 字段，覆盖 string / number / boolean / date / json / keyValue 各一 | create / find / update / remove                                                                                       | Repository API 行为与未加密一致；解锁态下应用层拿到原始 JS 类型与值                       | ✅   |
| 2   | 同 #1                                                                                                   | 读取 `sqlite_master` / `information_schema`                                                                           | 加密字段列类型为 `TEXT` / `text`；非加密字段列类型保持原映射                              | ✅   |
| 3   | 写入含高辨识度哨兵明文的加密字段                                                                        | 扫描实体表、`rxdb_change`（含 `patch` / `inversePatch`）、QueryCache 表、OPFS / IDB / PGlite 持久化 dump              | 哨兵 0 命中；非加密列原文可读                                                             | ✅   |
| 4   | 同 #3                                                                                                   | 序列化 undo/redo 内存快照                                                                                             | 快照中加密字段为 envelope，不出现哨兵明文                                                 | ✅   |
| 5   | schema 把加密字段配为：主键 / 外键 / unique / 索引 / sortable / computed input / FTS 字段               | adapter / schema 初始化                                                                                               | 启动期抛 `EncryptedConfigurationError`，错误信息点名违规字段与原因                        | ✅   |
| 6   | 运行时查询的 where / order / projection / group 引用加密字段                                            | find / count / repository 查询                                                                                        | SQL 生成前抛 `EncryptedQueryError`；不发出 any SQL                                        | ✅   |
| 7   | 仅用非加密字段查询                                                                                      | find / count / update                                                                                                 | 结果正确；EXPLAIN 显示非加密索引仍命中（不退化为全表扫描）                                | ✅   |
| 8   | 密钥未解锁                                                                                              | 读 / 写加密字段                                                                                                       | 抛 `EncryptedLockedError`；不返回密文 / 占位符；实体缓存不被半更新                        | ✅   |
| 9   | 主动 `lock()` 或 idle timeout                                                                           | 后续读 / 写加密字段                                                                                                   | 内存 CryptoKey 已清；行为同 #8                                                            | ✅   |
| 10  | 错误 passphrase；或被篡改的 envelope（含 AAD 中 columnName / primaryKey 被换）                          | 读加密字段                                                                                                            | 抛 `EncryptedDecryptError`；不静默吞错；半结果集不进 QueryCache                           | ✅   |
| 11  | 同 #1 fixture                                                                                           | `saveMany` / `mergeChanges` / `createTables(..., initialEntities)` / `upsertMany` / `rxdb_adapter_mutations` 各跑一遍 | 落库全为 envelope；读取全为明文；批量分块逻辑（SQLite bind 上限）在 envelope 变长后仍正确 | ✅   |
| 12  | 加密字段值为 `null` / `undefined`                                                                       | 写入并读回                                                                                                            | 落库 `NULL`；读回 `null` / `undefined`；无 envelope 包裹；与 metadata `nullable` 语义一致 | ✅   |
| 13  | 加密字段是 `json` / `keyValue`                                                                          | 写入嵌套对象后读回                                                                                                    | 整体作为一个 envelope；不对 JSON 子字段单独加密；类型还原正确                             | ✅   |
| 14  | 共享 contract tests                                                                                     | 在 wa-sqlite + pglite + (sqlite-wasm / sqliteai smoke) 上跑                                                           | 非加密实体测试零回归；加密实体 CRUD / locked / 篡改 / 泄漏检查全通过                      | ✅   |
| 15  | benchmark 套件                                                                                          | create / find / batch 基线                                                                                            | 输出加密 vs 未加密对比报告（write/read 延迟、批量吞吐），归档供后续门槛故事引用           | ✅   |
| 16  | AAD 安全边界（密文调包攻击）                                                                            | 将 A 行密文 envelope 手动复制替换至 B 行对应列中                                                                      | 解密链路必须抛出 `EncryptedDecryptError`，拒绝解密，杜绝重放调包                          | ✅   |

## 技术笔记

- **架构定调**：放弃 `createEncryptedAdapter(inner)` wrapper 方案。两个适配器的 utils 单点已能覆盖所有路径；wrapper 反而引入 Comlink / worker boundary 与重复转换问题。改成「共享核心包 + 适配器内 utils 单点接入」。
- **每个适配器只改一对函数 + 拦截系统历史变更表的 JSON patch/inversePatch 路径**：
  - 写：`transformEntityValueToSql(metadata, entity)` 按 `encryptedPropertyMap` 替换值为 envelope 字符串。若持久化目标是系统历史表 `rxdb_change`，则深层遍历该系统表的 `patch` & `inversePatch` 对象，自动对涉及加密实体的已加密列进行二级 envelope 包裹。
  - 读：`getEntityObjectFromResult(metadata, columns, row)` 按 `encryptedPropertyMap` 把 envelope 解码回 JS 元值。若是 `rxdb_change`，则深层解码 `patch` & `inversePatch` 以便上游还原正确的类型明文，确保内存中还原快照的正确。
- **metadata 校验放在 `metadata-transition.ts`**：构建 `encryptedPropertyMap` 同时拒绝所有非法组合（pk / fk / index / unique / sortable / computed / FTS）。schema 阶段失败 = 永远不会污染数据。
- **AAD 必须绑定 `columnName + primaryKey`**：防止把 A 行 envelope 复制到 B 行；测试 #10 必须覆盖。
- **SQLite bind 上限**：999 参数限额按列数算，加密不增加列数，只增加单参数体积。建议加 smoke：1k 行 × 1KiB 加密字段的 `saveMany` 不应失败。
- **undo/redo 快照**：`HistoryManager` 当前持有 materialized 实体（明文）。两条路：(a) 增加 `serializeForHistory()` 钩子把加密字段重新包 envelope；(b) 改 HistoryManager 改持有 raw row。MVP 推荐 (a) 局部改动小，由测试 #4 兜底。
- **FTS5 / pglite fts**：在 FTS 注册函数中检查 `metadata.properties[col].encrypted === true`，命中即抛 `EncryptedConfigurationError`。
- **密钥派生默认参数**：PBKDF2-SHA-256 / 600k iters（OWASP 2023）/ 16-byte salt。salt 存独立 keyring 表，密钥本身永不落盘。
- **明文泄漏扫描 helper**：放 `packages/rxdb-test/`，遍历用户表 + `rxdb_change*` + QueryCache 表 + history serialized blob，正则匹配哨兵。
- **性能策略**：本故事只给 baseline；如果加密 overhead > 30% 再开新故事讨论 batched encrypt / WebCrypto 优化。

## 拆分顺序（建议执行）

1. 红测试夹具：metadata 校验 / DDL 列类型 / locked / wa-sqlite 哨兵扫描 / FTS 拒绝 / undo 快照。
2. 共享核心包：crypto + envelope + keyring + typed errors + metadata 校验 + test helpers。
3. SQLite core 接入：DDL + utils 双单点 + FTS 拒绝 + history serialize 钩子 → 跑 contract。
4. PGlite 接入：DDL + utils 双单点 + fts 拒绝 → 跑 contract。
5. 哨兵扫描 + benchmark 基线报告。

## 后续拆分

- 故事 B：整库加密 backend 调研与 PoC（SQLCipher / page hook）
- 故事 C：passkey / WebAuthn 解锁因子与多 data key
- 故事 D：审计日志 + redaction + 合规策略
- 故事 E：密钥轮换在线 rekey
- 故事 F：性能门槛与 batched encrypt 优化（基于本故事 benchmark 数据）

## 实现文件

新增：

- `packages/rxdb-adapter-encrypted/src/{index,crypto,envelope,keyring,metadata-validation,errors,test-helpers}.ts`

修改：

- `packages/rxdb/src/entity/metadata-options.interface.ts` — 属性基础接口加 `encrypted?: boolean`
- `packages/rxdb/src/entity/metadata-transition.ts` — 构建 `encryptedPropertyMap` + 启动期硬约束校验
- `packages/rxdb/src/version/HistoryManager.ts` — 快照序列化复用 envelope，不存明文
- `packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts` — `transformEntityValueToSql` / `getEntityObjectFromResult` + DDL 列类型分支
- `packages/rxdb-adapter-sqlite-core/src/fts5/` — 注册时拒绝加密字段
- `packages/rxdb-adapter-pglite/src/pglite.utils.ts` — 同上对应改动
- `packages/rxdb-adapter-pglite/src/fts/` — 同上对应改动

测试 / 基线：

- `packages/rxdb-test/` — 加密 fixture + contract suite + sentinel 扫描 helper
- `benchmarks/` — create / find / batch 加密 baseline 报告

## 依赖

- US-201 / US-202 / US-204 / US-205（底层本地适配器）
- 不依赖三框架绑定

## 参考

- [Epic: 数据同步与协作](../../epics/epic-002-data-sync.md)
- [README 路线图 · 阶段 2](../../../README.md#阶段-2协作--安全约-812-周)
- OWASP Password Storage Cheat Sheet（PBKDF2 参数）
- WebCrypto `SubtleCrypto.encrypt({ name: 'AES-GCM', iv })` 规范
