# 同步策略

RxDB 支持在本地与远程之间灵活同步数据。通过配置 `sync` 选项，你可以实现从完全离线到实时同步的各种模式。

```ts
import { RxDB, SyncType } from '@aiao/rxdb';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [...],
  sync: {
    type: SyncType.None,          // 策略类型
    local: { adapter: 'wa-sqlite' }, // 本地存储（可选）
    // remote: { adapter: 'xxx' } // 远程存储（可选）
  }
});
```

## 策略类型

| 策略         | 数据流向 | 场景         |
| :----------- | :------- | :----------- |
| `None`       | 单向     | 离线应用     |
| `Full`       | 双向     | 完整离线访问 |
| `Filter`     | 双向     | 条件过滤     |
| `QueryCache` | 按需     | 海量数据缓存 |

:::tip 推荐配置
对于需要离线访问的应用，推荐使用 `SyncType.Full` 实现双向数据同步。
:::

## Full 同步快速入门

`SyncType.Full` 是最常用的同步策略，适用于需要完整离线访问能力的应用。

### 基本配置

```ts
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';

const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [Todo, User],
  sync: {
    type: SyncType.Full,
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'supabase' }
  }
});

// 注册适配器
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
rxdb.adapter(
  'supabase',
  db =>
    new RxDBAdapterSupabase(db, {
      supabaseUrl: 'YOUR_SUPABASE_URL',
      supabaseKey: 'YOUR_SUPABASE_KEY'
    })
);

await rxdb.connect('wa-sqlite');
```

### 执行同步

```ts
const vm = rxdb.versionManager;

// 双向同步单个仓库
const result = await vm.syncRepository('public', 'Todo');
console.log(`拉取: ${result.pullResult.pulled}, 推送: ${result.pushResult.pushed}`);

// 批量同步所有仓库
const bulkResult = await vm.bulkSync();
console.log(`同步了 ${bulkResult.results.length} 个仓库`);

// 仅拉取远程数据
await vm.syncRepository('public', 'Todo', { direction: 'pull' });

// 仅推送本地变更
await vm.syncRepository('public', 'Todo', { direction: 'push' });
```

### 冲突解决

当 pull 或 sync 过程中检测到本地未推送变更与远程变更命中同一实体时，系统会先进入冲突检测，再默认使用 **Last Write Wins (LWW)** 策略：

- 比较 `createdAt` 时间戳，较新的修改获胜
- 时间戳相等时，本地修改优先

当前运行时会自动执行两种结果：

- `KEEP_LOCAL`：跳过远程 patch，保留本地待推送变更
- `KEEP_REMOTE`：应用远程 patch，并将本地冲突变更标记为已被远端覆盖

如果自定义 resolver 返回 `MERGE` 或 `DEFER`，运行时会抛出错误并发出冲突待处理事件，避免在没有持久化冲突状态的情况下静默丢失远端变更。

```ts
import { IConflictResolver, ConflictContext, ConflictResult } from '@aiao/rxdb';

class MyConflictResolver implements IConflictResolver {
  resolve(context: ConflictContext): ConflictResult {
    // 自定义冲突解决逻辑：本地修改时间更新则保留本地
    const localTime = context.local?.updatedAt?.getTime() ?? 0;
    const remoteTime = context.remote?.updatedAt?.getTime() ?? 0;
    return localTime >= remoteTime ? ConflictResult.KEEP_LOCAL : ConflictResult.KEEP_REMOTE;
  }
}

const result = await vm.syncRepository('public', 'Todo', {
  pull: {
    conflictResolver: new MyConflictResolver()
  }
});
```

### 监听同步事件

```ts
// 监听同步完成
rxdb.addEventListener('repository-sync-complete', event => {
  console.log(`${event.entity} 同步完成:`, event.result);
});

// 监听同步错误
rxdb.addEventListener('repository-sync-error', event => {
  console.error(`${event.entity} 同步失败:`, event.error);
});

// 监听冲突检测
rxdb.addEventListener('CONFLICT_DETECTED', event => {
  console.log('自动解决冲突数:', event.resolved, '待处理冲突数:', event.deferred);
});
```

