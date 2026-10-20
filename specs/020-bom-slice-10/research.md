# Research: BOM 第 10 步

**Date**: 2026-10-17。本文区分静态核对所得结论与尚待主会话执行的 spike；没有记录未执行的测试为通过。

## 已核对的实现落点

- `packages/rxdb/src/repository/QueryManager.ts` 的 `createTask()` 已接受 runner、指纹、额外 `relationEntityTypes` 与 `autoCache`。
- `packages/rxdb/src/repository/QueryManager.interface.ts` 的 `RepositoryQueryExtensions` 已提供插件查询类型扩展，不必预设新增查询引擎 API。
- `packages/rxdb-plugin-graph/src/GraphRepository.ts` 的 `createGraphTask()` 已使用额外实体依赖及 `autoCache: false` 承载派生结果，可作为装配先例。
- 现有 BOM 路线实体有 `validFrom` / `disabledAt`；独立审计确认数量与成本消费未落实停用判定。本轮修复以真实双后端失败用例为起点，不凭状态表认定已完成。
- `rxdb-plugin-tree-{angular,react,vue}` 与 search 绑定已有薄框架包的发布、生命周期和测试约定。新包遵循它们的结构，不能把三框架运行时导入 BOM 核心包。

## R1：一个派生查询 Kernel，三个薄容器

**决定**：共享 `watchView` 数据投影与 `createBomView` 交互 handle，三端 `useBomView` 绑定同一业务状态与命令。只有 state 的框架容器不同。

**原因**：错误、完整性、依赖与写入边界都属于 BOM，三端分别实现会产生协议漂移。

**排除**：各端自行订阅若干表拼树；把 Angular/React/Vue 引入核心；以通用 Entity Tree 的裸 item ID 作为 BOM 路径身份。

## R2：先用现有依赖通道证明 AC#6～#9

**决定**：优先注册实际读取实体的保守依赖，并用完整输入构造派生任务身份。结果使用派生指纹，关闭实体自动缓存。

**原因**：ECN 状态、新修订、phantom 与换算率会使旧结果从未引用的行进入视图；只看旧 occurrence ID 会漏刷新。

**待主会话 spike**：四类真实写入/输入事件能否经现有 QueryManager 刷新；同库多订阅去重、异库隔离、最后订阅释放、输入切换和迟到结果处理是否符合合同。测试必须等待实际事件/结果，不使用 sleep 或只手动调用 refresh 证明自动刷新。

**排除**：先新增通用引擎依赖 API；按参与行集过滤全部事件；在框架组件里绕过事件通道轮询。

## R3：保守重算与稳定 DOM 是两个范围

**决定**：允许整个查询投影重算；树按完整 occurrence path 惰性呈现。后台刷新保留原节点，路径未变的 DOM 元素引用不变。

**原因**：AC#2 约束元素身份，不约束框架 render 函数被调用多少次，也不要求本轮实现最小失效图。

**验证**：浏览器上下文保存实际 Element 映射，ECN 发布后逐路径比较引用相等。三重边、同子装配多路径和独立折叠使用同一规则。

**排除**：先清空列表再填数据；以物料 ID、数组下标或刷新代次为 key；用截图/节点计数冒充引用验证。

## R4：未解析可浏览，完整消费必须拒绝

**决定**：结构投影保留备选、manual、序列/批次候选；数量、成本、导出消费必须验证完整性。

**兼容事实**：第 8 步 `explodeBom` 与演示支持带 manifest.unresolved 的部分结构，仍显示正常支路；本步不能把这一既有公开行为统一改成抛错。

**待主会话收敛**：复用既有 `assertCompleteResolution` 等完整性检查，确定新视图的完整数量消费边界与错误映射；不要以完整数量计算成功作为浏览候选的先决条件。

**排除**：擅自选候选、未解析显示为零、未解析显示为空树、为新 UI 打破原 23 条演示行为。

## R5：编辑器独立于已发布树

**决定**：handle 独立 `loadOccurrence(id)` / `saveOccurrence(patch)`；草稿头及 draft ECN 下的新发生项可编辑，已发布既有发生项只读。

