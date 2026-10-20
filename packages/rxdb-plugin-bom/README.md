# @aiao/rxdb-plugin-bom

BOM（物料清单）领域插件，提供修订、生效域、数量展开、成本卷算、变更与 ERP/MRP 集成。

## 能力

- **实体**：`BomItem`（`item`，主数据）/ `BomItemRevision`（`item_revision`，修订）/
  `BomHeader`（`bom_header`，挂修订、`draft`/`released`）/ `BomLine`（`bom_line`，逻辑行）/
  `BomLineOccurrence`（`bom_line_occurrence`，行发生项）。同一子件可挂多条逻辑行（多重图），
  同一逻辑行按日期 × 序列 × 批次的有效域交集排他，日期区间为半开 `[effectiveFrom, effectiveTo)`。
- **存储层触发器**（SQLite 家族与 PGlite 各一份，插件经 `adapter:local` 注入自动下发）：
  - 结构归属列创建后不可改（修订→物料、头→修订/类型/组织、行→头、发生项→行）；
  - 已发布修订除 `draft → released` 状态转移外不可改，发布要求 `effective_from` 非空；
  - 已发布头成员经 ECN 协议修改，发布、改期与取消均检查运行投影。
- **十进制值合同**（US-511 存储段）：全部十进制列（用量、损耗、阶梯边界、换算率、概率与等效量、
  分摊比例、联产份额、工时、费率、价格）以规范十进制串存取（≤ 34 位有效数字、无指数、无前导零、
  无尾随零）。仓储、整批导入与历史装载三个入口按同一张列 → 域表规范化并校验（指数写法的指数绝对值
  ≤ 6144；阶梯边界 15 位；概率 / 分摊比例 / 联产份额 `[0, 1]` 且至多 9 位小数；良率制损耗 `[0, 1)`），
  违约抛 `BomDecimalFormatError` 点名列与域；存储层格式与域触发器同口径兜底直连 SQL。
- **解析与计算**：`resolve` / `expandBom` / `whereUsed` / `explodeBom` 共用显式解析上下文；
  配置条件、序列与批次均进入 manifest。缺配置、配置冲突明确报错；多序列候选标记未解析。
- **配置与扩展属性**：特征、选项、布尔条件与依赖约束；三层 `ext` 按 `attr_def` 校验，
  属性查询按声明类型比较，缺字段与 null 等价。
- **导出与导入**：`exportBom` 在一个快照中读取展开结果与涉及的主数据，拒绝截断与未解析结构；
  `importBomDraft` 接受带 `kind` / `source_ref` 的记录数组，或导出的完整载荷。
  导入逐行报告诊断，任何失败整批回滚；成功头保持草稿，调用方显式发布。
- **实例追溯**：`BomInstanceNode` 保存一次安装的实际修订、序列/批次、父实例、来源与装拆区间。
  `expandInstance` / `whereUsedInstance` 查询实际事实与完整祖先路径；不随主数据改版重新解析。
  序列化物料必填序列号，同一序列号的安装区间不得重叠；换父/重装先截止旧区间再新增记录。
  来源发生项被引用后禁止删除，ECN 撤回/取消同样受保护。

## 使用

宿主在连接前注册对应适配器，并把适配器侧的 `BomRepository` 映射到 SQLite 的 `SqliteRepository` 或 PGlite 的 `PGliteRepository`（适配器 `options.repositories`）。漏注册时插件在 `connect()` 的安装期即报 `BomBackendCapabilityError` 并给出应注册的写法，不拖到首次读写。下列配置与宿主装配配合使用；完整装配见 [Angular 消费页](../../apps/dev-rxdb-angular/src/app/pages/bom-view.ts)。

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { BOM_ENTITIES, rxDBPluginBom } from '@aiao/rxdb-plugin-bom';

const rxdb = new RxDB({
  dbName: 'bom-app',
  entities: [...BOM_ENTITIES],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});
rxdb.use(rxDBPluginBom);
await rxdb.connect('wa-sqlite');

