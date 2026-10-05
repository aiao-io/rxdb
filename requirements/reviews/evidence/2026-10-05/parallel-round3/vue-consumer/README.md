# R3-02 Vue tree：真实 tar / strict SFC / readonly 补证

日期：2026-10-05（Asia/Shanghai）。本文件是有界补证与归属判别，不新增问题编号，不替代主控去重，也不宣称全对象或发布就绪。

## 边界与测量来源

- 已读取 `/Users/jimmy/Documents/aiao/rxdb/AGENTS.md`、`/Users/jimmy/Documents/aiao/rxdb/.agents/skills/nx-workspace/SKILL.md`、原计划与 results。没有运行 Nx / build / unit / coverage / runtime / browser / provider 链路。
- 被测四包 `@aiao/rxdb`、`@aiao/rxdb-vue`、`@aiao/rxdb-plugin-tree`、`@aiao/rxdb-plugin-tree-vue` 均为 **0.0.26 真实 tar**，取自 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-setup.json` 指定的工作区外独立安装。507 个发布文件与已安装副本逐字节 hash 一致；没有改 tar、d.ts、依赖或 package manifest。
- 先检查已有工具：工作区与独立 consumer 均已有 `vue-tsc 3.3.12`；本轮零安装。实际执行独立 consumer 的 `vue-tsc`，配套 TypeScript `6.0.3`、Vue `3.5.43`、RxJS `7.8.2`、`@vue/language-core 3.3.12`、`@volar/typescript 2.4.28`、`@types/node 26.6.4`、Node `26.7.0`。真实工具位置与 hash 见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/toolchain.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/provenance.json`。
- 新夹具位于 `/var/folders/1s/1sk5kvms7jj4z6glj40__v300000gn/T/rxdb-r2-isolated-me20tptu/consumer/cases/r3-02-vue-consumer-9e7a67dd79c3`；所有业务 imports 使用公开包名，实体模型为普通消费端本地类，只有本地相对 imports。没有 workspace paths、源包 alias 或手工软链。现有 pnpm tar 安装链接未改。
- 真实 `.vue` 的 `<script setup lang="ts">`、模板、跨 SFC props/emits 均由 `vue-tsc` 编译，不以 `tsc` 或提取 script 代替 SFC。每个配置 `strict=true`、`skipLibCheck=false`、`noEmit=true`、`vueCompilerOptions.strictTemplates=true`；自写消费代码零显式 `any`、零抑制指令、零断言绕过。
- 16 次工具/编译调用全部走 `/tmp/rxdb-review-round3-locked.py` 的共享串行锁、指定三个 scopes，其中 14 次编译（9 初测 + 4 夹具修正复测 + 1 loaded-files），另 1 次版本读取、1 次配置解析。339 个 scope 输入在测量中及首尾无变化；HEAD 始终 `76a3848e2086f4617b80f7b1a1b896ef76e5719c`。

## 最终编译矩阵

| 测量 | 场景 | 退出状态 | 精确诊断 |
| --- | --- | --- | --- |
| invalid-template-bundler | 模板 emit 参数 / 不存在字段 / number 方法错误 | 2 | TS2339×2、TS2345×1 |
| invalid-inputs-bundler | 四 hooks 错误 id / 非树实体 / readonly 写入 / 错误结果与 level | 2 | TS2322×7、TS2345×4、TS2540×1 |
| invalid-parent-bundler | 父组件 rootId 与 selected handler 参数错误 | 2 | TS2322×2 |
| readonly-rules-bundler | core / tree / Vue UseOptions / 四 wrapper 默认 deep readonly 规则拒绝 | 2 | TS2322×3、TS2345×5 |
| doc-depth-bundler | 照发布 TSDoc 传 depth | 2 | TS2353×1 |
| valid-bundler | 真实 SFC 正例 + 正确 props/emit 父组件 | 0 | 0 诊断 |
| upstream-only-bundler | 仅引入 rxdb-vue 的 SFC，Bundler 对照 | 0 | 0 诊断 |
| upstream-only-nodenext | 仅引入 rxdb-vue 的 SFC，NodeNext | 2 | TS2834×7 |
| valid-nodenext | 同一有效 wrapper SFC，NodeNext | 2 | TS2305×4、TS2834×7 |

