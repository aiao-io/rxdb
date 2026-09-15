---
id: US-217
title: 本地数据库一致性备份与恢复
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-09-15
updated: 2026-09-15
tags: [adapter, backup, restore, local-first]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖工作树 / commit graph；备份边界基于现有本地数据库
- [x] Negotiable: 归档布局和 adapter 接口在 plan 阶段冻结
- [x] Valuable: 用户可在不复制运行中数据库文件的情况下保存并恢复完整本地数据库
- [x] Estimable: 按 PGlite、SQLite 共享层、桌面 host 分阶段交付
- [ ] Small: 涉及多种存储引擎，按 A / B / C 分阶段，不拆子故事文件
- [x] Testable: 一致性、完整性、兼容性、加密与失败原子性均有独立 AC
-->

# 用户故事：本地数据库一致性备份与恢复

## 作为/我想要/以便

**作为** 使用本地适配器保存业务数据的应用开发者
**我想要** 生成可验证的数据库备份，并将其恢复到兼容的本地数据库
**以便** 在设备迁移、存储损坏或误操作后恢复完整数据库状态，而不必直接操作适配器的内部文件

## 现状与证据

Electron SQLite、Electron PGlite 与 Tauri SQLite 的故事均将数据库导入、导出、热备份和损坏修复排除在范围外：
[US-207](./US-207-desktop-local-database.md)、[US-208](./US-208-electron-pglite-data-directory.md)、
[US-210](./US-210-tauri-sqlite-local-database.md)。桌面文件存储的验收路径是退出应用后复制整个应用数据目录，
见 [US-504](../plugin/US-504-electron-local-file-storage.md) AC#3 与
[US-505](../plugin/US-505-tauri-local-file-storage.md) AC#3；这不是可由应用调用的一致性备份接口。

本故事只认领数据库快照与恢复，不把它称为完整应用备份。`rxdb-plugin-storage` 管理的外置文件内容不属于数据库归档；
调用方必须能识别该限制，不能在外置文件未备份时报告“完整应用备份成功”。

## 交付阶段

| 阶段 | 状态 | 交付                                                               | AC 区段   | 门禁                                                              |
| ---- | ---- | ------------------------------------------------------------------ | --------- | ----------------------------------------------------------------- |
| A    | ⬜   | PGlite 数据库快照格式、导出与恢复                                  | AC#1～7   | 同一兼容 PGlite 版本；不包含应用外置文件                          |
| B    | ⬜   | SQLite 共享层适配器（wa-sqlite / sqlite-wasm / sqlite / sqliteai） | AC#8～11  | 阶段 A 契约冻结；SQLite transaction / WAL 一致性通过共享 contract |
| C    | ⬜   | Electron / Tauri SQLite 与 Electron PGlite host                    | AC#12～15 | 对应 host 可建立一致快照；三 OS 桌面 smoke 全绿                   |

一个 PR 只交付一个阶段。未交付的适配器必须明确拒绝备份请求，不得回退成直接复制活动数据库文件。

## 范围边界

### In Scope

- 从已连接的本地数据库生成有版本、有完整性校验的数据库快照；快照以已提交事务边界为准。
- 保存恢复数据库运行所需的全部数据库状态，包括用户表、系统表、变更历史和适配器内部元数据；不把“只导出实体当前值”冒充完整数据库备份。
- 恢复到未连接且为空的兼容数据库；仅支持相同适配器族及明确兼容的引擎 / RxDB 版本。
- 对加密字段保持密文；归档不得包含密钥。恢复加密数据仍要求调用方提供原有可用密钥。
- 以流式或等效有界内存方式处理大型数据库；校验和格式校验失败时 fail-fast。
- 对尚未实现该阶段的 adapter 明确返回稳定错误，不静默降级。

### Out of Scope

- 不同 adapter / 数据库引擎之间的数据迁移、格式转换及 schema / change-codec 自动升级。
- 将备份合并进非空数据库、选择性恢复实体、JSON / CSV 导入导出。
- 远端权威适配器（HTTP / Supabase）及实验性微信小程序适配器。
- `rxdb-plugin-storage` 的外置文件本体、任意应用文件、整机 / 应用设置备份。
- 损坏数据库的自动修复；损坏或不完整归档只允许拒绝，不得猜测性恢复。
- 桌面任意路径授权、系统文件选择器和备份 UI；调用方提供受控的输入 / 输出流。

## 验收标准