**原因**：草稿头不进入已发布解析；不能要求草稿编辑目标先出现在展开树。既有发布协议也不允许已发布发生项原地修改。

**边界**：不创建 ECN 管理 UI，不自动把编辑转换为“截止旧行+创建新行”。AC#2/#6 的 ECN 发布由测试通过真实 kernel 完成；固定未来生效日同时作为评估日，满足禁止追溯发布。

**排除**：三端各加保存规则；绕过仓储校验；替用户创建或发布 ECN；为通过表单测试改变领域只读规则。

## R6：路线停用是消费有效域

**决定**：有效域采用 `[validFrom, disabledAt)`。已挂工序或分摊引用失效路线时报未覆盖，错误点名 route/occurrence；数量、成本、导出共享消费语义。

**原因**：无路线可以是合法建模，已选路线失效不能等同于无工序；停用不能删除历史工序或篡改历史数量。

**验证**：停用前、当天与之后，单工序和分摊两种引用；SQLite/PGlite 同行为。活视图应能因路线状态变化刷新。

## R7：验证与包体积预算

**决定**：共享 fixture 放核心 testing 入口，三端消费页与 Playwright 共享场景；真实 DOM、四状态、a11y、生命周期、错误与输入语义同时覆盖。非核心包四项覆盖率 ≥80%，核心触及时按既有 90% 门禁。

**原因**：函数名对齐不足以证明行为对称；新增 UI 不能挤占核心入口的 50KB gzip 预算。

**测量**：100 节点预热查询、保存、刷新到 DOM、首屏、入口及静态依赖/完整可达分块分开记录。保留原始样本和环境，不能把动态分块当作总字节减少。

## Spike收敛检查项（初始记录，结果见下方实施证据）

- 依赖矩阵 AC#6～#9 的实际失败原因、修复及验证结果。
- `BomViewSnapshot` 节点/候选/错误投影与 handle state 的最终类型。
- `loadOccurrence` / `saveOccurrence` 的最小输入和返回值、只读原因与销毁幂等规则。
- 完整数量消费边界与现有部分展开 API 的兼容证明。
- 若存在现有引擎通道不足，只记录可复现缺口及最小改动；不得预先宣称引擎扩展是必需。

## 实施证据（2026-10-18）

- 已复核当前分支、规格、计划、合同与 constitution；第 10 步没有未完成的 checklist 文件，沿当前分支执行。生成器已发现并阅读源码；忽略文件覆盖依赖、构建与测试产物。可选 Git 前钩子跳过，初始工作区干净。
- 路线红：`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true pnpm nx test rxdb-plugin-bom --run src/__tests__/bom-routing-effectivity.spec.ts --coverage=false --output-style=stream`，54 条中 36 通过、18 失败（SQLite/PGlite）。分摊引用失效路线时数量/导出未拒绝，成本拒绝缺少发生项定位；生效边界与无路线历史回归已通过。

- 路线绿：同一文件 54/54 通过，含分摊数量、根/递归成本、导出及无路线历史结果。
- 依赖 spike 红：`bom-view-live.spec.ts` 在 SQLite/PGlite 的新增断言均失败，旧 watchView 未调用 QueryManager；四类既有存储事件用例能通过轮询，不能因此算依赖通道通过。
- 依赖 spike 绿：改用 BomHeader 仓储的 QueryManager，自定义 bomView 查询类型、完整输入快照、BOM 实体保守依赖、autoCache:false、派生值指纹与刷新状态；10/10 通过，不需要修改核心引擎。结构、数量与显示信息在同一读事务中生成；不再轮询。
- 共享视图红：26 条中 12 条真实数据依赖/输入回归通过，14 条控制器行为未实现而失败；生命周期/编辑器另 22 条确认功能失败。初轮实现后共 112 条回归有 108 条通过、4 条失败，分别是双后端备选候选投影缺失和 draft ECN 新发生项编辑被存储协议拒绝，继续修复后再关闭。
- 框架红：React 13/13、Vue 初始 14/14 均因绑定或真实组件未实现失败；Angular 尚未运行有效功能红。
- 三端配置经 Nx 官方生成器（已读源码并 dry-run）生成，去除生成器引入的无关根配置变更，沿用 tree 绑定的发布/测试配置。生成器自带安装因无 TTY 中止后，由 pnpm workspace add 完成本地依赖链接；发布 peer 约定 workspace:^ 与锁文件已同步。