## Filter 同步快速入门

`SyncType.Filter` 适用于需要条件过滤同步的场景，例如只同步最近 30 天的数据。

### Filter 基本配置

```ts
import { Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';
import { subDays } from 'date-fns';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'updatedAt', type: PropertyType.date }
  ],
  sync: {
    type: SyncType.Filter,
    local: { enabled: true },
    remote: {
      enabled: true,
      // 动态过滤：只同步最近 30 天的数据
      filter: () => ({
        combinator: 'and',
        rules: [{ field: 'updatedAt', operator: '>=', value: subDays(new Date(), 30) }]
      })
    }
  }
})
export class Todo extends EntityBase {}
```

:::info filter 函数
`filter` 是一个返回 `RuleGroup` 的函数，**每次 pull 时都会重新执行**。这意味着：

- 滚动时间窗口会自动更新（如 "最近30天" 会随时间推移）
- 可以基于运行时状态动态调整过滤条件
  :::

### Filter 执行同步

```ts
const vm = rxdb.versionManager;

// 拉取：只获取满足 filter 条件的远程数据
await vm.syncRepository('public', 'Todo', { direction: 'pull' });

// 推送：本地变更无限制推送
await vm.syncRepository('public', 'Todo', { direction: 'push' });

// 双向同步（拉取受限，推送不受限）
await vm.syncRepository('public', 'Todo');
```

### 清理过期数据

当使用滚动时间窗口时，本地可能存在不再满足 filter 条件的"过期"数据。使用 `cleanupExpired` 清理：

```ts
import { cleanupExpired } from '@aiao/rxdb';

// 删除不再满足 filter 条件的本地数据
const result = await vm.cleanupExpired('public', 'Todo');
console.log(`清理了 ${result.removed} 条过期记录`);

// 预览模式：仅返回将被删除的数据，不实际执行删除
const preview = await vm.cleanupExpired('public', 'Todo', { dryRun: true });
console.log(`将清理 ${preview.removed} 条记录:`, preview.removedIds);
```

### 复杂过滤条件

```ts
// 多条件组合：最近 30 天 且 未归档
sync: {
  type: SyncType.Filter,
  local: { enabled: true },
  remote: {
    enabled: true,
    filter: () => ({
      combinator: 'and',
      rules: [
        { field: 'updatedAt', operator: '>=', value: subDays(new Date(), 30) },
        { field: 'archived', operator: '=', value: false }
      ]
    })
  }
}
```

### Filter vs Full 对比

| 特性     | Full 同步            | Filter 同步            |
| -------- | -------------------- | ---------------------- |
| 拉取范围 | 全量数据             | 仅满足条件             |
| 推送范围 | 全量数据             | 全量数据（不受限）     |
| 本地存储 | 完整数据集           | 数据子集               |
| 使用场景 | 小数据集，需完整离线 | 大数据集，只需最近数据 |

## 关系查询与同步

**核心规则**：外键只能从本地指向任意位置，不能从远程指向本地

### 查询路由规则

查询引擎根据**查询条件涉及的表**和**表的存储位置**自动选择查询路径：

| 查询条件     | 主表位置 | 从表位置 | 查询路径 |
| ------------ | -------- | -------- | -------- |
| 仅主表属性   | 本地     | -        | 本地     |
| 仅主表属性   | 远程     | -        | 远程     |
| 仅主表属性   | 同步     | -        | 本地     |
| 包含从表属性 | 本地     | 本地     | 本地     |
| 包含从表属性 | 本地     | 远程     | 远程     |
| 包含从表属性 | 本地     | 同步     | 本地     |
| 包含从表属性 | 远程     | 本地     | ❌       |
| 包含从表属性 | 远程     | 远程     | 远程     |
| 包含从表属性 | 远程     | 同步     | 远程     |
| 包含从表属性 | 同步     | 本地     | 本地     |
| 包含从表属性 | 同步     | 远程     | 远程     |
| 包含从表属性 | 同步     | 同步     | 本地     |

