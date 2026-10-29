# rxdb-client-generator 深度评审

包：`@aiao/rxdb-client-generator`。日期：2026-10-29。基线：`f62f77c19d55c73d8335df026778422282c2fed4`。

结论：**🟡凑合**。确认 1 条 P2。生成输出有 staging、manifest 和物理目录队列；多配置入口的物理路径校验却未复用同一判据。2026-10-29 更新轮复核：自基线起本包无源码变更，GENERATOR-001 仍有效，本更新轮未发现新的确定问题。

## 评审范围

阅读 [`loadConfig()` / `main()`](../../../packages/rxdb-client-generator/src/cli/cli.ts)、[`createAnalysisProject()` / 实体静态求值](../../../packages/rxdb-client-generator/src/cli/analyze-file.ts)、[`findFiles`](../../../packages/rxdb-client-generator/src/cli/find-files.ts)、[`buildClientLibrary()` / `writeOutputs()` / `resolveQueueKey()`](../../../packages/rxdb-client-generator/src/cli/build-client-lib.ts)、[`validateUniqueConfigOutDirs()`](../../../packages/rxdb-client-generator/src/cli/out-dir.ts)、[`rxdbClientGeneratorVitePlugin()`](../../../packages/rxdb-client-generator/src/plugins/vite.ts)，以及实体属性、关系、生成符号碰撞、ID 类型和元数据序列化路径，并对照消费者编译与输出隔离测试。

## GENERATOR-001 · P2：尚不存在的输出目录可经父目录软链绕过多配置唯一性校验

**证据**：`validateUniqueConfigOutDirs()` 的 `resolveConfigOutDirKey()` 仅在整个 `outDir` 已存在时调用 `realpathSync()`；不存在就返回词法绝对路径。`resolveQueueKey()` 则已经向上查找最近存在的祖先，因此相同物理输出目录会在构建阶段共用队列。两处判据不同，使入口接受了按其合同本应拒绝的重复配置。

**触发**：新建 `physical/` 目录及指向它的 `alias/` 软链，保证 `generated/` 尚不存在；给 Vite 插件或 CLI 两个配置：实体 Alpha 输出到 `physical/generated`，实体 Beta 输出到 `alias/generated`。

**预期 / 实际**：插件创建 / CLI 配置加载时应拒绝两个配置拥有同一物理输出目录。实际配置通过，两个构建成功；第二次写入读取第一次 manifest，认为 Alpha 的独有产物已陈旧并删除 / 替换，最终同一目录只剩 Beta 的客户端。目录预先存在时反而能正确拒绝，因此首次生成与后续生成行为不一致。

**验证**：对本基线公开 `dist/vite.js` 入口运行 Node 诊断，在临时目录创建两个最小 `@Entity` 文件和上述软链，真实调用 `rxdbClientGeneratorVitePlugin([...])` 及 `plugin.buildStart()`。断言插件未拒绝、生成后的 `index.js` 不含 Alpha 而包含 Beta；输出 `{"acceptedDuplicatePhysicalOutDirs":true,"hasAlpha":false,"hasBeta":true}`。诊断结束删除临时目录。

**影响**：多客户端首次生成时，进程正常退出却丢掉某个配置的产物。现有「父目录软链别名共用构建队列」回归只保证单次调用间的串行顺序，不验证多配置必须互斥的入口合同。

**改进**：抽出最近存在祖先的物理路径解析，供配置唯一性校验、构建队列和 watcher 统一使用。回归用 CLI `loadConfig()` 与 Vite 创建入口各验证「outDir 已存在 / 尚不存在」的父软链别名，均须在任何输出写入前拒绝。

**2026-10-29 复核：**仍有效。HEAD `f62f77c19d55c73d8335df026778422282c2fed4` 相对基线本包无源码变更：`resolveConfigOutDirKey()` 仍仅在整体 `outDir` 已存在时调用 `realpathSync()`，不存在即退回词法绝对路径；`resolveQueueKey()` 维持最近存在祖先的物理解析（RV-049）；CLI（`cli.ts` 归一后）与 Vite 插件两个入口都仍调用 `validateUniqueConfigOutDirs()`。首次生成经父目录软链别名绕过的行为与报告一致。

## 测试与边界

首轮（2026-10-28）`rxdb-client-generator:test` 通过：40 个文件、382 个用例；目标实际执行。提交阶段逐文件 rename 的中途 I/O 失败与跨进程并发属于源码已声明的限制，本次不重报。Windows 路径、大小写不敏感文件系统和真实 Vite watcher 关闭时序未实测。