### 保存协议收敛

真实编辑测试暴露 US-522 草稿 ECN 新发生项编辑与旧存储守卫的冲突。新增放行仅覆盖仍属同一 draft ECN 的新发生项 qty/componentScrap/operationSeq；结构归属、子件、ECN 引用与派生生效区间保持原约束，发布后的既有发生项仍全拒。SQLite 安装时原子替换此受影响守卫，使持久化旧库也得到同一行为。新增回归和原 US-515 协议测试共同验收，不靠绕过仓储或自动生成 ECN 完成保存。

### 后续边界回归（2026-10-18）

- 共享刷新与空态补充：关闭自动事件后，显式 refresh 的双后端测试曾超时，接主动 QueryTask.refresh 后四条回归通过；合法配置无命中使用 empty/nodes=[]。
- 候选物料/公式表单红：候选展示 UUID 而非物料编码的六条双后端断言失败，空公式用量解析为非法空字符串的一条失败。补齐候选物料读取、编码投影和 null 转换后，`bom-view.spec.ts` 28条、`bom-view-fields.spec.ts` 2条及联产集成16条，共46/46通过。
- 页面资源红：Vue与Angular各3条中2失败，分别是连接取消仍装种子、种子失败未立即释放。补取消检查和缓存释放承诺后各3/3通过。
- React绑定内联等值输入回归先红，按确定性输入身份去重后组件/绑定14/14通过。Angular组件/绑定12/12、Vue18/18曾通过；最终覆盖率与浏览器51场景仍独立验收，不据此关闭整故事。
- 新核心元数据与旧dist/source混用令React应用注册生成实体时缺Map，浏览器17项前置均失败；应重建完整依赖而非增加缺字段fallback。此轮失败未计作功能通过。

### 前轮三端实际验收（2026-10-18，非当前最终结果）

- 锁定 Playwright Chromium revision 1248 已安装。React / Angular / Vue 在相同共享场景中各17/17通过，共51条，覆盖真实Element引用、两路径独立折叠、五输入编辑与发布、四类候选拒绝、实际ECN/修订/换算事件、卸载重挂、四态、键盘和axe、布局与100节点浏览器性能。
- 首轮React/Vue各15/17，暴露无效日期同步指纹错误和发生项生效期外浏览空态缺失。新增双后端边界4红后，控制器接收同步查询构造错误为领域状态、React输入身份支持非法输入传递、空结构保留数量拒绝信息；生命周期/编辑27/27通过，再重跑浏览器为三端全绿。
- 三端四项覆盖率（语句/分支/函数/行）：Angular 99/100/100/98.61，React 87.59/86.66/93.02/92.92，Vue 100/97.36/100/100。真实导出均为useBomView/BomTree/BomLineEditor与BomViewBinding，唯一容器差别为signal/plain snapshot/ref。
- 核心静态包体积首次AST实测52739字节，超过50000预算，已继续抽出按需导入导出实现；仍须在最终构建后复测，不能用单入口文件或修改预算关闭任务。

### 性能失败与修复起点

- `benchmarks:benchmark-bom` 在100节点下测得watchView首次完整快照p95=32.782ms、保存到快照p95=111.840ms，均真实越过16/100预算，报告保存于 `benchmarks/reports/bom-latest.json`，没有更改预算或fixture。SQL计数测试在两端确认同一个子修订被查询99次而非1次。
- 数量引擎增加本次读事务内的子头选择缓存（包括无头结果），不跨调用共享。对应2条去重/下一事务重读测试、28条视图及54条路线回归共84/84通过；仍需重新构建后测预算。
- 布局JSON发现Angular宿主导致树/编辑面板高度差115.5px，新增共享高度断言真实失败，组件宿主改为display:contents，最终浏览器复核待执行。