**规则总结**：

1. **仅主表属性**：优先本地（同步表走本地）
2. **包含从表属性**：任一表在远程 → 远程查询
3. **远程主表 + 本地从表**：不可行（违反外键规则）

```ts
// 示例：Article(同步) 关联 Author(远程)

// 仅主表属性 → 本地查询
repository.find({ where: { title: 'Hello' } });

// 包含从表属性 → 远程查询
repository.find({
  where: { author: { name: 'Alice' } },
  relations: ['author']
});
```

---

### 主表：纯本地

#### 一对多（主表1 ← 从表N，外键在从表）

| 从表策略 | 可行性 | 原因                     |
| -------- | ------ | ------------------------ |
| 纯本地   | ✅     | 外键在本地，可引用本地   |
| 纯远程   | ❌     | 外键在远程，无法引用本地 |
| 全量同步 | ❌     | 外键在远程，无法引用本地 |
| 条件同步 | ❌     | 外键在远程，无法引用本地 |
| 按需缓存 | ❌     | 外键在远程，无法引用本地 |

**示例**：本地 `User` ← 远程 `Article` **不可行**（远程无法存储本地用户ID）

#### 多对一（从表N → 主表1，外键在从表）

当前实体是从表，主表策略：

| 主表策略 | 可行性 | 原因                   |
| -------- | ------ | ---------------------- |
| 纯本地   | ✅     | 外键在本地，可引用本地 |
| 纯远程   | ✅     | 外键在本地，可引用远程 |
| 全量同步 | ✅     | 外键在本地，可引用远程 |
| 条件同步 | ✅     | 外键在本地，可引用远程 |
| 按需缓存 | ✅     | 外键在本地，可引用远程 |

**示例**：本地 `Article` → 远程 `User` **可行**（本地可存储远程用户ID）

#### 一对一（外键在任一方）

| 从表策略 | 外键位置 | 可行性 | 原因                     |
| -------- | -------- | ------ | ------------------------ |
| 纯本地   | 任一方   | ✅     | 都在本地                 |
| 纯远程   | 本地     | ✅     | 外键在本地，可引用远程   |
| 纯远程   | 远程     | ❌     | 外键在远程，无法引用本地 |
| 全量同步 | 本地     | ✅     | 外键在本地，可引用远程   |
| 全量同步 | 远程     | ❌     | 外键在远程，无法引用本地 |
| 条件同步 | 本地     | ✅     | 外键在本地，可引用远程   |
| 条件同步 | 远程     | ❌     | 外键在远程，无法引用本地 |
| 按需缓存 | 本地     | ✅     | 外键在本地，可引用远程   |
| 按需缓存 | 远程     | ❌     | 外键在远程，无法引用本地 |

#### 多对多（中间表存储双方ID）

| 从表策略 | 中间表位置 | 可行性 | 原因                       |
| -------- | ---------- | ------ | -------------------------- |
| 纯本地   | 本地       | ✅     | 都在本地                   |
| 纯远程   | 本地       | ✅     | 中间表在本地，可引用双方   |
| 纯远程   | 远程       | ❌     | 中间表在远程，无法引用本地 |
| 全量同步 | 本地       | ✅     | 中间表在本地，可引用双方   |
| 全量同步 | 远程       | ❌     | 中间表在远程，无法引用本地 |
| 条件同步 | 本地       | ✅     | 中间表在本地，可引用双方   |
| 条件同步 | 远程       | ❌     | 中间表在远程，无法引用本地 |
| 按需缓存 | 本地       | ✅     | 中间表在本地，可引用双方   |
| 按需缓存 | 远程       | ❌     | 中间表在远程，无法引用本地 |

---

### 主表：纯远程

```ts
{ type: SyncType.None, remote: { adapter: 'supabase' } }
```

查询远程数据，无本地存储，无法建立本地关系。