负例不是“只要非零就成功”：预先冻结目标行号/错误码，最终 **26/26** 个目标命中，Bundler 负例没有额外模块/ambient 错误。实际用户消费错误共 17 个；另 8 个契约限制对照、1 个文档错配。详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/case-expectations.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/diagnostic-matrix.json`；每项均带原始日志、命令、exit、输入 SHA 与串行锁 status。

`--listFiles` 正例再次 exit 0，实际包含 `Valid.vue` 与 `ValidParent.vue`，被测包分别加载 core 104、Vue 8、tree 11、tree-vue 2 份声明，**125/125** 与 tar hash 一致，工作区 packages 源码路径 0。详见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/resolved-declarations.json`。

## readonly：支持边界，不误报缺陷

真实公开声明锚点：

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-vue/dist/hooks.d.ts:19`：`UseOptions<T> = T | (() => T) | Ref<T> | ComputedRef<T>`，没有 `DeepReadonly<T>` 成员或接收任意深只读来源的承诺。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb/dist/repository/query.interface.d.ts:81–88`：`RuleGroupBase.rules` 为 **Array**，默认查询规则要求可变数组。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-plugin-tree/dist/repository/tree-repository.interface.d.ts:5–33`：默认 `FindTreeOptions<T>` 的 `where` 使用 `RuleGroup<InstanceType<T>>`；第二泛型 `WhereType` 是公开扩展点，本轮不覆盖其全部自定义槽位组合。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-plugin-tree-vue/dist/use-tree.d.ts:21/29/37/45`：四 wrapper 都原样接受实体对应槽位的 `UseOptions`，没有额外 deep readonly 承诺或单独收紧规则。

已通过的来源在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer/Valid.vue:19–43`：完整 mutable `Ref<FindTreeOptions>`、mutable RuleGroup 的 computed/getter/plain/reactive、只读 ref 容器 `shallowReadonly(ref<NumericOptions>(...))`、浅只读完整选项、窄标量深只读 `readonly(ref({ entityId, level }))`。窄标量深只读与浅只读容器覆盖四 hooks，返回实体/计数类型保留。

已按契约拒绝的来源在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer/ReadonlyRulesRejected.vue:18–27`：深只读嵌套 rules 先被直接 core `RuleGroup` / tree options 拒绝，继而 Vue `UseOptions` 与四 wrapper 拒绝；即使实际初值没有 where，显式标为完整 `NumericOptions` 的 deep readonly Ref 仍保留可选 where 的深只读类型，不能赋给默认 mutable RuleGroup。

**判别：不能把 R2 的 “valid.mts 失败” 宣称本 wrapper readonly 缺陷。** 那份正例把不在默认承诺内的完整深只读 options 当成有效输入，前提不成立；R2 日志不改、不冒称已通过。正确表述是“默认 deep readonly RuleGroup 不支持；浅 readonly 与窄标量 readonly 已支持且有 SFC 正证”。若要新增任意 deep readonly 支持，应先单独确定上游 rules 契约，不在本轮改业务或强转修复。

公开 tree-vue README 不承诺 deep readonly 输入；上游 README 只列直接值 / Ref / ComputedRef / getter。可建议补充 readonly 边界说明，但这只是说明改进，不是已证的违反承诺缺陷。

## NodeNext：上游阻断与级联，不给 wrapper 重复立项

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer/UpstreamOnly.vue` 仅 namespace import `@aiao/rxdb-vue`，Bundler exit 0 / NodeNext exit 2。NodeNext 七个 TS2834 全在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-vue/dist/index.d.ts:21/25/29/34/39/44/49`，分别是 extensionless `./hooks`、`./rxdb-vue`、`./useInfiniteScroll`、`./use-action`、`./use-persisted-state`、`./use-entity-change`、`./use-sync-state` 导出。
- 同一有效 wrapper SFC 在 NodeNext exit 2：相同七个 TS2834，另四个 TS2305（wrapper `use-tree.d.ts:3` 两项、消费 `Valid.vue:3` 两项缺失 `RxDBResource` / `UseOptions`），是上游 root re-export 不能解析后的级联。
- wrapper 自己 root 导出为 `./use-tree.js`，本轮没有独立 extensionless 错误。**确认上游发布声明 NodeNext 兼容阻断；本 wrapper Bundler strict 类型未见独立缺陷。** 不把 NodeNext 支持宣称通过；禁止修改上游声明下，本轮未证“上游修复后 wrapper 必通过”。

## 本 wrapper 的文档错配候选（主控去重）

`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:20`，及真实 tar `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-plugin-tree-vue/dist/use-tree.d.ts:18`，`useFindDescendants` 的 TSDoc 把选项写为 `entityId、depth`。公开 `FindTreeOptions` 真正字段是 `level`，README 示例也使用 `level`。

