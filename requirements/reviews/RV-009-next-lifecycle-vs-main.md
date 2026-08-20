---
id: RV-009
title: next-lifecycle 相对 main 的全量代码评审
status: Open
created: 2026-08-20
updated: 2026-08-20
pr:
---

# Review：`next-lifecycle` vs `main`

**判定：🟡 修完 #1 #2 可合并。** 这个分支要做的事——把散在各插件里的手写拆卸记账换成一个作用域原语——在设计上是成立的，实现也基本兑现了它承诺的语义。8 条 finding 逐条对着代码复核后全部成立（另有 2 条初判被推翻，已剔除）。真正卡合并的是 #1（原语的自释放死锁，已复现）与 #2（停机窗口有一条未设防的安装路径）。其余 6 条是文档与需求件的一致性问题，不影响运行时。

设计本身不需要返工。

## 范围

| 项                 | 值                                           |
| ------------------ | -------------------------------------------- |
| 分支               | `next-lifecycle`                             |
| 对比基线           | `main...next-lifecycle`                      |
| merge-base         | `c25f93b`                                    |
| 变更量             | 54 文件，+3469 / -554                        |
| 相对 `main` 提交数 | 16                                           |
| 工作区             | 干净                                         |
| 评审方式           | 6 个维度并行评审 + 逐条对抗性复核 + 本地复现 |

变更主体：

- 新增 `LifecycleScope` 原语（`packages/utils/src/lifecycle/`）
- `IRxDBPlugin` 契约改为 `install(scope)`，`destroy()` 转可选并进入废弃周期
- `RxDB` 引入连接纪元作用域 + 每插件子作用域，拆卸改为逆序串行
- 四个插件包（graph / storage / workspace / search）迁移
- 配套文档（`website/docs/plugins/authoring.md`、`migration/plugin-scope.md`）与需求件

## Findings

### 1. P1：`dispose()` 无重入保护，自释放 disposer 会死锁 —— ❗ 待修

