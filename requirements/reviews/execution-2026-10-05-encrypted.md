---
kind: review-execution
created: 2026-10-05
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
execution: partial
---

# 2026-10-05：加密适配器、密钥环与实际后端联审

以客户端 Asia/Shanghai 日期登记。新增 **[RV-058](RV-058-cancelled-first-unlock-persists-abandoned-key.md)（P2）**，更新 encrypted /sqlite-core /Electron /PGlite 四包记录。全仓仍为 70 对象、0 个全对象深审完成；不是密码学安全认证或所有后端完成。

## 1. 实际核查

- C1：区分字段/历史 patch 的信封与仍明文的主键、元数据、singleton salt/kid/verifier；加密不等于所有数据库字节、内存实体、日志、工作树与备份都已匿名。完整历史/备份/同步敏感路径仍未穷举。
- C2：真实源是 WebCrypto AES-GCM、随机 IV、固定 tag 配置；v2 AAD 绑定 database/entity namespace、表/列/主键类型/kid，使用长度前缀，v1 实体读需明确 migration。已有基线覆盖跨行/列/域、不规范信封与错误 key；不把“用了 AES”当完整安全保证。
- C3：沿 unlockQueue→provider/KDF→verifier→singleton write→epoch→内存 key 发布追踪；已有内存锁定与在飞 encrypt/decrypt 守卫，不误报“没有取消保护”。确认缺的是首次持久写之前的取消边界，真实后端也复现。
- C4：序列化 string/number/date/boolean/BigInt/binary/JSON 与 patch 路径已读；严格数字/结构反序列化、null/非加密字段保留。观察到 patch helper 的非字符串保留，继续对照实际行解码：sqlite-core 加密非空列已要求字符串信封，不能仅凭 helper 就宣布所有行可绕过认证。
- C5：metadata 的加密主键/索引/FK/FTS/computed 拒绝、逻辑/物理别名、查询排序/投影/group/关系解析已追踪；无法可靠解析的跨层路径 fail-closed。完整生产查询/未知类型矩阵仍未核销。
- C6：本轮实际覆盖 Node Keyring/native SQLite memory binding、Electron 文件 SQLite 及 Chromium/PGlite memory。没有运行 Tauri、小程序、OPFS/sqliteai、所有加密备份/工作树或 UI。

## 2. 已确认意见与正常反证

RV-058：A provider 尚未返回就 lock，A 的最后内存发布被阻止，但废弃 A 已占用真实 singleton；B verifier_mismatch。三个测量面各 2 failed /1 passed，共 6 failed /3 passed。对照为正常已建 A 时 B 必须拒绝、A 可重开；不把它们说成错误，不让新 B 覆盖合法旧凭据。

## 3. 实際执行

| 测量                                 | 结果                                        | 证据                                                                                                                                    |
| ------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| encrypted 原整包基线                 | 14 files /274 passed                        | [日志](evidence/2026-10-05/encrypted/encrypted-baseline.txt)、[退出码](evidence/2026-10-05/encrypted/encrypted-baseline-status.json)    |
| 原 Keyring + native SQLite 接口      | 2 failed /1 passed                          | [先行复验](evidence/2026-10-05/encrypted/cancelled-first-unlock-probe.txt)                                                              |
| Electron/PGlite 原 encryption facade | 各 2 failed /1 passed                       | [最终聚焦](evidence/2026-10-05/encrypted/final-native-cancel-probes.txt)、[观测](evidence/2026-10-05/encrypted/final-observations.json) |
| encrypted 最终整包                   | 275 passed /2 failed /0 skip；原 274 条全过 | [日志](evidence/2026-10-05/encrypted/final-encrypted-all-tests.txt)、[逐例计数/JUnit](evidence/2026-10-05/encrypted/final-counts.json)  |
| 三项目严格 lint                      | 通过，max-warnings=0                        | [日志](evidence/2026-10-05/encrypted/final-three-project-lint.txt)                                                                      |
| 三项目 typecheck /依赖 build         | 通过，实际 23 个依赖任务                    | [日志](evidence/2026-10-05/encrypted/final-three-project-typecheck.txt)                                                                 |

所有动态结论禁本地/远端 Nx 缓存、串行/maxWorkers=1，coverage 关闭。首次后端复验重建依赖；后续聚焦跳过依赖仅在实际构建且生产源未变的前提下。PGlite 的首次 test 还执行已配置的 test-node 依赖，不据此声明完整 Electron/PGlite 整包都通过；历史红测试没有解除。

[resolved config](evidence/2026-10-05/encrypted/encrypted-project.json) · [版本/源码指纹](evidence/2026-10-05/encrypted/runtime-and-sources.json) · [当轮命令汇总](evidence/2026-10-05/encrypted/round-results.json)。core 初始基线未额外复制 JUnit，计数有当时原日志；最终 JUnit 中原 274 个非新 spec 案例全部通过，不伪造逐名基线交集证明。

## 4. 接缝和取证代码错误

- 第一复验是真实 native SQLite memory singleton 实现 + 原 Keyring/WebCrypto，只控制 provider 返回；不是全部适配器接线证明，所以另外跑了两条原 adapter facade。
- Electron 走原临时文件/host/client，仅 IPC 是进程内管道；PGlite 走 Chromium 的实际 memory 引擎。未验证 GUI、权限隔离、磁盘崩溃、发布包消费或应用用户链路。
- 首版 PGlite 测试误把 Keyring/SQLite facade 的 isInitialized 假设成 PGlite 的公开方法，导致第一例未进入产品断言；已改实际表 COUNT，再得到真实 initialized=true 的失败：[初次日志](evidence/2026-10-05/encrypted/native-cancelled-unlock-probes.txt)、[修正后](evidence/2026-10-05/encrypted/pglite-real-table-cancel-probe.txt)。不登记为 PGlite“缺方法”缺陷，不给它扩不存在的 API。
- 仅新增三份复验 spec 与评审文档/证据；不改业务、不改用户依赖/Cargo/benchmark、不操作暂存区、不自动提交。

## 交付前基线变化

评审开始于 `8b29b549`，交付复核时外部/用户提交使 HEAD 前进到 `658364ade64592691d81a517b57a4ef29a5fe805`，其中已包含本批部分复验与早期证据。已重新逐字节核对加密源、后端 binding/adapter 源及三份复验，摘要均未变化，因此保留原测量基线，不把旧日志改写成新提交执行记录。助手没有执行 git commit；报告与最后证据仍按本轮增量交付。

## 5. 继续项

1. singleton 提交与取消的原子协议、存储等待中 lock、两个首次初始化者、失败/关闭/重连与 A 恢复；修复后仍需保留已建库不同凭据拒绝。
2. encrypted 六个 C 专题仍未全量核销，尤其实际 working-tree/commit/backup 敏感路径、多后端查询和序列化回滚。
3. 加密覆盖率四项、本机全量 conformance、Tauri/其它浏览器宿主、独立 pack consumer、实际应用密钥 UI；不以本次基线自动给安全结论。

[交付校验](evidence/2026-10-05/encrypted/delivery-validation.json) 分开记录本地链接、源码指纹、原日志可跟踪性及显式范围格式/diff；没有将“发现一个问题”当成对象全部完成。
