---
id: RV-002
title: Desktop SQLite 任意 SQL 可越出应用目录
status: Open
created: 2026-08-17
updated: 2026-08-17
pr:
---

# Review：Desktop SQLite 任意 SQL 可越出应用目录

## 问题

🔴 High。Electron 与 Tauri 都把 renderer 传来的 SQL 原样交给 SQLite，逻辑库名白名单只限制了
`open` 的主库路径，限制不了 `ATTACH DATABASE`、`VACUUM INTO` 等由 SQLite 再次打开文件的语句。
一旦 renderer 被注入，攻击面会从“读写当前应用数据库”升级成“以主进程权限读写任意可访问的
SQLite 文件，并在任意可写目录创建文件”，违反 US-207 AC#3/#4 与 US-210 AC#4/#5 的应用作用域承诺。

`parseDesktopHostRequest()` 只校验 SQL 长度和绑定参数，然后保留原 SQL
（[desktop-host-protocol.ts](../../packages/rxdb-adapter-desktop/src/desktop-host-protocol.ts#L443)）：

```ts
return { kind, sessionId: readSessionId(record), sql: readSql(record), bindings: readBindings(record) };
```

Electron 的 `NodeSqliteEngine.#runSingleStatement()` 直接 `prepare(sql)`
（[node-sqlite-engine.ts](../../packages/rxdb-adapter-desktop/src/node-sqlite-engine.ts#L335)）；Tauri 的
`Engine::execute()` 同样把切分后的语句交给 `rusqlite`
（[engine.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/engine.rs#L331)）。两端均未安装 SQLite authorizer，
仓库内搜索 `authorizer` / `SQLITE_ATTACH` / `setAuthorizer` 为零命中。

复验使用 `dev-rxdb-tauri:build-test-host` 生成的真实 Rust stdio 宿主：先在宿主根目录打开
`app.sqlite3`，再通过公开 `execute` 协议发送：

```sql
ATTACH DATABASE '/tmp/<outside>/escaped.sqlite' AS escaped;
CREATE TABLE escaped.proof(value TEXT);
INSERT INTO escaped.proof VALUES ('renderer-controlled');
```

宿主返回 `kind: "execute"`、`rowsAffected: 1`；随后从宿主根目录之外的文件读回
`renderer-controlled`。临时目录已在复验脚本退出时清理。Node `DatabaseSync` 也用同一语句独立复验通过。

## 根因

安全模型把“物理路径只由 host 解析”误当成了“SQLite 只能访问这条路径”。协议需要保留
`rawQuery()`/事务内 `execute()` 的 SQL 透传能力，但没有在 SQLite 自身的授权边界禁止文件级操作。
SQL 字符串长度与绑定类型校验解决的是协议资源上限，不是 SQLite opcode 权限。

## 修复方案

在两套连接创建时安装 SQLite authorizer，至少拒绝 `SQLITE_ATTACH` / `SQLITE_DETACH`，并实测拒绝
`VACUUM INTO`、扩展加载及其它能打开外部文件的 opcode；不要用正则解析 SQL。普通 DDL/DML、事务、
必要 PRAGMA 与 TEMP 触发器继续允许，保持 `rawQuery()` 的库内能力不变。

先补 Electron host 与 Rust host 的红测：通过公开协议尝试 `ATTACH` 读、`ATTACH` 写和
`VACUUM INTO`，断言稳定错误码、宿主根外没有新文件、已有外部 SQLite 字节未变。两端使用同一组
攻击样例，避免只封住其中一个宿主。

## 解决记录

已在 `local-db` 分支落地，等开 PR：

- 两端连接创建时安装 SQLite authorizer，拒绝 `SQLITE_ATTACH` / `SQLITE_DETACH`，不解析 SQL 文本：
  - Electron：`NodeSqliteEngine.#initialize()` 里 `db.setAuthorizer()`（`DENIED_ACTION_CODES`）
  - Tauri：`Engine::install_authorizer()` 里 `Connection::authorizer()`；`Cargo.toml` 的 rusqlite 加 `hooks` feature
  - 两处都在跑任何 SQL **之前**装，初始化自身也走同一条边界
- `VACUUM INTO` 无需单独规则：SQLite 让它走同一个 `SQLITE_ATTACH` 授权码，实测被同一条规则挡住
- 无需新增错误码：授权器拒绝返回 SQLITE_AUTH(23)，两端既有的结果码映射已把它转成稳定的 `permission_denied`
- 红测先行，两端同一组攻击样例：
  - `node-sqlite-engine.spec.ts` 的 `NodeSqliteEngine file scope`（5 例）
  - `engine.rs` 的 `denies_attach_*` / `denies_vacuum_into_*` / `still_allows_in_database_*`（4 例）
  - 断言稳定错误码 `permission_denied`、宿主根外无新文件、已有外部 SQLite 字节未变；
    另有非回归用例守住 DDL/DML/`BEGIN IMMEDIATE`/`PRAGMA journal_mode`/TEMP 通知触发器
- 验证：`rxdb-adapter-desktop` 927/927 通过，lint + build 绿；`cargo test --lib` 125/125 通过，clippy 无告警

### 未做

- 未封扩展加载：`enableLoadExtension` 两端都没开，默认即禁；没有可被 renderer 触达的开关，
  再加一条规则挡不住任何现存路径

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
