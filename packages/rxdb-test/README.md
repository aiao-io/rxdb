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

## 加密持久化扫描的可信度边界

`runCrudSuite` 要求 adapter 提供 `readDatabaseFile`，并扫描它返回的字节是否包含明文 sentinel。这个断言只证明该 adapter 暴露的 persisted-state byte view 未发现 sentinel。

若 reader 只是逻辑表 dump，它不能证明原始数据库文件、WAL、free pages、change patch、查询缓存或历史快照不存在明文残留。只有 reader 明确覆盖这些物理介质后，消费方才能把结论提升为完整的 at-rest 无明文保证。

复杂的分支、触发器和 adapter 专属清理仍保留在对应 adapter 包内，避免把强耦合逻辑误抽成公共 API。

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