- 事务局部去重构建后主基准已通过：100节点查询p50/p95/max=12.483/13.158/13.496ms；真实描述保存=0.970/1.012/1.194ms；save完成到新快照=33.903/34.660/35.377ms。仍为5预热、20样本、每次重建任务，16/100ms原预算不变。

### 第三轮完整e2e首屏失败

本地日志`bom-affected-complete3.log`（未留存）中的Vue181/182、React198/199通过，各自唯一失败均为BOM100节点首屏：2504.4/2512.9ms超过1500ms；输入p95为10.4/40.4ms，仍低于100ms。两者实际采用各自Playwright默认8 workers，不是Nx并行；原始报告保留在`benchmarks/reports/bom-view-{vue,react}-performance-8-workers.json`。前轮三端51条通过仅为历史，不作为本轮结论。

冷启动trace包含全局宿主DB和BOM独立DB两份WASM初始化，单凭该观察没有归因。full3最终349任务、39m44、166本地缓存命中，仅Vue/React两e2e失败，其余347通过或使用有效缓存。主会话随后对未修改的同一构建产物以`grep=100 节点性能`、workers=1及excludeTaskDependencies做冷控制，Vue1/1（3.2s）、React1/1（3.1s）通过，本地日志`bom-e2e-performance-control.log`（未留存）；保留原8 workers失败报告。

最小配置修正仅将Vue/React两份Playwright配置的workers从`isCI ? 2 : 8`改为1，1500ms首屏阈值、100ms输入阈值及无本地重试保持。随后Vue完整182/182通过；React先因OPFS目录导航同步导致198/199，修正helper后2/2定向绿，再跑完整仍198/199，唯一失败变为共享search-handle的auditTime旧词在clear后复活。证据分别为本地日志`bom-e2e-final-serial.log`、`bom-react-opfs-navigation-green.log`及`bom-react-e2e-final-complete.log`（均未留存）。该搜索缺陷当时修复后通过完整Node297；追加pending竞态后最终Node299和完整e2e均通过，见下方。Angular当时full3以2 workers完成203/203（3.0m），firstData1088.7ms/输入p95=14ms和468px等高仅为历史，不代表最新完整共享通过。

### 对称性修复与最终冻结

React aria-selected、Angular/React叶子Space不应toggle及disabled submit保护三处差异，经7条增强行为红绿后完成最小修复。本地日志`bom-components-symmetry-green.log`（未留存）确认Angular15、React17、Vue18全部通过；四项分别99.01/100/100/98.66、89.31/87.30/95.34/92.59、100/97.36/100/100%。搜索首轮Node297及91.13/80.39/94.88/92.80%仅为历史轮次；追加pending竞态后的Node299和真实browser52已合并93.50/84.80/96.80/94.70%，正式8包审计已逐包通过，见下方最终结果。

首个final.log主动exit130、350任务Angular1622.6ms失败及1340ms单worker控制均保留历史；搜索pending第二批2红后Node299/browser52真实合并通过，refresh专用过滤保持debounced输入合同。

最终完整affected EXIT0：86项目、351任务、324本地缓存、12m14（本地日志`bom-affected-final-serial.log`，未留存）。三端共享51/51、demo24/24通过；Angular203/203（5.8m）、React199/199（5.5m）、Vue182/182有效缓存。最终首屏/输入p95分别1206/15.6、1105.2/42.2、796.3/9.5ms，均满足1500/100ms原预算，三端tree/editor均468px。

PGlite真实summary/final已从有效本地缓存恢复：13任务、12缓存、791ms，本地日志`bom-pglite-final-coverage-restored.log`（未留存）。严格8包官方coverage逐包执行8次全部EXIT0，证据为本地日志`bom-final-coverage-eight-packages.log`（未留存）；SQLite/PGlite两条趋势软提示保留、均达门槛，baseline未改。早期仅评估rxdb一包的日志不作为8包证据。

本轮18条任务全部关闭，spec011～024共256/256完成，19条BOM故事、US-522 AC#1与US-030均Done。失败/控制历史、正式审计与最终结果见[最终验收](../021-bom-closure/closure-map.md)。