`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer/DocDepthRejected.vue:4` 照 TSDoc 传 `depth: 1`，exit 2 / 唯一 TS2353；有效 SFC 的 `level` 通过。**这是 TSDoc / 类型不一致（文档问题，建议 P3），不是函数错误拒绝 depth。** 最小后续动作是修正文档名；不新增 depth alias、不改运行行为。本轮只登记归属与复现，不新建编号主报告、不改源码。

## 首轮夹具错误已保留

初测正例有一个 TS2339：模板顶层 Ref 已自动解包，夹具却写 `upstreamScalar.value`。readonly 反例也因模板写 `full.value.entityId` 多了一处无关 TS2339，父组件反例因此额外引入有效子组件的模板错误。

`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/attempt1/consumer/`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/attempt1/provenance.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/matrix-exits.initial.json`、所有初测日志均保留。只把两处消费模板分别改为 `upstreamScalar.entityId` / `full.entityId`，不改变 hooks 输入、types、strict 或 skipLibCheck；四个受影响案例已用新唯一 lock name 重测。修改前后代码 SHA 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer-revisions.json`。不把夹具错误归为包缺陷，不隐藏首轮 exit 2。

## 原 C 核销建议与未验边界

| 原 C | 建议 |
| --- | --- |
| C1 | numeric/string id 与 level 字段的**编译子项**补证成立；实际 TreeRepository、缺插件、QueryCache 禁止、深树/lazy/SQL 未运行，仍 partial。depth 文档候选交主控去重。 |
| C2 | 没有运行移动/删除/全量一致性/晚到结果，原缺口不动。 |
| C3 | Vue 侧独立真实 tar **Bundler strict 消费编译子项**可核销；不是三端同一实际 tree fixture 或多实例链路，整体仍 partial。 |
| C4 | 仅 readonly/ref/computed/getter/reactive **输入类型**已核实，未验证依赖追踪、替换、深改、scope/unmount/provider，原动态缺口不动。 |
| C5 | 真正 SFC 正反、模板字段/方法、跨组件 props/emits 参数、readonly 支持/拒绝边界、真实 tar 字节来源可按 **Bundler/默认 options 契约**核销；NodeNext 由上游阻断，实体 identity / Vue proxy 运行断言未验，整体仍 partial。 |

原完整 C 仍 **0/5**，不改原最低场景，不将 NodeNext 失败改作不适用。未覆盖：上游修复后 NodeNext；自定义 WhereType/生成槽位所有组合；emit 返回类型（Vue 生成的 listener 目标返回类型仍可能显示 `any`，自写代码未使用它绕过 id 参数检查）；真实数据仓储与 provider、树更新/身份/代理、挂卸/SSR/水合、重复构建确定性、其它工具版本。

## 证据索引与复现

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/provenance.json`：tar/声明/消费代码版本与 hash、真实工具路径。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/toolchain.json`：执行 Node 与实际依赖解析路径。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/diagnostic-matrix.json`：每一目标行号/错误码/诊断/原始日志/status。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/measurement-summary.json`：26/26、16 次共享锁、源码及 staged diff 不变、质量边界。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/resolved-declarations.json`：125 份实际加载声明与 tar 对齐。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer/`：最终 `.vue` / model / tsconfig 完整源码；`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/attempt1/consumer/` 保留首轮。
- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/run-matrix.py`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/run-reruns.py`：本次精确锁调用追溯；重新测量要用新唯一 name，不能覆盖本次汇总。

正例复现命令（复跑时必须换唯一 name）：

```bash
python3 /tmp/rxdb-review-round3-locked.py --name vue-consumer/reproduce-new-unique-name --scope packages/rxdb-plugin-tree-vue --scope packages/rxdb-vue --scope packages/rxdb --cwd /var/folders/1s/1sk5kvms7jj4z6glj40__v300000gn/T/rxdb-r2-isolated-me20tptu/consumer/cases/r3-02-vue-consumer-9e7a67dd79c3 -- /Users/jimmy/.nvm/versions/node/v26.7.0/bin/node /var/folders/1s/1sk5kvms7jj4z6glj40__v300000gn/T/rxdb-r2-isolated-me20tptu/consumer/node_modules/vue-tsc/bin/vue-tsc.js --project tsconfig.valid-bundler.json --noEmit --pretty false
```

写集合只有本证据目录与 results 新增 R3 结算段；业务/依赖/旧 tests/index/staging 未改。staged diff SHA 首尾为 `f7acc6b41438590fd711c25438a3d2baa8a54a38f84a47e8a914a8f2d89dd52a`，最终写边界与 result 原前缀检查见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/write-fence.json`。
