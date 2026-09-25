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

### 已下沉 / 刻意不下沉

按上面那条口径把六个适配器的测试夹具逐项过了一遍，结论分两拨：

**已下沉**——只碰 core 与最小结构类型的那些：

- `cleanupSqliteTestAdapter`（清库回到「新库形态」，见 `src/testing/sqlite.ts`）；
- `registerQueryCount` / `queryCountOf`（加密套件的查询计数登记表，见 `src/encrypted/query-count.ts`）。

**刻意不下沉**——六个适配器工厂那段「造 `RxDB` → `adapter()` → `use()` 插件 → `connect()`」骨架。这不是漏做，理由两条：

1. **形状本来就不一致，上提后参数表比被消掉的重复还长。** 适配器类、选项形状、以及连不上时怎么收场三件事各不相同：`sqlite` / `sqliteai` 要用 `try/catch` 兜住失败路径再 `terminateWorker()`；两个 PGlite 工厂要把成品再套一层查询形状代理，于是交给套件的对象不是内层那个实例；`electron-pglite` 压根不收 `plugins`。把这些差异全用参数表达出来，得到的是一个谁都要读两遍的开关集合。
2. **剩下的重复是同一条规则的六份解释，不是六份可能漂移的实现。** 那段骨架唯一的顺序约束是「贡献系统能力的插件必须在 `connect()` 之前 `use()`」，而它由核心 `RxDB.use()` → `#register_system_contribution` 当场抛错守着（错误消息直接说出成因）。规则本身只有一处实现，六处注释漂移了也改变不了行为。

真正与某个后端方言绑死的部分（具体的 trigger SQL、switch 分支语句、schema 迁移）仍留在对应 adapter 包内，由上面的 `SqliteCleanupOptions` 这类选项传进来——留在那里的判据是「它认识方言」，不是「它复杂」。

## 加密持久化扫描的可信度边界

`runCrudSuite` 要求 adapter 提供 `readDatabaseFile`，并扫描它返回的字节是否包含明文 sentinel。这个断言只证明该 adapter 暴露的 persisted-state byte view 未发现 sentinel。

若 reader 只是逻辑表 dump，它不能证明原始数据库文件、WAL、free pages、change patch、查询缓存或历史快照不存在明文残留。只有 reader 明确覆盖这些物理介质后，消费方才能把结论提升为完整的 at-rest 无明文保证。

## 什么不搬进来（插件包里那些逐字相同的测试夹具）

US-025 把核心拆成 `@aiao/rxdb-plugin-*` 之后，几份小夹具在多个插件包里逐字重复：
`private-symbols.ts`（querycache / sync）、`reachability.ts`（querycache / sync）、
`fake-table-ref.ts`（history / sync / working-tree）、`test-entities.ts`（history / sync）。
它们**有意**留在各自包里，不往本包搬：

- 本包是**发布**包，公开面由 `scripts/verify-public-contract.mjs` + `public-contract/baseline.json`
  逐条冻结。把 `private-symbols.ts` 搬进来，等于把 `Symbol.for('@aiao/rxdb/ɵMetadata')`
  这种探核心私有槽位的东西写进 npm 公开 API —— 内部探针从此要按公开面的规矩改。
  `fakeTableRef` 同理：它是一份**故意不像任何真实后端**的替身，不是可复用契约。
- 放 `modules/` 这种不发布的内部模块也不行：插件包的 `vite.config.mts` 一律没有
  `vite-tsconfig-paths`，解析只靠 pnpm workspace 的 node_modules 符号链接，跨目录的
  `modules/*` 在 vitest 运行期根本解析不到。
- 「副本会随核心契约变更静默腐化」这条担心不成立：这些文件要么 import 核心的真实符号
  （`ReachabilityMonitor` / `@Entity`），要么用全局 `Symbol.for` 键 —— 核心一改，
  副本以编译错误或「元数据读不到」的形态**立刻**红，不会无声漂移。文件各 17~96 行。

结论：重复是拆包的既定代价，比把内部探针冻进发布面便宜。真要收敛，先给这些夹具找一个
**不发布**且插件包解析得到的家，而不是塞进本包。
