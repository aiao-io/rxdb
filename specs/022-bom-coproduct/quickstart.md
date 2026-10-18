# 联产品实际验证记录

## 核心红、绿

2026-10-18，主会话先补可空份额列与produce枚举，再在真实Chrome运行SQLite/PGlite。39项初轮失败中38项为业务功能红；C13同库快照最初被测试库名55字节超过49字节挡住，不能记业务红。

生产接入与短库名修复后，首轮32/39通过：余下是4处produce错误归一丢失语义、2处错组织fixture错误修改了不可变归属列、1处PGlite实体没有回显规范份额。对应修复保留了全部业务拒绝断言，没有放宽存储规则。

主会话确认第二轮 **39/39通过**，包括SQLite/PGlite实际存储、发布与ECN，极大成本/最小份额/零份额/负成本golden，显式下游来源、跨库隔离和同库双连接读取快照。没有用PGlite单连接冒充并发测试。

## 导入、导出与消费方

`bom-coproduct-integration.spec.ts` 首轮真实后端16项中13失败、3通过，确认v2/依赖/拒绝行为的业务红。生产实现后主会话确认 **16/16通过**，同批共享视图/字段回归合计46/46。v1默认版本常量和位置字段保持；v2用独立dependencies声明必须预存的已发布输出主数据。导入不自动发布主数据，不使用历史装载旁路，也不放宽produce保存期约束。

`bom-coproduct-dataset.spec.ts` 先确认4/4因“共享联产演示种子尚未实现”失败，再由主会话确认 **4/4通过**。覆盖手写220/132/88/17.6、未选择来源拒绝与两个独立库逐字一致。

后续新增4条规范化并发编辑、旧持久库守卫升级回归，核心文件由39扩至43项。主会话执行核心与集成合计59项，58通过、1失败：仅SQLite保存期间的新份额被旧结果覆盖，PGlite同用例通过。持久守卫升级两后端已通过：同当前表结构植入同名旧守卫，先证明旧守卫真实阻止写入，再重连验证草稿、发布、改期、取消与已发布头份额不可改；不以静态字符串检查冒充升级通过，也不声称自动迁移旧表结构。

SQLite更新原先强制整行回填，现复用既有mergeQueryCache逐字段避让新编辑；数据库结果推进origin，尚未提交的新编辑继续保留patch。补SQLite仓储写入I/O期间修改两个字段的回归，并在C03验证份额及qty都回显规范串。另补双后端C05错误量纲/外物料修订/草稿修订/phantom修订、C09 precise锁版与imprecise新版本来源区分，核心共47项。主会话该轮确认 **47/47核心、16/16集成通过**，SQLite新编辑保留与双端qty规范回显均通过；同批另含16项存储声明回归，总79/79通过，日志 `/private/tmp/bom-storage-coproduct-green2.log`。SQLite仓储新增I/O用例所在文件另跑 **11/11通过**，日志 `/private/tmp/bom-sqlite-repository-green.log`，不混进47项核心计数。

随后只读审查确认保存期间撤回旧值仍有漏洞：份额原0.4→提交0.5→等待中改回0.4，当前patch相对旧origin为空，旧merge回填仍用0.5覆盖撤回。主会话实际确认联产49项中47通过、WA/PG各1失败，SQLite仓储13项中11通过、原字符串/null各1失败，红日志 `/private/tmp/bom-save-revert-red.log`、`/private/tmp/bom-sqlite-revert-red.log`。

修复在共同EntityStatus中按patch对象捕获本轮字段编辑代次，BOM仓储在异步验证前捕获，双端适配器仅更新回填使用该句柄；origin推进到已提交结果，之后的编辑、撤回原值/null及reset仍保留为下一次可保存差异。成功和失败均释放句柄，旧句柄不能清理同patch新尝试，普通查询继续原合并语义。主会话确认 **联产49/49**（`/private/tmp/bom-hot-replay-save-green.log`）、**SQLite仓储13/13**（`/private/tmp/bom-sqlite-revert-green.log`）、**EntityStatus69/69**（`/private/tmp/bom-core-save-state-green.log`）通过。联产日志同批共72项、另有5项热字段失败，不能把整批记为全绿；这5项不属于spec022的联产回归。最终affected中的完整core结果见本记录末节，其余领域与平台门禁继续由主会话收口。

独立BOM app面板与新增e2e已接入。主会话执行24条浏览器回归，**原23条全部通过**；新增联产场景出现真实功能红：SC-100已有字典要求物料提供rohs，联产种子没有填写，装载报BomExtAttrError。日志 `/private/tmp/bom-demo-all-green.log`，原23条用例文件未改。

对应修复新增调用方显式的 `loadCoproductDataset(adapter, { itemExt: { rohs: 'yes' } })`，演示按SC-100字典明确传值，loader不猜字典、不删字典、不走存储旁路。新增双后端必填字典回归：缺参数/非法枚举仍拒绝且未写物料，合法参数保存四个ext且保留132/88；种子套件从4扩至6项，主会话已确认 **6/6通过**。最终浏览器复验已通过，见下方24/24记录；故事整体已随最终统一门禁通过关闭为Done。

## 复现入口

```bash
pnpm nx run rxdb-plugin-bom:test --run src/__tests__/bom-coproduct.spec.ts src/__tests__/bom-coproduct-integration.spec.ts --coverage=false
pnpm nx serve dev-rxdb-bom
```

演示地址为 `http://localhost:4311`。在概览“重置并装载种子”，默认物料仍41条；进入成本卷算并点“装载联产演示”。选择JOINT-MAIN卷算，过程净成本应为220、两输出分配132/88、第二输出单位成本1.76/kg。选择JOINT-CONSUMER直接卷算应报来源未解析；手选JOINT-MAIN来源后应得17.6。刷新后再次卷算JOINT-MAIN，持久结果仍为220与132/88。

自动浏览器验收新增在`apps/dev-rxdb-bom-e2e/src/bom-coproduct.spec.ts`。主会话第三轮通过Nx执行最终demo **24/24通过（50.9s）**：新联产场景展示220→132/88并显式选择下游成本来源，原23条全部通过。证据为`/private/tmp/bom-affected-complete3.log`，此前rohs缺失的真实失败仍保留在本记录。J014/J015与US-513阶段B/C14功能验收据此关闭，故事整体现已随最终完整验收关闭为Done。

## 最终完整验收

最终完整affected EXIT0：86项目、351任务、324本地缓存、12m14（`/private/tmp/bom-affected-final-serial.log`）。三端共享51/51、demo24/24通过；Angular203/203（5.8m）、React199/199（5.5m）、Vue182/182有效缓存。最终首屏/输入p95分别1206/15.6、1105.2/42.2、796.3/9.5ms，均满足1500/100ms原预算，三端tree/editor均468px。

PGlite真实summary/final已从有效本地缓存恢复：13任务、12缓存、791ms，日志`/private/tmp/bom-pglite-final-coverage-restored.log`。严格8包官方coverage逐包执行8次全部EXIT0，证据`/private/tmp/bom-final-coverage-eight-packages.log`；SQLite/PGlite两条趋势软提示保留、均达门槛，baseline未改。早期仅评估rxdb一包的日志不作为8包证据。

本轮18条任务全部关闭，spec011～024共256/256完成，19条BOM故事、US-522 AC#1与US-030均Done。失败/控制历史、正式审计与最终结果见[最终验收](../021-bom-closure/closure-map.md)。
