# R2-02 最小探针与测量边界

唯一新增 spec：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/review-round2-core-lifecycle.spec.ts`。

- 8 个 `it`，本代理没有运行；主控初次运行新增6过2fixture失败、原7过，不能算15全绿。
- `RxDB.init`、`rxDBPluginTree`、`EntityManager` 的静态方法绑定、`TreeRepository` 参数归一、`QueryManager` 的任务/观察者均是真实现；没有 mock `useRepositoryQuery`。
- 唯一受控边界为 repo `primary$`（`Object.defineProperty`）；四方法用 Promise，实体由真实 `entityManager.createEntityRef` 水合。订阅归零统计的是该边界 observable；这是 core+Angular integration probe，不是 SQL adapter conformance 或持久化。
- 注册期：真实缺插件拒绝、真实 QueryCache 禁用。运行期：非法 level 的 RxDBError透明，无扁平 fallback；ID=0原样透传，四入口默认值与惰性启动。
- 真实 standalone/OnPush 组件使用 `@Input({required:true})` setter驱动signal、`setInput`、`@if/@for`、`TestBed.tick`，不是只在函数里直接调 hook。只证明 happy-dom 的组件链路，不能称为 ngc 模板错误拒绝或浏览器 route。
- 生命周期：Input 0→1→2，旧结果晚到；同组件同 query 两资源；loading→empty→error；销毁时 Promise 晚失败；父/子 EnvironmentInjector 的 RxDB provider 及不同实体类。子库不依靠 provider 自动重绑定同一个实体类：源码静态方法按 EntityType 解析 manager，hooks 本身不读取 RxDB DI。
- 两个独立 consumer 文件在本目录。有效例使用真实 TreeAdjacencyListEntityBase<number|string>、FindTreeOptions/ENTITY_STATIC_TYPES 与全部四 hook；无效例只留下 numeric ID 给 string、count number 当 string 两处错误。无 `ts-expect-error`、`any`、断言或 paths。

必要原场景没有删：SQL 深树/跨父移动/父删除+全量结果对比、同一fixture三端动态、独立 d.ts 消费/模板输入事件反例与真实 route 挂卸仍交主控验证。即使8个probe通过，也不单独核销这些场景。

首次新spec两组件因analog的TS program warning，JIT不识别signal authoring input，setInput→NG0303/NG0950。现只把新fixture改成公开Input decorator setter驱动signal，保留行为断言，待主控focused重跑；无修实现/原tests/依赖，失败日志不删。独立consumer补显式Node与@types/ms后严格正负已测；bare公开声明环境风险仍在共享原日志。

### 原required-input场景不得由替代夹具核销（最终补充）

初版**已证**的是TestBed/JIT未识别输入（NG0303）导致绑定失败，随后读空required signal（NG0950）；**未证**的是正确ngc编译并正确父模板绑定后生产是否仍可达、最终根因归属。此前倾向fixture编译边界的判断仅是证据解释，不是生产不可达结论。setter+signal(0)只恢复其他生命周期测量，不核销原input.required场景。

原夹具快照 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/probe-original-required-input.spec.ts.txt`，SHA `2859c2fb42ac2232b003b8b05302fa441686139a73a8d7da13e7e820c8838c21`，与主控实际测量SHA匹配=True；原日志保留不删除。独立 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-tree-angular/consumer-required-input.mts` 保持 `input.required<number>()` 和tree hook options getter，父组件 `RequiredInputHost` 用模板显式 `[rootId]="rootId()"` 绑定。需主控ngc编译与运行0→7、无NG0303/NG0950对照，R2-02-V6，尚未执行。它不替typed tsc、SQL、route，也不把C4/全对象绿化。