const context = {
  bomType: 'ebom' as const,
  orgId: 'factory-a',
  asOfDate: new Date('2026-10-16T00:00:00.000Z'),
  unit: 137,
  configSelection: { color: ['red'] }
};
const payload = await rxdb.bom.exportBom(context, { parentItemId: rootItemId });
const imported = await rxdb.bom.importBomDraft(records);

const actual = await rxdb.bom.expandInstance(rootInstanceId, {
  asOfDate: new Date('2026-10-17T00:00:00.000Z')
});
const trace = await rxdb.bom.whereUsedInstance({ lotCode: 'PACK-LOT-A' });
```

实例查询省略 `asOfDate` 时返回历史；指定时点按半开装拆区间筛选，根可无来源，子节点必须有来源。
实例与主数据分表，查询模块随实例 API 调用加载；`maxDepth` / `maxNodes` 触顶会显式标记 `truncated`。

后端支持：`wa-sqlite` / `sqlite` / `sqlite-wasm` / `sqliteai` / `sqlite-tauri` / `sqlite-electron` /
`pglite`。其余后端在插件安装期显式报 `BomBackendCapabilityError`，不做静默降级。

## 前置

- SQLite 宿主 ≥ 3.47.0（触发器的 `RAISE` 表达式，US-030 AC#7），不满足在 `connect()` 即失败；
- 实体声明了区间排他等存储约束（US-030 阶段 C），`init()` 会做只读漂移比对。

## 联产品与固定份额

头父件仍是第一主产物，`flowDirection: 'produce'` 的行表示其他主产物。头与produce行分别声明 `jointCostShare`：规范十进制字符串、范围 `[0, 1]`、最多9位小数。发布与ECN转换后的每个日期切片必须精确合计为1，草稿可暂时不完整，不自动归一化。

produce行必须精确引用已发布的非phantom输出修订，数量大于0；首个合同只支持比例产出。联产品按合格主产量 `L / baseQty` 缩放，损耗增加投入，不额外制造联产品。副产品沿用原抵减规则，废料不计不抵，produce物料的 `creditPrice` 不参与抵减。

过程净成本先算材料、加工、制费与副产抵减，再按固定份额分配。金额使用整批共同34位量子half-even，稳定排序最后一个正份额输出接尾差；零份额恒为0。`root.batchCost` / `unitCost` 是第一主产物分配后的成本，`root.jointCost` 提供过程净成本与全部输出明细。旧单产结果不增加空joint字段。

下游使用联产品成本时，必须显式设置 `jointCostSources[输出修订ID] = 生产头ID`，即使只有一个候选也不自动选择；不会回退到该物料单价或回写物料价格。来源缺失、组织/类型不匹配、派生生产头成本环均明确拒绝。实际选择进入 `jointManifest.sources`。

```typescript
const cost = await rxdb.bom.rollupCost(
  {
    bomType: 'ebom',
    orgId: 'factory-a',
    asOfDate: new Date('2099-01-02T00:00:00Z'),
    currency: 'CNY',
    rateDate: new Date('2099-01-02T00:00:00Z'),
    jointCostSources: { [outputRevisionId]: producerHeaderId }
  },
  { parentRevisionId: consumerRevisionId }
);
```

`produce` 不进入原consume结构判环；成本依赖另按生产头检测环。已发布头的份额不可原地修改，改变第一主产物份额需要新父修订与头，ECN不获得修改头字段的特权。

## 联产导出v2与发布依赖

`EXPORT_CONTRACT_VERSION` 仍是 `1`，旧单产导出的字段、列宽和默认导入语义不变。仅联产数据使用v2：头与发生项位置数组的末列追加 `jointCostShare`；输出物料和已发布修订移到独立 `dependencies.items` / `dependencies.revisions`，不重复出现在待创建主数据中。

目标库须先具备自然键、所属物料、发布状态、单位和修订身份相符的输出依赖，再调用 `importBomDraft(payload)`。依赖缺失或不匹配会逐条诊断并整批零残留；依赖本身从不被导入修改。导入不会发布任何主数据，也不借历史装载绕过追溯限制。成功后新生产修订与头仍是草稿，由调用方明确发布。v1不能承载produce，未知版本明确拒绝。

演示用 `@aiao/rxdb-plugin-bom/testing` 的 `loadCoproductDataset` 可显式追加固定联产样本：净成本220，两个主产物分配132/88，下游消耗10kg得到17.6。有扩展属性字典的库由调用方显式传入 `{ itemExt: { rohs: 'yes' } }`，四个演示物料仍经真实字典校验，缺失/非法属性照常拒绝。独立BOM应用成本页通过“装载联产演示”按需接入，显式满足SC-100字典的必填rohs，原默认种子不增加记录。

## 既有库升级

应用迁移需给 `bom_header` 与 `bom_line_occurrence` 增加可空字符串列 `jointCostShare`，旧数据保持NULL；发生项原enum CHECK也需允许produce。SQLite修改旧CHECK需要走既有表重建迁移，保留数据、外键、索引及其他约束；PGlite需更新对应CHECK。仅新增两列不足以让旧enum接受produce，插件不会以删除旧数据代替迁移。

表结构迁移完成后，插件重新连接会替换受影响的SQLite发生项协议与ECN触发器，PGlite会替换对应函数；不能把旧版本守卫因 `IF NOT EXISTS` 留在库里。触发器升级回归与表结构迁移是两项不同验证，不把前者通过当作后者已自动执行。

## 三框架共享视图

`watchView(input)` 通过现有查询任务自动跟踪ECN、修订、phantom、换算与显示字段；结构、数量、物料编码在同一读事务中生成。上下文、目标、计划量、预算和公式参数全部参与身份，数据库由参数明确传入。

```typescript
import { createBomView } from '@aiao/rxdb-plugin-bom';

