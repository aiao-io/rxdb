

## R3-02：Vue tree SFC / readonly strict 消费结算（2026-10-05）

**有界补证完成，不新增问题编号；原 C 最低场景不改，完整 C 仍 0/5，整体 partial。** 已核实真正 `.vue`、模板与跨 SFC props/emits；没有运行仓储/identity/lifecycle，不用 SFC 编译替代运行证据。

### R3 被测来源与执行边界

- 四个被测包都是原独立 consumer 的 **0.0.26 真实 tar**，不是 source aliases 或工作区包软链。tar 507 个文件与已安装副本一致；编译实际加载 core/Vue/tree/tree-vue **104/8/11/2** 份声明，共 125 份，全部与 tar hash 一致，workspace packages 源路径 0。
- 先查已有 `vue-tsc`：独立 consumer 已有 **3.3.12**，本轮没有安装。实际 Node **26.7.0** / TypeScript **6.0.3** / Vue **3.5.43** / RxJS **7.8.2** / language-core **3.3.12** / Volar TypeScript **2.4.28** / node types **26.6.4**，位置、版本、工具文件与 tar hash 全部保存在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/provenance.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/toolchain.json`。
- `strict=true`、`skipLibCheck=false`、`strictTemplates=true`；真正 `vue-tsc --noEmit` 处理 `.vue`，不是 `tsc`/抽取 script。零自写 `any`/ts 抑制、零 type assertion 绕过、零 paths/手工软链。16 次调用全部使用指定 `/tmp/rxdb-review-round3-locked.py`、三个 scopes 的共享串行锁；只有一次轻量配置解析，不跑 Nx/build/unit/coverage。
- 339 个 scopes 输入首尾未变，16 次测量起止 HEAD 都为原 `76a3848…`，编译测量结束时 staged diff 仍与初始一致。收尾只读审计观察到外部并行提交推进 HEAD 至 `72d3bde0303f819b2c88e7fe18130fa231806f1b`、暂存快照变化；不是测量输入漂移，本代理没有执行暂存/提交或撤销外部变化。最终消费代码及修订前代码都保存，不修改 R2 证据。本 results 原前缀完整保留，只追加本段。

### R3 具体正反例与退出状态

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

**消费错误 17 个 + 默认 readonly 契约拒绝 8 个 + 文档错配 1 个，共 26/26 个预置目标诊断全部命中；Bundler 负例无额外模块/ambient 错误。** 正例验证四 hooks、numeric/string id、mutable nested rules、Ref/computed/getter/plain/reactive、浅 readonly 与窄标量深 readonly；返回实体/计数类型没有靠宽化绕过。完整目标行号/错误码/原始日志/status/输入 SHA 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/diagnostic-matrix.json`，代码在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer/`。

### R3 问题判别与归属（主控去重，不立新编号）

- **R2 readonly “正例”前提不成立，不确认为本 wrapper 类型缺陷。** 真实 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-vue/dist/hooks.d.ts:19` 的 `UseOptions<T>` 只列 T/getter/Ref/ComputedRef；`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb/dist/repository/query.interface.d.ts:81–88` 的 `RuleGroup.rules` 是 mutable Array，默认 `FindTreeOptions` 继承该契约。`ReadonlyRulesRejected.vue:18–27` 在 core、tree、上游 Vue 与四 wrapper 同样拒绝 deep readonly rules；完整 options 类型即便当前 where 未赋值仍会拒绝。相反 `Valid.vue:19–43` 的浅只读完整 options/ref 容器、窄标量 deep readonly ref 已通过。不能把“任意 deep readonly”支持偷换成已有承诺，也不能泛化为“所有 readonly 均不支持”。未覆盖所有自定义 WhereType/EntityStaticType 槽位。
- **NodeNext 失败是上游发布声明阻断。** 单独 `UpstreamOnly.vue` 不引入 tree wrapper，Bundler exit 0 / NodeNext exit 2，七个 TS2834 全指向 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-vue/dist/index.d.ts:21/25/29/34/39/44/49` 的 extensionless 导出。有效 wrapper SFC 在 NodeNext 是同七个 TS2834 + 四个 TS2305（wrapper声明两项、消费者两项缺 RxDBResource/UseOptions 的级联）；本 wrapper 自己 root 已导出 `./use-tree.js`。不重复立本 wrapper NodeNext 根因，不宣称修上游后必通过。
- **本 wrapper 确有一处 TSDoc 字段错配（文档候选，建议 P3）。** `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-vue/src/use-tree.ts:20` 和真实 tar `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/published/rxdb-plugin-tree-vue/dist/use-tree.d.ts:18` 写 `depth`；真实字段是 `level`，README 示例也用 `level`。`DocDepthRejected.vue:4` 照 TSDoc 传 `depth`，exit 2 / 唯一 TS2353，`level` 正例通过。归文档，不把正常拒绝未知字段宣称函数缺陷；本轮不改源码，不添加 depth fallback/alias。公开 README 没有 deep readonly 支持承诺，补充该限制只能列为说明改进。
- **首轮夹具错误未隐藏。** 正例起初模板对自动解包 Ref 多取 `.value`，TS2339 / exit 2；readonly 与父组件反例也受该无关模板错误影响。两处消费模板修正为直接取 entityId，四项新唯一 lock name 重测达预期，没有改 hooks/声明/strict。首轮源码/版本/hash/失败日志留在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/attempt1/`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/matrix-exits.initial.json`；修订记录 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/consumer-revisions.json`。

### 原 C 核销建议与保留缺口

- **C1**：numeric/string id、level 编译子项补证；真实树仓储、缺插件、QueryCache 禁止、深树/lazy/SQL 未验，仍 partial。文档候选由主控去重。
- **C3**：可核销 Vue 独立真实 tar 的 **Bundler strict consumer 编译子项**；不是三端同一真实 tree fixture/多实例实际仓储，整体仍 partial。
- **C5**：真正 SFC 正反、模板字段/方法错误、跨组件 props/emits **参数**、readonly 支持/拒绝边界与 tar 声明映射可按 **Bundler + 默认 options 契约**核销；NodeNext 保留上游阻断，实体 identity/Vue proxy 运行断言未验，整体仍 partial。
- **C2/C4**：不运行移动/删除/全量一致性/参数换代/销毁/晚到/provider，原动态缺口不动；响应式来源“类型可消费”不等于依赖追踪与生命周期正确。
- 额外未验边界：上游修复后 NodeNext、所有自定义 WhereType/生成槽位、emit 返回类型（Vue 生成 listener 目标可出现返回 any，但本轮没有使用它绕过 id 参数检查）、真实仓储/身份/代理、SSR/水合、重复构建确定性、其它工具版本。不要标全 C5 或全包通过。

完整证据入口：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/README.md`；结算与边界：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/measurement-summary.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/resolved-declarations.json`、`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/vue-consumer/write-fence.json`。本代理仅写证据和本段，没有改业务、依赖、旧 tests、index，没有执行暂存/提交；交付时的外部并行 Git 状态变化单独记录，未回退。