---

### 主表：全量同步

```ts
{
  type: SyncType.Full,
  local: { adapter: 'wa-sqlite' },
  remote: { adapter: 'supabase' }
}
```

#### 一对多（主表1 ← 从表N，外键在从表）

| 从表策略 | 可行性 | 原因                       |
| -------- | ------ | -------------------------- |
| 纯本地   | ✅     | 外键在本地，可引用本地     |
| 纯远程   | ❌     | 外键在远程，无法引用本地   |
| 全量同步 | ✅     | 外键在本地，可引用同步数据 |
| 条件同步 | ✅     | 外键在本地，可引用同步数据 |
| 按需缓存 | ✅     | 外键在本地，可引用缓存数据 |

#### 多对一（从表N → 主表1，外键在从表）

当前实体是从表，主表策略：

| 从表策略 | 可行性 | 原因                       |
| -------- | ------ | -------------------------- |
| 纯本地   | ✅     | 外键在本地，可引用本地     |
| 纯远程   | ✅     | 外键在本地，可引用远程     |
| 全量同步 | ✅     | 外键在本地，可引用同步数据 |
| 条件同步 | ✅     | 外键在本地，可引用同步数据 |
| 按需缓存 | ✅     | 外键在本地，可引用缓存数据 |

#### 一对一（外键在任一方）

| 从表策略 | 外键位置 | 可行性 | 原因                       |
| -------- | -------- | ------ | -------------------------- |
| 纯本地   | 任一方   | ✅     | 都在本地                   |
| 纯远程   | 本地     | ✅     | 外键在本地，可引用远程     |
| 纯远程   | 远程     | ❌     | 外键在远程，无法引用本地   |
| 全量同步 | 任一方   | ✅     | 都已同步到本地             |
| 条件同步 | 本地     | ✅     | 外键在本地，可引用同步数据 |
| 条件同步 | 远程     | ❌     | 外键在远程，无法引用本地   |
| 按需缓存 | 本地     | ✅     | 外键在本地，可引用缓存数据 |
| 按需缓存 | 远程     | ❌     | 外键在远程，无法引用本地   |

#### 多对多（中间表存储双方ID）

| 从表策略 | 中间表位置 | 可行性 | 原因                         |
| -------- | ---------- | ------ | ---------------------------- |
| 纯本地   | 本地       | ✅     | 都在本地                     |
| 纯远程   | 本地       | ✅     | 中间表在本地，可引用双方     |
| 纯远程   | 远程       | ❌     | 中间表在远程，无法引用本地   |
| 全量同步 | 本地       | ✅     | 中间表在本地，可引用双方     |
| 全量同步 | 远程       | ✅     | 双方都已同步，可在远程关联   |
| 条件同步 | 本地       | ✅     | 中间表在本地，可引用双方     |
| 条件同步 | 远程       | ⚠️     | 需确保关联数据都已同步       |
| 按需缓存 | 本地       | ✅     | 中间表在本地，可引用双方     |
| 按需缓存 | 远程       | ❌     | 缓存不可预测，无法保证一致性 |

---

### 主表：条件同步

```ts
{
  type: SyncType.Filter,
  local: { adapter: 'wa-sqlite' },
  remote: {
    adapter: 'supabase',
    filter: () => ({
      combinator: 'and',
      rules: [{ field: 'updatedAt', operator: '>=', value: new Date(Date.now() - 30 * 86400000) }]
    })
  }
}
```

同"全量同步"，但需注意：

- 从表若也是条件同步，需确保过滤条件能保证数据完整性
- 中间表在远程时，需确保关联的双方都满足同步条件

---

### 主表：按需缓存

```ts
{
  type: SyncType.QueryCache,
  local: { adapter: 'wa-sqlite' },
  remote: { adapter: 'supabase' }
}
```

同"全量同步"，但限制更多：

- 不建议中间表在远程（缓存数据不稳定）
- 从表建议纯本地或也是按需缓存（确保关联数据可用）
