---
id: ADESK-US-111
title: 完整备份恢复与存储健康
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-17
updated: 2026-11-17
tags: [desktop, storage, backup, data-safety]
dependsOn: [ADESK-US-106, ADESK-US-109, ADESK-US-110]
capabilities: [rxdb:US-217]
---

# 用户故事：完整备份恢复与存储健康

## 作为/我想要/以便

作为把成果保存在浏览器里的用户，我想备份文件、应用记录与偏好，能在新来源恢复，并看见真实的存储状态，以便更换浏览器、域名或遇到存储故障时仍能保住数据。

## 范围边界

### In Scope

- 一致备份包含桌面数据库、文件树、全部文件体、应用记录、系统偏好和种子标记；按数据版本与内容校验。
- 导出包总大小上限 256 MiB，避免浏览器内存无限增长；错误清楚说明，没有部分成功。
- 恢复到独立新数据库与文件目录；全部验证后原子切换活动存储。旧数据保留，失败和中断不覆盖它。
- 同版桌面跨 Origin 导入、损坏/截断/路径非法/重复项/超限/不兼容版本拒绝，另一页的数据变更保护。
- 真实空间估计、持久存储授权状态、OPFS 可用性与配额失败；First Aid 的结果来自真实检查。
- 抹掉磁盘卷与完整桌面数据的范围明确，取消、未保存保护、失败和中断恢复有验证。
- 文件体写入中断后的孤儿检查与修复、导入/复制的中断残留识别。

### Out of Scope

- 账号与自动云同步；浏览器清除站点数据后的无备份恢复。
- 远程应用在自己 Origin 下的数据、游戏 localStorage、终端运行时镜像和第三方账号凭据。它们不进入桌面备份，界面明确列出。
- 恢复其他 schema 版本的备份；先用匹配版本恢复，再走产品既有升级路径。备份包不冒充任意版本都兼容。

## 验收标准

| #   | 前置条件                                           | 操作                                                   | 预期结果                                                         | 状态 |
| --- | -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ---- |
| 1   | 中文、二进制、空文件、废纸篓、应用记录和偏好有改动 | 导出完整备份                                           | 同一数据库快照与相应文件体均在包里，范围、时间、版本和总大小明确 | ✅   |
| 2   | 备份时同页/其他页仍有活动                          | 导出                                                   | 文件变更与导出互斥，数据库是一次一致提交状态，不产生缺体的成功包 | ✅   |
| 3   | 新浏览器配置或不同 Origin                          | 导入同版备份并重开                                     | 文件字节、原位置、应用记录与偏好一致，目录与宿主文件操作可继续   | ✅   |
| 4   | 当前桌面已有数据                                   | 导入损坏、截断、路径非法、重复项、超限或版本不兼容的包 | 拒绝且当前数据库与文件体不变，明确错误，可重新选择               | ✅   |
| 5   | 恢复过程中写入失败或页面被终止                     | 重新打开并重试                                         | 活动存储仍为旧版本；临时目标可清理，不报告部分恢复成功           | ✅   |
| 6   | 多页同时存在或有未保存文档                         | 恢复/抹掉、取消保存协商                                | 不静默丢弃草稿；旧页不能污染恢复后的数据；取消不执行破坏性操作   | ✅   |
| 7   | 空间充足、配额不足、OPFS 不可用或 Worker 失败      | 查看健康、保存和重试                                   | 显示真实状态，旧数据与草稿保留，恢复存储后可重试                 | ✅   |
| 8   | 文件体与目录行写入被中断                           | 检查并修复                                             | 可识别孤儿与缺失体，不删除仍被引用的数据，失败不伪报健康         | ✅   |
| 9   | 抹掉磁盘卷或全部本地数据                           | 确认、取消、中断再启动                                 | 说明并遵守清理范围；抹掉意图可恢复执行，未纳入范围的数据保留     | ✅   |
| 10  | 键盘用户                                           | 备份、选择文件、恢复确认与失败路径                     | 可聚焦、命名、焦点约束与取消恢复均通过自动验收                   | ✅   |

## 验收证据

2026-11-17，`2a3e46183` 加本轮工作区。完整命令、产物标识、失败过程和成功复验见[证据目录 A03](../../evidence/2026-11-17/README.md#a03-完整备份恢复与存储健康adesk-us-111)。未发布。

- AC1–3：`backupStorage.exportsCompleteArchive`、`exportSerializesOtherTabWrites`、`binaryEmptyAndTrashRoundTrip`、`crossOriginRestoresRecordsAndPreferences`；不同 Origin 验证真实下载字节、废纸篓 Put Back、Notes 和外观。
- AC4：`rejectsDamagedArchive`、`invalidArchiveVariantsKeepData`；归档单测覆盖大小、路径、摘要、重复、父子冲突、版本和截断。
- AC5–7：`storageFaults.restoreFailureKeepsCurrentGeneration`、`workerFailureCanRetry`、`restoreInterruptionCleansTemporaryTarget`、`quotaFailureRetriesWithoutLosingData`、`opfsUnavailableIsVisible`；`backupStorage.oldTabKeepsDraftAndRejectsWrites` 与 `unsavedRestoreAndEraseCancellation`。
- AC8：`importInterruptionRollsBackBatch`、`duplicateInterruptionKeepsSource`、`firstAidRepairsOrphansAndPreservesReferences`、`firstAidRejectsDamagedReferences`。恢复前额外拒绝未完成磁盘状态，避免挂载时重建刚恢复的文件。
- AC9：`volumeEraseResumesAndKeepsAppData`、`fullEraseRecoversDamagedSelectionAndInterruption`，包含确认取消、坏指针、全部保留代际清理、无关 Origin 数据保留；旧构建升级与降级保护三组同步通过。
- AC10：`restoreKeyboardCancellation`、`backupControlsAccessible`、`eraseDialogsAccessible` 及完整 `a11y` 回归。只证明合成键盘与 axe，真实读屏仍按 US-108 保持人工待验。

web 1441 条单测与逐文件覆盖率、lint/typecheck、需求和脚本门禁通过。公共 sqlite-wasm 包 1086 条通过、26 不适用跳过；并发压力下的 7 条超时已由关闭浏览器文件并发的完整复验确认。

## 实现文件

- `aiao-desktop/apps/web/src/app/data/`
- `aiao-desktop/apps/web/src/app/services/`
- `aiao-desktop/apps/web/src/app/apps/disk-utility/`
- `aiao-desktop/apps/e2e/src/groups/`