const view = createBomView(rxdb, {
  context: { bomType: 'ebom', orgId: 'factory-a', asOfDate: new Date('2099-01-01T00:00:00Z') },
  target: { parentItemId: rootItemId },
  plannedQty: { value: '1', uom: 'pcs' }
});
const subscription = view.state$.subscribe(state => render(state));
try {
  view.toggle([occurrenceId]);
  await view.loadOccurrence(draftOccurrenceId);
  await view.saveOccurrence({ qty: '3', componentScrap: '0.1', operationSeq: 20 });
  await view.calculate();
} finally {
  subscription.unsubscribe();
  view.destroy();
}
```

示例中的 `rootItemId` 属于已发布结构，`draftOccurrenceId` 位于草稿头，且其头路线包含工序20。编辑目标可以独立于当前浏览树加载。

`state.phase` 为idle/loading/empty/success/error，后台刷新保留旧节点并设refreshing。完整发生项路径是稳定key；相同物料的多重边和共享装配分别展开，不合并数量。候选显示物料编码，备选/manual/序列/批次未解析与截断可浏览，完整数量、成本和导出明确拒绝。空结构的数量拒绝仍通过quantityError保留。

最后订阅释放会停止查询，可再次订阅；destroy幂等且永久终止handle。切换输入隔离迟到结果，无效评估日进入可恢复错误状态。数据库连接与销毁由创建数据库的宿主管理。

发生项编辑独立于已发布树。草稿头可编辑用量、组件损耗、工序与生效区间；已发布头下的draft ECN新发生项可编辑协议允许的用量、损耗与工序，生效区间仍由ECN派生，直接改日期会被仓储拒绝。已发布既有行只读，保存沿既有ECN协议处理，错误保留code/payload/message。表单日期为UTC，保留毫秒。

共享绑定通过 `commands.calculate()` 重读完整输入并拒绝数量错误、候选或截断。原 `explodeBom` 继续返回带manifest的部分结果，直接调用时须检查其未解析与截断信息；成本卷算与导出仍使用核心API的完整消费校验。

三个框架包均导出 `useBomView`、`BomTree`、`BomLineEditor` 与 `BomViewBinding`，组件统一接收 `{state, commands}`：Angular的state为signal，React为普通快照，Vue为只读shallowRef。生命周期由各框架卸载钩子释放。使用方法见各包README；开发应用的“BOM 编辑与展开”导航进入 `/bom-view`，共用同一fixture和浏览器验收。

| 绑定                                            | 状态读取                                                                   | 输入更新                                                                      | 订阅释放                                |
| ----------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| [Angular](../rxdb-plugin-bom-angular/README.md) | `Signal<BomViewState>`，模板/脚本读取 `state()`                            | 注入上下文创建，后续调用 `commands.setInput(nextInput)`                       | `DestroyRef`                            |
| [React](../rxdb-plugin-bom-react/README.md)     | 普通 `BomViewState` 快照                                                   | Hook接收的完整input变化自动同步；也提供相同命令                               | `useLayoutEffect`清理，db变化重建handle |
| [Vue](../rxdb-plugin-bom-vue/README.md)         | `Readonly<ShallowRef<BomViewState>>`，脚本读取 `state.value`，模板自动解包 | setup/effectScope创建；后续通过watch或事件调用 `commands.setInput(nextInput)` | `onScopeDispose`                        |

六个命令在三端相同：`setInput`、`refresh`、`toggle`、`loadOccurrence`、`saveOccurrence`、`calculate`。绑定释放共享handle与订阅，数据库资源仍由宿主管理。Angular/Vue绑定更换数据库时重建其组件或作用域。

包体积通过 `pnpm nx run @aiao/source:audit-bom-bundle` 复测：报告区分静态依赖和完整动态可达分块，外部peer单独列出；成本、数量、ECN差异/影响与导入导出在实际调用时加载，公开返回值与错误合同保持。

## 扩展属性热字段与显式迁移

`ext` 继续保存 JSON 文本，业务仍调用 `db.bom.filterByAttr(scope, filters)`。应用按库选择热字段，声明在构造时深快照；同一个 `BomItem` 类可供不同数据库选择不同热键。声明不修改类的全局元数据，也不增加可写属性或日志字段。

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { BOM_ENTITIES, createBomExtStorage, createBomExtStorageMigration, rxDBPluginBom } from '@aiao/rxdb-plugin-bom';

const entityStorage = createBomExtStorage({
  hotFields: [
    { scope: 'item', code: 'rohs_status', dataType: 'string' },
    { scope: 'bom_header', code: 'lead_days', dataType: 'number' },
    { scope: 'bom_line_occurrence', code: 'active', dataType: 'boolean' }
  ],
  gin: true
});
const backend = 'wa-sqlite';
const db = new RxDB({
  dbName: 'manufacturing',
  entities: [...BOM_ENTITIES],
  sync: { type: SyncType.None, local: { adapter: backend } },
  entityStorage,
  migrations: [createBomExtStorageMigration('023-hot-fields', 'sqlite', entityStorage)]
});
db.use(rxDBPluginBom);
```

