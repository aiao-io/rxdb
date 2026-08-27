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

## QueryCache 快速入门

`SyncType.QueryCache` 适用于**数据量远超本地能装下的范围**、又希望重复查询能命中本地的场景。
它与 Full / Filter 的根本区别是：**远端是唯一事实源，本地只是缓存**。

### QueryCache 基本配置

```ts
import { RxDB, SyncType } from '@aiao/rxdb';

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Product],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'supabase' }
  }
});

const repo = rxdb.getRepository(Product);

// 与其他策略完全相同的调用面：Promise / 实体实例 / limit / offset / orderBy
const rows = await repo.find({
  where: { combinator: 'and', rules: [{ field: 'categoryId', operator: '=', value: 'c-1' }] },
  limit: 20,
  offset: 0
});
```

### 一次 find 发生了什么

1. `fetchMetadata(where)` 从远端取该查询命中的全部 `{ id, updatedAt }`；
2. 同时读本地对该 `where` 的投影，得到本地已有的行；
3. 两侧比对，分成四类：**缺失**（本地没有）、**过时**（本地 `updatedAt` 更旧）、**新鲜**、**孤儿**（本地有、远端已无）；
4. 孤儿从本地删除，缺失 + 过时经 `findByIds` 拉回并写入本地；
5. 从本地行仓储按完整查询选项读出结果，`limit` / `offset` / `orderBy` 下推成 SQL。

### 与其他策略的行为差异

| 行为           | Full / Filter                    | QueryCache                                         |
| :------------- | :------------------------------- | :------------------------------------------------- |
| 事实源         | 本地（可离线写）                 | 远端                                               |
| 写路径         | 写本地，随同步推送               | 先写远端，成功后才更新本地缓存；远端失败则本地不动 |
| 本地 changelog | 记录（支持 undo/redo、冲突解决） | **不记录**，也没有冲突解决                         |
| 远端删除       | 经变更流下发                     | 同步时按孤儿从本地清除                             |
| 本地数据完整性 | 完整数据集 / 子集                | 仅「查过的 `where`」的并集                         |

:::warning 同步粒度是 `where`，不是 `limit`
`fetchMetadata` 的粒度就是整个 `where`：`limit: 20` 不会让同步只处理 20 条。
用 `where` 收窄结果集；靠 `limit` 收窄会造成拉取放大。放大程度可用 `onSyncStats` 观测。
:::

### 同步记忆（`syncStaleTime`）

同步的粒度既然是整个 `where`，翻页就只改 `limit` / `offset` —— 同一个 `where` 的第二页
不该再向远端校验一次。`sync.local.syncStaleTime`（毫秒，默认 `1000`）就是这段「刚同步过」的记忆窗口：
窗口内对同一 `where` 的重复读直接读本地投影，一次翻页交互只发生一次同步。

```ts
sync: {
  type: SyncType.QueryCache,
  local: { adapter: 'wa-sqlite', syncStaleTime: 5000 },
  remote: { adapter: 'supabase' }
}
```

窗口只**推迟**重新校验，不取消它：到期、本实体发生写、适配器重连，三者任一都会立即让记忆失效。
配 `0` 表示完全关闭记忆，回到「每次读都向远端校验」。

### 缓存优先与离线降级

```ts
const rows = await repo.find({
  where,
  // 先把本地缓存交出来，远端校验在后台跑完并落本地（stale-while-revalidate）
  localCacheFirst: true,
  // 网络故障时降级读本地缓存；本地也没有则抛 NetworkOfflineError
  offlineFallback: true,
  onSyncStats: stats => {
    // remoteCount 是 where 命中的远端总数，据此判断拉取是否放大
    console.log(stats.remoteCount, stats.pulledCount, stats.durationMs);
  }
});
```

`localCacheFirst` 也可以在 `sync.local.localCacheFirst` 里配成默认值，调用级传入的值优先。

`offlineFallback` **只吞网络故障**（连接失败、DNS、超时）。业务错误——401、唯一键冲突、
字段校验失败等带 HTTP 状态码的响应——原样上抛，不会被静默换成一份陈旧缓存。

### 适配器能力要求

两侧适配器需实现 QueryCache 的必需方法：本地 `getMetadataByIds` / `upsertMany` / `deleteByIds`，
远端 `fetchMetadata` / `findByIds`。继承适配器基类时它们是 `abstract`，编译期即有保证；
自定义适配器对象缺任一项时，构造仓储即抛 `RxDBQueryCacheCapabilityError` 并列出缺失的方法名。

### 远端行的列契约

**`findByIds` 返回的每一行，必须带齐本地表的全部非空列** —— 包括 `EntityBase` 声明的
`createdAt` / `updatedAt`。这条约束对所有 QueryCache 远端成立（HTTP、Supabase、自研服务），
因为它来自**落地路径**而不是某个协议。

原因是 `upsertMany` 是绕开仓储的裸 SQL 写：

```ts
// 实体上写了默认值 —— 但它是**仓储层**的东西
{ name: 'createdAt', type: PropertyType.date, default: () => new Date() }
```

函数形式的 `default` 一个字都不会进 `CREATE TABLE`，本地表上 `createdAt` 就是 `NOT NULL`。
QueryCache 的拉取落地不经过仓储，于是远端不带这一列 → INSERT 不含该列 → 被数据库拒绝。

哪些列可以省略：

- 可空列（`nullable: true`）；
- 写了**字面量** `default` 的列——它进了 DDL 的 `DEFAULT` 子句。**`binary` 除外**：
  建表时明确跳过这一类的默认值，列上仍是光秃秃的 `NOT NULL`；
- uuid / integer 主键（数据库端能自己生成）。

关系的外键列（`ONE_TO_ONE` / `MANY_TO_ONE`）也是本地表上的物理列，同样要带，但豁免口径与
普通列**不一样**：可空、或 `onDelete` / `onUpdate` 为 `SET NULL`（这两种 DDL 不给 `NOT NULL`）
才可省；字面量 `default` **只对 `MANY_TO_ONE` 生效**——DDL 的 `DEFAULT` 子句嵌在
`kind === MANY_TO_ONE` 分支里，一对一列建出来只有 `NOT NULL`，跟着放行等于让「过了校验的行」
在 INSERT 时被数据库拒掉。

其余一律必须自带。校验认两种写法：行里带**属性名 / 关系名**（`owner`）或**物理列名**
（`ownerId`）都算带齐。

同一批里的行还必须**列集一致**。批内异构（第 1 行带 `tag`、第 2 行不带）会被拒绝：
落地按批生成一条 INSERT，缺键的行会被绑成 `NULL`，把可空列**静默清空**。

不满足时，sqlite 系适配器在落地**之前**抛 `RxDBQueryCacheRowContractError`，点名实体、
缺失列与成因，且这一批**一行都不会写入**。

:::warning 缺列不会就地补默认值
补一个 `new Date()` 出来的是**本机拉取的时刻**，不是记录创建的时刻：两台设备拉同一行会得到
不同的 `createdAt`，而这个差异要到跨设备对比时才暴露。缺列是后端或协议实现的问题，
在这里补齐等于把它伪装成成功。
:::

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