|   # | 阶段 | 前置条件                                                                                                    | 操作                                                         | 预期结果                                                                                                   | 状态 |
| --: | :--: | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | :--: |
|   1 |  A   | PGlite 数据库含用户数据、关系及已提交的 RxDB 变更历史                                                       | 创建快照并恢复到新的空 PGlite 数据库，重启后读取             | 用户数据、关系、变更历史及后续同步所需的系统状态一致；快照不包含进行中的未提交事务                         |  ⬜  |
|   2 |  A   | 数据库含 `bigint`、binary、日期、JSON 与 nullable 字段                                                      | 创建并恢复快照                                               | 所有值按原 JavaScript 类型逐值相等；不得通过普通 JSON 序列化静默丢失类型                                   |  ⬜  |
|   3 |  A   | 有并发写入和多语句事务                                                                                      | 在事务提交 / 回滚期间创建快照并反复恢复                      | 快照对应一个已提交事务边界；不能包含半个事务，也不能遗漏该边界前已提交的数据                               |  ⬜  |
|   4 |  A   | 数据库 schema 含 `encrypted: true` 字段                                                                     | 创建快照并扫描归档字节，再用原密钥解锁恢复库                 | 加密字段哨兵明文与密钥均不出现在归档中；恢复后密文可用原密钥解锁并读回原值                                 |  ⬜  |
|   5 |  A   | 归档具备格式版本、adapter / 引擎标识、RxDB 版本、schema 指纹、system schema / change-codec 版本及完整性摘要 | 校验归档                                                     | 缺失或不匹配的必需元数据在写入目标库前被拒绝，错误稳定且指出不兼容项                                       |  ⬜  |
|   6 |  A   | 归档被截断、篡改或格式损坏；目标库为空                                                                      | 执行恢复                                                     | 抛稳定且可判别的错误；目标库保持为空且可重新初始化，不暴露半恢复状态                                       |  ⬜  |
|   7 |  A   | 归档有效，但目标库非空、已连接、adapter 族不同或版本不兼容                                                  | 执行恢复                                                     | 写入前 fail-fast；现有数据、连接和 adapter 状态完全不变                                                    |  ⬜  |
|   8 |  B   | SQLite 共享层 adapter 启用备份能力，数据库使用 WAL 或有在途写入                                             | 运行阶段 A 的快照 contract                                   | 所有 SQLite 共享层 adapter 均取得一致快照；不得直接复制活动数据库主文件而漏掉 WAL 中已提交的数据           |  ⬜  |
|   9 |  B   | 某 SQLite 共享层 adapter 未实现快照能力                                                                     | 调用备份入口                                                 | 抛稳定的 unsupported-capability 错误；不执行文件复制或产生看似成功的归档                                   |  ⬜  |
|  10 |  B   | 大型数据库通过受限内存流导出 / 恢复                                                                         | 运行备份与恢复                                               | 峰值内存不随数据库总字节数线性增长；取消或流错误会明确失败，归档不会被标记为完整                           |  ⬜  |
|  11 |  B   | SQLite 共享层 contract 与适配器覆盖率门禁                                                                   | 对 wa-sqlite、sqlite-wasm、sqlite、sqliteai 执行对应阶段测试 | 共享语义全绿；适配器差异由显式能力表说明，不以跳过测试冒充支持                                             |  ⬜  |
|  12 |  C   | Electron / Tauri SQLite 或 Electron PGlite 桌面 host 已连接                                                 | 创建快照、退出进程、在兼容的新数据目录恢复并重启             | 打包产物中数据库状态可恢复；归档不依赖源应用数据目录仍存在                                                 |  ⬜  |
|  13 |  C   | 桌面数据库存在活动事务、WAL 或 host 侧文件句柄                                                              | 创建快照并检查归档                                           | 快照由 host 保证一致性；操作完成或失败后临时文件、事务和文件句柄均被清理                                   |  ⬜  |
|  14 |  C   | 桌面归档在 Linux、macOS、Windows 上生成并恢复                                                               | 运行三平台 packaged smoke                                    | 归档格式和恢复结果一致；不依赖开发机路径、未打包依赖或未授权文件系统访问                                   |  ⬜  |
|  15 | 任一 | 启用 `rxdb-plugin-storage` 且数据库记录引用外置文件                                                         | 请求数据库备份                                               | API / 文档明确报告数据库归档不含外置文件；若无法可靠表达该限制则拒绝并给出稳定错误，不报告完整应用备份成功 |  ⬜  |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 备份必须保留数据库内部状态，不能只用 `findAll()` 导出实体后重建；否则会丢失 `rxdb_change` 等恢复与同步语义。
- SQLite 快照必须包含 WAL 中已提交的数据；不得以「退出后复制主数据库文件」作为在线备份实现。
- 不在需求阶段锁定归档容器、压缩算法或公开方法名；plan 阶段比较 adapter 原生 snapshot 能力与统一流协议，并明确归档兼容策略。
- 加密字段按存储态密文备份；密钥生命周期仍由 [US-803](../future/US-803-local-encryption.md) 管理，归档不得导出 keyring secret。
- 新增公开 API 时同步 TSDoc、API baseline、类型兼容测试与覆盖率；核心包覆盖率按 90% 门槛，其他包按 80% 门槛。

## 实现文件

| 阶段 | 路径                                                                                                                                         | 职责                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| A    | `packages/rxdb-adapter-pglite/`                                                                                                              | PGlite 一致快照与恢复实现及 contract  |
| B    | `packages/rxdb-adapter-sqlite-core/`                                                                                                         | SQLite 共享快照契约与测试套件         |
| B    | `packages/rxdb-adapter-wa-sqlite/`、`packages/rxdb-adapter-sqlite-wasm/`、`packages/rxdb-adapter-sqlite/`、`packages/rxdb-adapter-sqliteai/` | SQLite 共享层接入与后端能力声明       |
| C    | `packages/rxdb-adapter-electron/`、`packages/rxdb-adapter-tauri/`                                                                            | 桌面 host 快照、恢复与 packaged smoke |
| 横切 | `requirements/api-baseline/`、`packages/rxdb-adapter-*/src/__tests__/`                                                                       | API 基线与跨 adapter contract         |

## References

- [US-207 Electron 本地 SQLite](./US-207-desktop-local-database.md) — 数据库导入、导出、热备份和修复的边界
- [US-208 Electron PGlite](./US-208-electron-pglite-data-directory.md) — PGlite 数据目录及被排除的备份范围
- [US-210 Tauri SQLite](./US-210-tauri-sqlite-local-database.md) — Tauri host 与单连接事务约束
- [US-504 Electron 文件存储](../plugin/US-504-electron-local-file-storage.md) — 外置文件与数据库的备份域边界
- [US-505 Tauri 文件存储](../plugin/US-505-tauri-local-file-storage.md) — Tauri 应用目录复制验证
- [US-803 本地字段级加密](../future/US-803-local-encryption.md) — 加密字段与密钥生命周期