适配器照常注册并连接。PGlite 使用 `'postgres'` 迁移方言；`gin: true` 仅声明 PostgreSQL 的 `jsonb_ops` 文档表达式索引，SQLite 不安装 GIN。默认不启用 GIN。热字段必须与对应作用域的 `attr_def.dataType` 一致；不兼容的字典改型拒绝保存。

热查询按“同键生成列、PG GIN 非日期等值、原 JSON 提取”的顺序选择。SQLite 生成 VIRTUAL 列并建立 B-tree，PGlite 生成 STORED 列。字符串、有限数值与布尔值不互转；缺键、JSON null、SQL NULL 保持缺值语义。日期仍按原时点语义过滤，本版本明确拒绝日期生成列。

既有持久库必须显式迁移。迁移先按主键分页扫描原 JSON 对象及待补热键的类型，坏值通过 `BomExtAttrError` 点名表、行和键，整批回滚且迁移水位不推进；审计通过后创建派生列和索引，原 `ext` 字节不改写、不需要业务回填。扫描和索引构建仍有成本，应在目标库独立测量。新库由正常建表路径直接安装声明；既有库在同一版本首次引入 BOM 实体时，迁移跳过尚未建表的作用域，由缺表补建按声明直接建出生成列与索引。

迁移只补目录中缺失的托管列与索引：增加热字段时以新的迁移名传入新的声明全集即可，已执行的旧迁移保持不变。托管对象名内嵌声明定义哈希，同名即视为同一声明；其实际定义仍由同一次连接紧随迁移的漂移检查核对，被改形的同名对象以 `Changed definitions` 拒绝连接，不会被静默接受。

