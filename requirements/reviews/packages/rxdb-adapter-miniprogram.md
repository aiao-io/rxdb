# rxdb-adapter-miniprogram 深度评审

评审日期：2026-10-29；源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。更新轮核对：自基线 `7bb16a9` 至 HEAD 本包无源码变更。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：本次重点路径未发现新增确定包内缺陷；仍继承共享 SQLite 加密写入失败问题（P2）。三个平台共用 VFS 不能代表它们的真实运行时能力一致。2026-10-29 更新轮复核：自基线起本包无源码变更，抽查 VFS 脏块、配额映射、随机池上限、能力早失败与 loader 有限等待均与下表判断一致，本更新轮未发现新的确定问题。

| 评审重点             | 源码与符号                                                                                                                                                                                                                                                                                                       | 当前判断                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| adapter 与客户端注入 | [`RxDBAdapterWaSqliteMiniProgram`](../../../packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts)、[`createWaSqliteMiniProgramClient` / `MINI_PROGRAM_RUNTIME`](../../../packages/rxdb-adapter-miniprogram/src/create-client.ts)                                                              | 每库独立客户端，复用 WaSqliteClientBase，VFS 注册失败有清理         |
| 宿主能力与 wasm 加载 | [`resolveMiniProgramHost`](../../../packages/rxdb-adapter-miniprogram/src/host.ts)、[`assertMiniProgramHostCapabilities`](../../../packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts)、[`loadWaSqliteMiniProgramModule`](../../../packages/rxdb-adapter-miniprogram/src/loader.ts)                   | 能力缺失早失败；实例化失败与模块工厂竞争，避免无限等待              |
| VFS 数据与故障       | [`createMiniProgramFileVFS` / `createChunkedFileStore` / `writeFile` / `truncateFile`](../../../packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts)                                                                                                                                                        | 单文件/分块布局互斥，脏块记录、配额错误与恢复预留空间路径已抽查     |
| 运行时与随机源       | [`prepareMiniProgramHostRuntime` / `installSecureRandomPool`](../../../packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts)、[`getMiniProgramRuntimeSources`](../../../packages/rxdb-adapter-miniprogram/src/runtime-source.ts)                                                                           | 原生与 polyfill 来源可观测，随机池有大小/补充次数限制，无伪随机降级 |
| 平台差异与句柄回收   | [`createDouyinMiniProgramHost`](../../../packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts)、[`createAlipayFileSystem`](../../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-file-system.ts)、[`finalizeWaSqliteOpenStatements`](../../../packages/rxdb-adapter-miniprogram/src/statement-cleanup.ts) | 抖音分块布局、支付宝分帧与同步错误归一、JS statement 回收分别核对   |

## 问题清单与共享风险

新增独立确定缺陷：0。继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体归一化后的加密物理列以 `Id` 结尾时，共享转换层跳过加密；普通公开仓库会因解密回填失败而回滚，已证问题是合法列不可正常保存，未证普通保存后 VFS 留有明文。小程序的 JS polyfill 或文件分帧不修正该转换；修复应落共享内核，不在三个 host 中各写补丁。

**2026-10-29 复核：**继承的 SQLC-001 责任包报告已完成本轮复核、仍有效；本包记录的限制不变：随机池耗尽显式失败且由调用方重引导、`basename` 路径归一化是现有测试覆盖的约定，均不重新计为缺陷。本更新轮未发现新的确定问题。

## 已知约束

随机池耗尽时明确失败，重引导由调用方负责；这与静默回退非加密随机数不同，不作为缺陷。真机能力与构建验证的既有范围见 [README](../../../packages/rxdb-adapter-miniprogram/README.md) 及平台可行性文档，不把模拟 host 通过扩张为支付宝/抖音/微信全部真机可交付。

## 测试与后续计划

已定位 [`adapter.integration.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/adapter.integration.spec.ts)、[`chunked-file-layout.integration.spec.ts`](../../../packages/rxdb-adapter-miniprogram/src/__tests__/chunked-file-layout.integration.spec.ts)、loader、runtime-polyfills 与 host 差异测试。后续优先执行共享加密用例在 mini VFS 的实际字节扫描，再验证配额用尽、进程终止后热日志恢复、三平台真机重开。此次未启动开发者工具或真机，也未运行平台 e2e。

## 调用链交叉核查

对 `createChunkedFileStore.flush` 的逐块状态、配额释放预留与 `xSync/xClose` 错误映射作交叉走查；写块成功后才清对应 dirty 标记。`basename` 路径归一化是现有测试明确覆盖的约定，本轮不将它当成未支持目录命名的新 bug。未启动真机，未新增独立确定问题。

## 本次 Nx 校验

首轮（2026-10-28）`rxdb-adapter-miniprogram:test`：359 passed (359)；目标实际执行。命令及整体边界见[总索引](README.md)。
