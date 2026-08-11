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
