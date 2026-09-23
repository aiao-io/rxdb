# @aiao/rxdb-test

RxDB 测试资源包，集中放测试实体、跨 adapter 契约套件、跨框架行为夹具和可复用的测试辅助函数。

## 发布入口

- `@aiao/rxdb-test`：通用测试辅助函数
- `@aiao/rxdb-test/entities`：通用测试实体
- `@aiao/rxdb-test/shop`：电商关系模型测试实体
- `@aiao/rxdb-test/encrypted`：加密字段的 CRUD、生命周期、篡改保护与查询限制契约套件

```ts
import { cleanupSqliteTestAdapter, expectObservableSequence, generateTestDbName } from '@aiao/rxdb-test';
import { runCrudSuite, runLifecycleSuite, runTamperSuite } from '@aiao/rxdb-test/encrypted';
```

`cross-framework-fixtures/*.json` 是仓库内测试夹具，只允许通过源码相对路径读取，不属于 npm package exports。

## 依赖方向

本包**只向下依赖** `@aiao/rxdb` 与它所测契约归属的插件包（当前是 `@aiao/rxdb-plugin-tree`，`tree-unique` 套件测的就是它）。

本包**不得依赖**任何 `@aiao/rxdb-adapter-*` 或框架绑定包（`rxdb-angular` / `rxdb-react` / `rxdb-vue` / 三个 `rxdb-model-*`）。理由是方向性的，不是风格偏好：那十六个包的 `devDependencies` 里都写着 `@aiao/rxdb-test`，本包依赖回去即是 back-edge，Nx 图上直接成环、`run-many` 排不出拓扑序。

需要认识某个适配器时，用**结构化最小类型**而不是 import 它——`SqliteTestAdapterLike` 就是这么做的：它只声明 `cleanupSqliteTestAdapter` 真正会碰的那几个成员，于是工具能认适配器而无须知道有哪些适配器存在。

这条规则由 [`src/__tests__/dependency-direction.spec.ts`](./src/__tests__/dependency-direction.spec.ts) 守着：新增工作区依赖必须同时改那份白名单，改不动就说明方向错了。

**它划的是包边界，不是「什么能下沉」**：凡是只用到 core 与最小结构类型的测试骨架都应当住在本包，即使它当前只有一个适配器在用。下沉与否看依赖方向，不看使用者数量。

## 加密持久化扫描的可信度边界

`runCrudSuite` 要求 adapter 提供 `readDatabaseFile`，并扫描它返回的字节是否包含明文 sentinel。这个断言只证明该 adapter 暴露的 persisted-state byte view 未发现 sentinel。

若 reader 只是逻辑表 dump，它不能证明原始数据库文件、WAL、free pages、change patch、查询缓存或历史快照不存在明文残留。只有 reader 明确覆盖这些物理介质后，消费方才能把结论提升为完整的 at-rest 无明文保证。

真正与某个后端方言绑死的部分（具体的 trigger SQL、switch 分支语句、schema 迁移）仍留在对应 adapter 包内，由上面的 `SqliteCleanupOptions` 这类选项传进来——留在那里的判据是「它认识方言」，不是「它复杂」。