连接只核对目录，不自动修复缺失、多余或变形的生成列/高级索引。改定义或删除旧声明时，应在新的用户迁移中显式移除旧托管对象，再安装新声明。不要复用已经执行的迁移名。`gc_` / `sx_` 是托管对象的保留前缀：库里未声明的同前缀生成列或索引（包括用户自建的存量对象）按多余拒绝连接，报错会点名前缀，需在迁移中改名、删除或补上声明。当前引擎不执行 `down()`，本 helper 的回退应写成新的 `up` 迁移。生成列仅由原 `ext` 重算，不能直接写入，不进入公开过滤结果、实体、变更补丁、导入或导出合同。

## 物料可达性与判环

插件通过系统实体贡献登记内部 `BomReach`，原有 `entities: [...BOM_ENTITIES]` 配置无需增加新类型。每个组织/BOM类型内仅保存正长度的祖先→后代物料对，consume多重边共用可达对；不保存路径、用量、日期、修订或候选裁决，不进入用户导入/导出与变更日志。

拓扑增删改与可达性维护处于同一存储事务：插入补祖先×后代，删除只移除已无其他支持路径的对；方向切换先移除旧贡献，再加入新贡献。qty、损耗、工序、日期、phantom、ECN状态和实例安装等非拓扑变化不重写派生表，取消/撤回实际删除发生项时正常维护。内部实体采用system写权限，不提供业务CRUD门面。

首次连接的新库自动建空表；既有库由具名系统迁移 `0001-bom-reach` 原子回填，再启用维护与索引判环。既有库首次引入 BOM 实体时源表要到缺表补建才出现，迁移没有可回填的对，判环与维护在建表后由插件安装。后续连接校验完整性而不全表重建，缺失或多余可达对明确拒绝；迁移失败不会推进水位，旧物理备份恢复后走同一升级路径。

部分 BOM 实体配置必须依赖闭合：插件安装期按即将下发的触发器 DDL 与仓储写入校验核对实体依赖（关系与外键目标由核心在连接期校验），缺依赖时（如配了发生项却缺位号、工序拆分，或配了物料却缺 `BomAttrDef`）两后端在任何 DDL 之前点名拒绝，不把「表不存在」推迟到首次写入。依赖闭合的子集（如物料 + 扩展属性定义 + 修订 + 历史批次）照常读写；不含发生项的配置没有并集边，不启用图维护。

判环先点查可达对，再只取一条有界见证；保留128层硬限制和原错误code/payload/message、unionOnly语义。判环与可达维护只有闭包版一份实现，随全部实体触发器在同一事务里下发，任一语句失败整体回滚；SQLite 触发器每次连接先删后建，插件升级后旧触发器体不会残留。删除 consume 发生项（或把它改为非 consume / 换子件）要在128层内完成「已无其他支持路径」的否定证明，物料图深度超过128层时该写入以 `BomCycleError`（`depth_limit`）拒绝并整体回滚，这是硬限制。远端PostgreSQL的导出DDL同时覆盖INSERT/UPDATE/DELETE，要求Read Committed和作用域锁，部署不会提交调用方已有事务。

主数据 `expandBom` / `whereUsed` 保留既有上下文过滤、排序与路径预算。`alternativeNo` 只裁决根修订的备选头（`resolveBom` / `expandBom` / `explodeBom` / `rollupCost` 同一口径）：根或子装配仍有多个已发布备选头时，展开标 `unresolved` 并列出候选、不下钻也不合并任一备选，数量 / 成本 / 导出拒绝；指定的编号在根修订上不存在时抛 `BomResolutionError`。`whereUsed` 向上反查，列出各备选下的全部使用路径。1万物料的实测p95由236.24ms降到7.60ms，收益来自最小childItemId索引；不将其归给闭包。读取剪枝以独立原型验证，未经额外收益证明不启用。20串菱形仅物化1810对，仍按10000条实际发生项路径截断，物料对不替代路径。

```bash
pnpm nx run rxdb-plugin-bom:test-reach
pnpm nx run rxdb-plugin-bom:test-pg
pnpm nx run benchmarks:benchmark-bom-reach-prototype
```
