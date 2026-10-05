# R2-02 最小探针与测量边界

唯一新增 spec：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-tree-angular/src/__tests__/review-round2-core-lifecycle.spec.ts`。

- 8 个 `it`，本代理没有运行，不借旧 7 用例算 15 通过。
- `RxDB.init`、`rxDBPluginTree`、`EntityManager` 的静态方法绑定、`TreeRepository` 参数归一、`QueryManager` 的任务/观察者均是真实现；没有 mock `useRepositoryQuery`。
- 唯一受控边界为 repo `primary$`（`Object.defineProperty`）；四方法用 Promise，实体由真实 `entityManager.createEntityRef` 水合。订阅归零统计的是该边界 observable；这是 core+Angular integration probe，不是 SQL adapter conformance 或持久化。
- 注册期：真实缺插件拒绝、真实 QueryCache 禁用。运行期：非法 level 的 RxDBError透明，无扁平 fallback；ID=0原样透传，四入口默认值与惰性启动。
- 真实 standalone/OnPush 组件使用 `input.required`、`setInput`、`@if/@for`、`TestBed.tick`，不是只在函数里直接调 hook。只证明 happy-dom 的组件链路，不能称为 ngc 模板错误拒绝或浏览器 route。
- 生命周期：input 0→1→2，旧结果晚到；同组件同 query 两资源；loading→empty→error；销毁时 Promise 晚失败；父/子 EnvironmentInjector 的 RxDB provider 及不同实体类。子库不依靠 provider 自动重绑定同一个实体类：源码静态方法按 EntityType 解析 manager，hooks 本身不读取 RxDB DI。
- 两个独立 consumer 文件在本目录。有效例使用真实 TreeAdjacencyListEntityBase<number|string>、FindTreeOptions/ENTITY_STATIC_TYPES 与全部四 hook；无效例只留下 numeric ID 给 string、count number 当 string 两处错误。无 `ts-expect-error`、`any`、断言或 paths。

必要原场景没有删：SQL 深树/跨父移动/父删除+全量结果对比、同一fixture三端动态、独立 d.ts 消费/模板输入事件反例与真实 route 挂卸仍交主控验证。即使8个probe通过，也不单独核销这些场景。