[lifecycle-scope.ts:154](../../packages/utils/src/lifecycle/lifecycle-scope.ts#L154)

`dispose()` 用 `this.#disposeTask ??= this.#startDispose()` 缓存首次释放。当某条 disposer 自己调用 `scope.dispose()`，**且它后面还登记过至少一条**时：逆序循环先跑后登记的那条，在 `await registration.disposer?.()`（[:183](../../packages/utils/src/lifecycle/lifecycle-scope.ts#L183)）处挂起——这一挂起让 `??=` 完成了赋值，`#disposeTask` 指向本轮 in-flight 的 promise。循环恢复后跑到自释放那条，它拿到的正是这个 in-flight promise，`await` 自己 → 永久自锁。

本地复现（vitest，400ms 超时判定）：

```
>>> multi-entry outcome:   PENDING | state: disposing
>>> parent+child outcome:  PENDING | state: disposing
```

`state` 永久停在 `disposing`，`dispose()` 永不结算，且无恢复路径。

**单条登记的变体不会死锁**——此时重入的 `dispose()` 在 `??=` 右侧求值期间就跑完了，`#disposeTask` 还是 `undefined`，于是起了第二轮 `#runDispose()`，跑在已清空的清单上立即 resolve。这个差异很关键：只测单条登记会漏掉这个 bug（本次评审第一轮探针正是这么漏的）。

**当前无调用方触发**：仓库内所有 `LifecycleScope` 用法中，子作用域的 disposer 是 `() => scope.dispose()`，释放的是**另一个**作用域，安全。所以这是潜伏缺陷而非现网故障——但原语是要发布给插件作者用的，`acquire()` 里写一条「兜底把整个作用域关掉」的 disposer 是很自然的写法。

**修复**：`dispose()` 增加重入判定——正处在 `#runDispose()` 内部时不返回 in-flight promise（返回 no-op 或抛 `LifecycleScopeDisposedError`）；或在 TSDoc 明确禁止 disposer 调用自身作用域的 `dispose()`。`lifecycle-scope.spec.ts` 目前没有「disposer 内部释放本作用域」的用例，需补。

### 2. P1：`#await_plugin_installs` 未受 `#shutting_down` 保护 —— ❗ 待修

[RxDB.ts:965](../../packages/rxdb/src/RxDB.ts#L965)

`#shutting_down` 全文只有一处读取：[:434](../../packages/rxdb/src/RxDB.ts#L434)（`use()` 里）。而 `connect()` → `#await_plugin_installs` → `#install_one_plugin` → `#create_plugin_scope` → `#ensure_connection_scope`（`??=` 新建作用域）这条链完全没有判定。

失败序列：`disconnectAll()` 进行中，`#release_connection_scope()` 已把 `#connection_scope` 置空，但拆卸还在 await（慢 disposer）。此时应用调用 `use(B)`——B 进了 `#plugin_map` 但因 `#shutting_down` 为真没被安装，也就不在 `#plugin_install_promises` 里。紧接着对一个**尚无 pending 记录的适配器**调 `connect()`：`init()` 因 `#rxdb_initialized` 仍为真而早退，异步段走到 `#await_plugin_installs`，发现 B 缺记录 → 装它 → `#ensure_connection_scope()` 建出一个**本次停机永远不会释放**的新纪元作用域。B 还会在下一次 `init()` 被装第二遍，而 `install()` 明确没有幂等契约。

这正是 `#shutting_down` 的文档注释（[:114-124](../../packages/rxdb/src/RxDB.ts#L114-L124)）声称要防的场景——「`#ensure_connection_scope()` 建出一个脱离本次停机的新作用域」——只是这层保护没铺到 `connect()` 这条路径上。

同适配器的 `connect()` 不受影响（`#connect_promise_map` 返回缓存 promise），所以触发面窄，但不是不可达。

**修复**：把 `#shutting_down` 判定下沉到 `#install_one_plugin`（或 `#await_plugin_installs`）——停机在飞时跳过安装，交给下一次 `init()` 的 `#install_plugin`。

### 3. P2：`authoring.md` 的「双版本插件」示例在旧宿主上必崩 —— ⏭ 待修

[authoring.md:168](../../website/docs/plugins/authoring.md#L168)

示例签名是 `install(scope: LifecycleScope)`，函数体直接 `scope.acquire(/* … */)`，没有判空。但旧宿主（`main` 的 `#track_plugin_install`）调的是 `plugin.install()`，**零实参**——`scope` 是 `undefined`，`scope.acquire` 立即 `TypeError`。

这个示例存在的唯一目的就是「既要能装进旧宿主又要能装进新宿主」，却恰好在旧宿主上崩。同一段代码里 `destroy()` 写的是 `this.#scope?.dispose() ?? Promise.resolve()`，说明作者清楚 `#scope` 可能是 undefined，只是没把这个认识带到 `install()`。

**修复**：签名改 `install(scope?: LifecycleScope)` 并加判空分支，或显式给出旧宿主的 fallback 写法。

### 4. P2：`CONVENTIONS.md` 的词汇约定与 `zh-glossary.md` 互相矛盾 —— ⏭ 待修

[CONVENTIONS.md:168](../CONVENTIONS.md#L168)

新增的「中文注释词汇约定」一节写「哪些词要改（占坑→抢占、回呼→回调、惊动→唤醒）」，并指明 `zh-glossary.md` 是准绳。但 glossary 给的是相反的答案：

| 词   | `CONVENTIONS.md` | `zh-glossary.md`                                                                      |
| ---- | ---------------- | ------------------------------------------------------------------------------------- |
| 占坑 | → 抢占           | → 认领执行权（[:28](../zh-glossary.md#L28)，明确反对「抢占」）                        |
| 回呼 | → 回调           | → 回调 ✅ 一致                                                                        |
| 惊动 | → 唤醒           | → 通知订阅者 / 触发发射（[:31](../zh-glossary.md#L31)，明确反对「唤醒」暗示线程调度） |

三个词错两个，且错的方向正是 glossary 专门列出来要避免的译法。

**修复**：改为「占坑→认领执行权、回呼→回调、惊动→通知订阅者」。

### 5. P3：`workspace:syncChannel` 的 acquire 包了两步可抛错的获取 —— ⏭ 待修

[RxDBPluginWorkspace.ts:442](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L442)

```ts
scope.acquire(() => {
  const channel = new BroadcastChannel(`${dbName}_workspace_sync`); // 第 1 步
  this.#syncChannel = channel;
  this.#syncClientId = crypto.randomUUID(); // 第 2 步，也会抛
  return () => {
    /* … */ channel.close();
  };
}, 'workspace:syncChannel');
```

`crypto.randomUUID()` 抛错时（非安全上下文下 `crypto.randomUUID` 为 undefined，而 `BroadcastChannel` 仍然存在——HTTP 部署就是这个组合），setup 整体失败，这条不进清单，刚 new 出来的 channel 就没有任何人能关。

这违反的是本原语自己写在 TSDoc 里的规则：「一次 `acquire()` 只包一步可能抛错的获取」。讽刺的是同一个文件里紧挨着的两处注释（syncListener 拆分、entityEvent 逐条登记）都明确援引了这条规则——只有这里漏了。相比改造前的 `rollback(() => this.#syncChannel?.close())`，这是一处轻微退步。

**修复**：把 `const clientId = crypto.randomUUID()` 提到 `scope.acquire(...)` 之前（或至少提到 `new BroadcastChannel` 之前）。

### 6. P3：`repository(name, cfg, scope)` 的拒绝语义没有 RxDB 层用例 —— ⏭ follow-up

[RxDB.ts:388](../../packages/rxdb/src/RxDB.ts#L388)

代码是对的：写表这一步在 `setup` 内部，作用域非 `active` 时 `acquire()` 的 `#assertActive` 先抛，注册于是不发生。原语层的这条不变量由 `lifecycle-scope.spec.ts` 覆盖，但「插件拿着过期 scope 调 `repository()`」这个 RxDB 层集成点没有断言钉住。

**修复**：`RxDB.plugin-scope.spec.ts` 补一条——传已释放的 scope，断言抛 `LifecycleScopeDisposedError` 且 `#repository_config_map` 无新增。

### 7. P3：`epic-008` 的目标清单仍把 US-013 / US-014 标为未完成 —— ⏭ 待修

[epic-008-lifecycle-scope.md:129](../epics/epic-008-lifecycle-scope.md#L129)、[:133](../epics/epic-008-lifecycle-scope.md#L133)

两条 `- [ ]` 对应的 US-013 / US-014 都已是 `status: Done`，`status-overview.md` 与 `roadmap.md` 也按已交付统计。同一清单里 138 / 145 / 149 行的 `- [ ]` 是留给 US-016 等后续故事的，属正常未勾选。

**修复**：勾上 129 / 133 两行。

### 8. P3：迁移文档引用的错误串与实际不符 —— ⏭ 待修

[plugin-scope.md:89](../../website/docs/migration/plugin-scope.md#L89)

文档写 `disconnectAll()` 后 `db.searchPlugin.ready` 报 `plugin is not installed — …`。实际上 search 插件**没有**声明 `lifecycle: 'scoped'`，`#destroy_plugin` 会在释放作用域后再调它的 `destroy()`，把 `#phase` 置为 `'destroyed'`；而 [plugin.ts:137](../../packages/rxdb-plugin-search/src/plugin.ts#L137) 的 `const reason = this.#phase === 'destroyed' ? 'destroyed' : 'not installed'` 于是走 `destroyed` 分支。文档引的是另一条分支的文案。

同一代码块里 workspace 那条（`workspace plugin is not installed in the current connection epoch`）是准确的。

**修复**：把 search 那行改成实际的 `destroyed` 文案。

## 已确认通过

以下是评审中重点攻击但**未发现问题**的部分，记下来避免下次重复投入：

- **`LifecycleScope` 的核心语义全部成立**：三态单向推进、逆序串行释放、恰好一个错误原样重抛 / 多个走 `AggregateError`、释放幂等（成功与失败一视同仁返回同一 promise）、子作用域按登记位置释放、`#detachFromParent` 先于 disposer 执行、`getEntries()` 快照不抛错。除 #1 的自释放路径外，6 条独立探针（含并发 `dispose()`、句柄释放与 `dispose()` 竞争、disposer 内 `acquire()`）全部通过。
- **`@aiao/utils` 的依赖声明是对的**：四个插件都用 `import type`，但产物 `.d.ts` 里 `install(scope: LifecycleScope)` 会暴露这个类型，消费者需要它可解析——列进 `dependencies`（而非 dev/peer）正确。`workspace:*` 协议与 `rxdb` 自身一致。
- **`project.json` 的 `typecheck.inputs` 覆盖是有效的**：`nx show project rxdb --json` 确认 `inputs` 已解析为 `["default", "^production", {externalDependencies:["typescript"]}]`，Nx 也容忍 `"// inputs"` 注释键。`tsconfig.spec.json` 的 `src/**/*.spec.ts` 确实覆盖 `src/__tests__/contracts/plugin-scope-contract.spec.ts`，编译期契约门禁真实存在。
- **新增的 `scoped-install.ts` 测试助手被正确纳入**：`tsconfig.spec.json` 的 `src/**/__tests__/**/*` 覆盖它（能类型检查），vitest 只收集 `*.spec.ts`（不会被当成空套件）。
- **文档站接线正确**：`sidebars.ts` 新增的 `plugins/authoring` 与 `migration/plugin-scope` 两个 id 都有对应文件。
- **ESLint 的 3 条 warning 不是本分支引入的**：全在 `rxdb-plugin-search/src/__tests__/install-order.spec.ts:12-14`，`git show main:` 比对后与 `main` 逐字相同。附带记录一处既有不一致：`utils:lint` 跑 `eslint . --max-warnings=0`，而插件包只跑 `eslint .`，所以「零警告」铁律在插件包上没有实际门禁。

## 验证记录

全部在 Node 26.7.0 下执行（仓库 `preinstall` 硬性要求 ≥ 26）。

| 门禁                                       | 结果                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `nx run-many -t test`（6 个受影响包）      | ✅ 3990 passed（utils 902 / rxdb 2370 / storage 215 / search 228 / graph 182 / workspace 93） |
| `nx run-many -t lint`（6 个受影响包）      | ✅ 0 error，3 warning（均为 `main` 既有）                                                     |
| `tsc --noEmit`（逐包 `tsconfig.lib.json`） | ✅ 6 个包全部干净                                                                             |
| `nx affected -t typecheck --base=main`     | ✅ 48 个项目全部通过，无下游破坏                                                              |
| `src/lifecycle/**` 覆盖率                  | ✅ Stmts 100% (55/55)、Branch 100% (15/15)、Funcs 100% (17/17)、Lines 100% (45/45)            |

补充说明：

- `nx build` 不拦 TS 错误，所以类型验证是**单独**跑 `tsc --noEmit` 得到的，不是从 build 推断的。
- 下游消费面已查：`apps/dev-rxdb-vue` / `dev-rxdb-angular` 大量使用 `rxdb.storage.*` 与 `rxdb.workspace.*`。storage 的模块增强刻意保留 `storage: RxdbFileStorage`（非可选），所以这些调用点类型不变；断连后读到 `undefined` 的行为与改造前一致（旧 `destroy()` 同样 `Reflect.deleteProperty`），不是回归。
- `RxDBPluginStorage` 实例上的 `storage` 字段类型从 `RxdbFileStorage` 变为 `RxdbFileStorage | undefined`（`readonly` 字段改 getter），这是插件实例层的破坏性变更；仓库内无调用方，但对外应在迁移文档提一句。

## 值得肯定的部分

- **原语本身做得扎实**。语义边界都想清楚了并写进了 TSDoc：为什么 `#disposeTask` 缓存失败结果而不是重试（停机路径的防御性重复释放会吞掉首个真实故障）、为什么 `#startDispose` 里那个 `void task.catch()` 不能替换 `task`（会让「重复释放返回同一失败结果」失效）、为什么 `AcquireResult` 联合里故意没有 `Promise`（让「获取跨 await」在编译期就被挡下）。502 行的 spec 用宏任务追踪器区分了「串行」与「并发」，不是只测调用顺序。
- **宿主接线的推理链是完整的**。`#connection_release` 的存在理由（`init()` 是同步 API，失败回滚只能 `void` 掉释放 promise，而同步重试是被支持的路径）、`#discard_plugin_scope` 的 `(plugin, scope)` 身份守卫（`install()` 可能跨越一次断连重连）、`#unregister_repository` 的配置对象身份守卫（先装后卸的插件不该删掉后来者的注册）——每一处守卫都对应一个具体的失败序列，不是防御性编程堆砌。
- **`#destroy_plugin` 从 `Promise.all` 改成逆序串行是正确的行为变更**，并且注释交代了动机（搜索插件的索引建在工作区插件的实体上，并发拆卸会让后装的插件读到拆到一半的先装插件）。
- **测试按验收标准编号组织**（AC#1–AC#23），覆盖了重连换新作用域、停机窗口 `use()`、安装半途失败的回收、清理错误不覆盖安装错误、旧纪元回收不删新纪元映射等硬路径。这是本次评审能把大部分初判 finding 快速推翻的原因。
- **四个插件的迁移取向一致且有分寸**：workspace / storage / graph 声明 `'scoped'` 走纯作用域；search 是唯一保留 `destroy()` 的——因为它的 `#phase` 状态机描述的是**跨纪元**的实例可用性，不属于「本次连接产生的宿主改动」——这个判断是对的，并且文档里专门写了一节「部分迁移」解释它。

## 解决记录

- [ ] #1 `dispose()` 重入保护 + 回归用例
- [ ] #2 `#install_one_plugin` 补 `#shutting_down` 判定
- [ ] #3 `authoring.md` 双版本示例判空
- [ ] #4 `CONVENTIONS.md` 词汇对齐 glossary
- [ ] #5 `crypto.randomUUID()` 提到 acquire 之外
- [ ] #6 `repository()` 拒绝语义补 RxDB 层用例（follow-up）
- [ ] #7 `epic-008` 勾上 US-013 / US-014
- [ ] #8 迁移文档修正 search 的错误串
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
