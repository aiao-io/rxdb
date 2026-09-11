# `requirements/` 未完成需求评审 · 剩余项

- **范围**：以各 story YAML `status` ≠ `Done` 取样（[CONVENTIONS.md](../CONVENTIONS.md#状态定义)「story 的 YAML `status` 是状态**唯一真相源**」），不用 `status-overview.md` 等派生视图取样。命中 10 条，全部通读
- **复验方式**：主要事实断言逐条回源码 grep / 读符号；190 个文档内锚点用一次性 GitHub slugger 脚本全量扫（`missingFile=0 badLineRange=0 badHeading=1`）；行号锚点另抽验 14 处对照 HEAD
- **总体**：事实断言准确率很高 —— US-211 五条症状、US-024 全部前提、US-305 的 FR-030 阻塞、US-308 的 `switchBranch` 证据、US-906 六行证据、US-907 四条 `inherited_acs`，回源码全部属实。问题集中在**两类系统性缺陷**（证据锚点腐烂、过程叙述侵入正文）加 6 条具体缺陷

## 剩余工作与优先级

| 顺序 | 块                             | 影响面               | 值不值得                                                                |
| ---- | ------------------------------ | -------------------- | ----------------------------------------------------------------------- |
| ①    | 3 `TRANSFER_CANCEL` 缺陷无主   | 代码缺陷             | **必须**：真实未修缺陷，指派给一条已 `Done` 的故事，今天没有活着的载体  |
| ①    | 4 `dispose()` 的 Electron 半边 | 代码缺陷             | **必须**：同上，修了 Tauri 忘了 Electron                                |
| ②    | 2 US-905 的过程叙述            | 886 行文档           | **值得**：74% 正文违规，且已造成同文档内自相矛盾的 AC 状态              |
| ③    | 1 US-015 的 26 处行号锚点      | 全仓 27 处中的 26 处 | **值得**：抽验 14 处全错，含一次跨文件迁移；漂移非统一偏移，越晚修越贵  |
| ④    | 5 `epic-005` 派生视图过期      | 一段话               | **值得**，5 分钟：派生视图说「审计还没做」，epic 里那份审计留证已经补齐 |
| ⑤    | 6 US-906 卡在人工 AC           | 一条 AC              | **定，不是做**：并进 US-907，或去跑那一次                               |
| ⑥    | 7 US-306 标题锚点少一个连字符  | 一处链接             | 顺手                                                                    |
| ⑥    | 8 spec 计数腐烂                | 四处数字             | 顺手，改成不计数表述                                                    |

---

## 1. US-015 的行号锚点已系统性腐烂

全仓需求侧共 27 处行号锚点，**26 处在 [US-015](../stories/core/US-015-plugin-inject-dependency.md) 一个文件里**。链接检查器全绿（无越界），但抽验 14 处指向的符号**全部**已漂移：

| US-015 里的锚点          | 声称指向                                                             | 今天的真实位置                                                                                                             |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `plugin.ts#L234`         | `assertSupportedAdapter()`                                           | **换了文件** → `core/adapter-guard.ts` 的 `export const assertSupportedAdapter`；234 行今天是 `ready` getter 的 JSDoc `*/` |
| `plugin.ts#L237-L266`    | `install()`                                                          | 237 是 `}` 与 `constructor(rxdb, options?)`                                                                                |
| `plugin.ts#L469-L471`    | 历史死锁形状的注释                                                   | 该注释退到 `192`（「两边互等，只靠…绕开死锁」）；469 今天是 `#runInstall(scope)` 的 JSDoc 尾                               |
| `plugin.ts#L185`（两处） | `readonly inject = ['adapter:local']`                                | `196`                                                                                                                      |
| `plugin.ts#L190`         | `SearchPluginPhase` 已删的留证注释                                   | `201`                                                                                                                      |
| `plugin.ts#L224`（两处） | `public get ready()`                                                 | `235`                                                                                                                      |
| `plugin.ts#L725-L728`    | 自有属性探测                                                         | `Object.prototype.hasOwnProperty.call(db, 'searchPlugin')` 在 `753`                                                        |
| `RxDB.ts#L89`            | `#plugin_map`                                                        | `100`                                                                                                                      |
| `RxDB.ts#L299`           | `connected$`                                                         | `310`                                                                                                                      |
| `RxDB.ts#L531`           | `use()` 按工厂函数身份去重                                           | `#plugin_map.has(plugin)` 在 `576`                                                                                         |
| `RxDB.ts#L659-L666`      | `#set_adapter_connected()` 在 662、`#await_plugin_installs()` 在 666 | `727` / `731`                                                                                                              |
| `RxDB.ts#L740-L750`      | `#shutdown()` 在 740                                                 | `#shutdown()` 调用在 `805`                                                                                                 |

**漂移不是统一偏移**：`plugin.ts` 里一个锚点往后漂了 30 行、另一个指向的内容往前挪到了 192，说明文件被重构过。「全体加 N」修不回来。

另外 [US-015](../stories/core/US-015-plugin-inject-dependency.md) 第 61 行写成 `- [:234](…#L234) 构造期 assertSupportedAdapter() 校验**配置**里的适配器名` —— 链接文本是**裸行号**，正是 [CONVENTIONS.md 证据锚点](../CONVENTIONS.md#证据锚点) 里那个 ❌ 反面示例的形状。

规范自己写了后果：

> **锚点失效的真实代价不是「链接坏了」**，是读者停止复验、转而信任叙述。带错误前提的断言只要锚点没人点开，就能一路活到实现阶段。

**修法**：按优先级 1「符号名」重钉，行号只留导航。按 [CONVENTIONS.md 配套要求](../CONVENTIONS.md#证据锚点)「跨文件同类锚点一起改…修一处而不扫全仓，等于留下更难发现的错误」，一次扫完 `grep -rn 'packages/rxdb/src/RxDB.ts#L' requirements/` 与 `rxdb-plugin-search/src/plugin.ts#L` 两组。

**内容本身准确，不要一起改**：US-015 的阶段 A 确已交付 —— `RxDBPluginDependency`（`packages/rxdb/src/rxdb-plugin.ts`）与 `packages/rxdb/src/plugin/dependency-scheduler.ts` 都在，`requirements/api-baseline/rxdb.json` 已同步；「全仓唯一的 `inject` 是 search 的 `['adapter:local']`」与 workspace `#installPromise` 的 Out-of-Scope 判断也都复验属实。

---

## 2. US-905 的正文 74% 是被规范明令禁止的过程叙述

[US-905](../stories/future/US-905-tauri-native-devtools.md) 共 886 行，其中「阶段 1 harness 落地与三处实测发现」到「技术约束」之间约 652 行是：**发现 1～21** + **PR-C3 第一半/第二半** + **PR-C4 第一片…第五片** + 「证据落点（2026-08-31 快照）」。

[CONVENTIONS.md 过程留档的去向](../CONVENTIONS.md#过程留档的去向) 逐字列出的禁用形态 —— `已于 X 日关闭`、`复核/改判记录`、日期化演进叙述 —— US-905 全中：

- 21 条「发现」里 **19 条标了「（已修）」**。按规范「**纯过程（怎么走到这儿的）**：就地删除，git 历史就是记录」，或「**对后来者有价值的教训**：落进 `website/docs/migration/` 或对应实现的注释，需求正文只留一句当前结论」。
- `### 发现 7：AC#7 的 ✅ 高估了它的证据（2026-09-04 复核）` —— 字面就是「不写「第 N 轮复核」「X 月 X 日更正」这类演进叙述」禁止的东西。

**后果已经发生**：US-905 的「阶段 2 的 AC 覆盖到哪一步」一节写「AC#10 / #11 / #15 / #16 / #17 仍是 ⬜」，而同一文件后面的段落把 #15 改成 ⚠️、#17 改成 ⚠️、#10 改成 ⚠️。**同一份文档里并存互相矛盾的 AC 状态**，读者不通读到底就会取到错的那条。这正是「文档只写当前结论」要防的。

真正需要保留的只有两条 **未修** 缺陷（发现 9、发现 18），见第 3、4 块 —— 而它们恰恰都没有归宿。

AC 表本身内部自洽（阶段 1：5 ✅ #1#3#4#5#8 / 3 ⚠️ #2#6#7；阶段 2：7 ⚠️ + #11/#16 ⬜），与「交付状态」表头一致。缺陷只在叙述层。

**修法**：压到约 230 行 —— 保留「运行模型 / 两阶段与启动门禁 / 范围边界 / 验收标准 / 交付状态 / 技术约束 / 实现文件」，19 条已修「发现」删除或转 `website/docs/migration/`，两条未修的转成当前事实（不带日期、不带「随 C3」这类已经过期的排期承诺）。

---

## 3. `TRANSFER_CANCEL` 缺陷无主：接收方 US-904 已 `Done` 且不记载它

`DevToolsTransferManager.cancel()` 不等在途写入，`complete()` 等 —— 见 `packages/rxdb-devtools/src/v2/transfer.ts`：

```ts
async complete(payload: DevToolsTransferIdPayload): Promise<DevToolsTransferResult> {
  await this.#entries.get(payload.transferId)?.writes;
```

```ts
async cancel(payload: DevToolsTransferIdPayload): Promise<DevToolsTransferResult> {
  const entry = this.#entries.get(payload.transferId);
  ...
  await this.#settle(payload.transferId, entry, 'cancelled');
```

`cancel()` 全程没有 `await entry.writes`，取消时在途写入可能落下临时产物。**缺陷真实、未修**（`transfer.ts` 的 `complete` / `cancel` 两处对照即可复验）。

US-905 把修法指派给「US-904 的传输状态机」，但 [US-904](../stories/future/US-904-devtools-native-storage-contract.md) 的 YAML 是 `status: Done`，且**全文没有任何一处记载这条缺陷**。同一句指派也写进了 [status-overview.md](../status-overview.md) 的 US-905 行，把一条已关闭故事登记成待修方。

**结论**：这条缺陷今天没有任何活着的载体 —— 读 US-904 看不到它，读 status-overview 会以为它有人管。要么重开 US-904，要么单开一条 bugfix story 明确认领。

---

## 4. `DevToolsDesktopFilesystem.dispose()` 的 Electron 半边无主

US-905「发现 9」记录 `dispose()` 全仓零调用点，标「未修，随 C3」。C3 只覆盖了一半：

- **Tauri 侧已修** —— `apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts` 挂了 `pagehide → dispose()`
- **Electron 侧没有** —— `apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts`：

  ```ts
  const devtoolsFilesystem = createDevToolsDesktopFilesystem({ rootDir: DESKTOP_STORAGE_ROOT_DIR });
  ```

  该文件全文无 `dispose()` 调用（`grep -n "dispose" apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts` 零命中即可复验）。

「随 C3」已经过去，没有故事认领剩下这一半。与第 3 块同类：叙述里有主、事实上无主。

---

## 5. 派生视图与 YAML 冲突：`epic-005`

[status-overview.md](../status-overview.md) 的「类型系统演进」一节写：

> **八条故事已全部 Done，但 epic 仍是 `In Progress`——这是有意的。** 发布门禁有 6 条，条件 1（五条 bigint/binary 故事全 Done）已成立，条件 2～6 是发布动作与回归 gate，需要一次独立审计逐条留证后才能置 `Done`。

而 [epic-005](../epics/epic-005-type-system-evolution.md) 的 frontmatter 是 `status: Done`，且「发布门禁」一节已经补齐「六条门禁的留证（Epic 据此置 `Done`）」表 —— 条件 2～5 指向 `main @ 780c1ab` 的 Main CI run 33705764019，条件 6 指向三份 `website/docs` 文档。

**那次审计已经做完了，派生视图停在做完之前。** 按 [CONVENTIONS.md](../CONVENTIONS.md#状态定义)「出现冲突时以 YAML 为准并同步修复派生视图」，以及「派生视图…回答『现在』，不是『曾经』。**「已完成 / 已移出 / 已解除」的条目从正文移除**」，这段整段该删，故事清单保留。

---

## 6. US-906 卡在一条人工 AC，而 US-907 正是为吸收这类 AC 而生

[US-906](../stories/future/US-906-electron-devtools-developer-path.md) 是 `In Progress`，5 ✅ / 1 ⚠️，唯一未关的是 AC#2 的**人工半边**：按 README 跑一次 `nx dev` 流程并打开面板看一眼（机器半边已由 US-904 的 e2e 覆盖）。

[US-907](../stories/future/US-907-devtools-manual-regression.md) 的立项理由逐字是：

> 剩下四条 AC 的判据本身就是「人在真实 Chrome 里看」…把它们留在 US-904 里只会让一条 875 行的故事永远停在 In Progress。

同一 species 的问题，US-904 拆了，US-906 没拆。**要么把这条并进 US-907（它已经是「不改代码、只产出回归记录」的容器），要么就去跑那一次。**

---

## 7. US-306 一处标题锚点打不开

[US-306](../stories/collaboration/US-306-working-tree-commits.md) 引用 `epic-006#版本化域tracked-untracked`。真实标题是 [epic-006](../epics/epic-006-working-tree-commits.md) 的 `### 版本化域（tracked / untracked）`，按 GitHub slug 规则（小写 → 去标点 → 空格转连字符）得 `版本化域tracked--untracked` —— **双连字符**，US-306 少写一个。

全量扫过 10 条故事的 190 个锚点，坏的只此一处。US-306 的 `#raw-sql--adapter-直写的-bypass-门禁判定` 是**对的**（`raw SQL / adapter 直写的 bypass 门禁判定` 中 `/` 两侧的空格各贡献一个连字符），不要连坐。

---

## 8. 正文里的 spec 计数已腐烂，且同一指标在一份文档里有三个值

US-905 对 `dev-rxdb-tauri` 单测规模给了**三个互相矛盾的数**，按出现顺序：

| US-905 里的表述                       | 今天（`find apps/dev-rxdb-tauri/src -name '*.spec.ts' \| wc -l`） |
| ------------------------------------- | ----------------------------------------------------------------- |
| 「**21 文件 217 条**」                | 25 个 spec 文件                                                   |
| 「22 文件 222 条」                    | 同上                                                              |
| 「**24 文件 231 条**（原 22 / 222）」 | 同上                                                              |

前两个是被取代的旧值，第三个还带着 `（原 22 / 222）`——[CONVENTIONS.md](../CONVENTIONS.md#结论必须写出复验方式)「不保留被取代的旧结论」禁止的正是这个形状。三个都不对。

US-906 同类：「`devtools-*` 四份 spec **14 例全绿**」，而 `apps/dev-rxdb-electron-e2e/src/` 今天有 **9** 个 `devtools-*.spec.ts`（`capability-wiring` / `database-events-branch` / `extension-loading` / `mv3-feasibility` / `native-files-mutation` / `restart-persistence` / `session-rotation` / `settings-refusals` / `unsupported-scheme`）。

计数写进正文就必然腐烂。按 [CONVENTIONS.md](../CONVENTIONS.md#过程留档的去向)「**仍生效的约束 / 缺口**：写成当前事实 —— 不含日期」，改成「`apps/dev-rxdb-electron-e2e/src/` 下全部 `devtools-*` spec」这类不计数、可自行复验的表述。

---

## 逐条判定

| Story                                                                  | 状态        | 判定                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-024](../stories/core/US-024-pglite-querycache-row-contract.md)     | Backlog     | ✅ **模范**。90 行，前提全部复验通过，capability-matrix 缺口条目对得上；技术笔记里「首选抽到 `@aiao/rxdb`——『同一份』是靠单一实现保证，不是靠两份实现互相对齐」是正确取舍 |
| [US-907](../stories/future/US-907-devtools-manual-regression.md)       | Backlog     | ✅ 干净。四条 `inherited_acs` 与 US-904 AC#34/#38/#39/#42 逐字对应，源侧均有 `↗ US-907` 交接标记。一处提示见下                                                            |
| [US-211](../stories/adapter/US-211-multi-miniprogram-platforms.md)     | Backlog     | ✅ 五条「今天就能踩到的症状」全部属实，满足 [价值待证](../CONVENTIONS.md#价值待证) 的「病灶数 ≥ 抽象数」                                                                  |
| [US-305](../stories/collaboration/US-305-commit-graph-head.md)         | Backlog     | ✅ FR-030 阻塞属实（`requirements/migration-release.json` 的 `bridge.tag` 为 `null`）                                                                                     |
| [US-307](../stories/collaboration/US-307-restore-session.md)           | Backlog     | ✅ 表归属划得清楚（「本故事若需要给该表加列，MUST 走 US-306 阶段 B 的迁移路径，不得另建第二张会话表」），依赖声明精确到阶段                                               |
| [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md) | Backlog     | ✅ 前提复验通过：`VersionManager.switchBranch(branchId: string): Promise<void>` 确无 options 参数、无 dirty 检查                                                          |
| [US-306](../stories/collaboration/US-306-working-tree-commits.md)      | Backlog     | ⚠️ 仅第 7 块                                                                                                                                                              |
| [US-015](../stories/core/US-015-plugin-inject-dependency.md)           | In Review   | ⚠️ 第 1 块（26 处锚点腐烂）。内容本身准确                                                                                                                                 |
| [US-906](../stories/future/US-906-electron-devtools-developer-path.md) | In Progress | ⚠️ 第 6、8 块。六行证据全部复验通过（`createManifest(variant)`、`build-desktop-dev` target、`resolveDesktopDevExtension()`）                                              |
| [US-905](../stories/future/US-905-tauri-native-devtools.md)            | In Progress | ❌ 第 2、3、4、8 块。886 行需要压到约 230 行                                                                                                                              |

US-907 的一处提示：技术笔记用 `git worktree add ../rxdb-old v0.0.25` 建旧版产物，而该 tag **不是 HEAD 的祖先**（`git merge-base --is-ancestor v0.0.25 HEAD` 判否；仓库只有 `v0.0.24` / `v0.0.25` 两个 tag，均非祖先）。执行前需确认它仍代表「`main` 上最近一个已发布 tag」。

## 已复验为准确，不要再翻

US-024 全部前提及其 capability-matrix 条目 · US-305 的 FR-030 桥接判定 · US-015 阶段 A 的交付与 api-baseline 同步 · US-211 全部五条症状 · US-906 全部六行证据 · US-907 全部四条继承 AC · US-905 的 AC 表内部一致性 · epic-003 / 004 / 006 / 008 与其子故事的状态互洽 · `requirements/stories/adapter/miniprogram-platform-feasibility.md` 不存在是 US-211 阶段 A 未开工的正常表现，非缺陷。

`epic-008` 是 `Done` 而子故事 US-015 是 `In Review`，**不是矛盾** —— epic-008 与 status-overview 都显式裁决了这是稳态（阶段 B 已移出承诺范围，解锁条件 = 出现第一个 `plugin:*` 依赖声明）。一处轻度观察不算缺陷：`In Review` 按 [状态定义](../CONVENTIONS.md#状态定义) 是「代码已完成，等待审核或收尾」，这里被借用成「已交付一部分，其余无限期不排期」的长期停车位。状态集里确实没有这一态，文档也讲清楚了；若以后再出现同类故事，值得补一个状态而不是继续借用。
