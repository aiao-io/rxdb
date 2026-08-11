# @aiao/rxdb-plugin-search

`@aiao/rxdb-plugin-search` 为 `@aiao/rxdb` 提供**统一的全局全文搜索入口**，基于 SQLite FTS5 的外部内容表与同步 trigger，让带 `searchable: true` 标注的字段在任意 INSERT/UPDATE/DELETE 后保持索引一致，并通过单一 `rxDB.search(query)` / `collection.search(query)` API 暴露响应式结果流。

> **仅兼容 `@aiao/rxdb-adapter-sqlite-wasm` 适配器**；在其他适配器下初始化阶段会抛 `SearchUnsupportedAdapterError` fail-fast。

## 核心特性

- **FTS5 外部内容表**：不重复存储文本，原表是 single source of truth
- **同步 trigger**：INSERT / UPDATE / DELETE 自动同步；`stringArray` 字段通过 `json_each + group_concat` 展开
- **响应式状态机**：`idle → loading → success / empty / error`，严格五态
- **默认 300ms 防抖**：`setQuery` 连续输入只触发末次查询；数据变更引发的重查**绕过防抖**直通
- **失败保留**：`error` 态保留最后一次查询词与结果，`retry()` 一键重试
- **schema 漂移检测**：基于字段签名比对，不匹配立即抛 `SearchSchemaMismatchError`，不静默覆盖
- **三框架绑定**：Angular `useSearch` / React `useSearch` / Vue `useSearch` API 对齐

## 安装

```bash npm2yarn
npm install @aiao/rxdb-plugin-search
# 框架绑定（按需选其一）
npm install @aiao/rxdb-plugin-search-angular
npm install @aiao/rxdb-plugin-search-react
npm install @aiao/rxdb-plugin-search-vue
```

peer dependencies：`@aiao/rxdb`、`@aiao/rxdb-adapter-sqlite-core`、`@aiao/rxdb-adapter-sqlite-wasm`、`rxjs`。

## Schema 标注

仅以下字段接口支持 `searchable: true`：

- `StringProperty`
- `EnumProperty`
- `StringArrayProperty`（数组元素按 `\n` join 后索引）

```typescript
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Article',
  tableName: 'article',
  properties: [
    { name: 'id', type: PropertyType.uuid, primary: true },
    { name: 'title', type: PropertyType.string, required: true, searchable: true },
    { name: 'body', type: PropertyType.string, required: true, searchable: true },
    { name: 'tags', type: PropertyType.stringArray, default: () => [], searchable: true },
    { name: 'status', type: PropertyType.enum, enum: ['draft', 'published'], searchable: true },
    { name: 'views', type: PropertyType.integer } // 不参与搜索
  ]
})
class Article extends EntityBase {}
```

同一 entity 至少标注一个 `searchable` 字段才会建立 FTS5 表；否则该 collection 不挂载 `.search()`。

## 注册插件

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

const rxdb = new RxDB({ adapter });
rxdb.use(
  rxDBPluginSearch({
    debounce: 300, // 默认 300ms；0 表示关闭
    pageSize: 50,
    snippetLength: 120,
    excludedCollections: [] // 全局排除某些 collection
  })
);
await rxdb.connect();
```

## Angular 集成

```typescript
import { Component, inject } from '@angular/core';
import { RxDB } from '@aiao/rxdb';
import { useSearch } from '@aiao/rxdb-plugin-search-angular';

@Component({
  selector: 'app-search',
  template: `
    <input
      [value]="query()"
      (input)="setQuery($any($event.target).value)"
      aria-label="搜索"
      role="searchbox"
      type="search"
    />
    <p [attr.aria-live]="'polite'">
      @switch (state()) {
        @case ('loading') {
          搜索中…
        }
        @case ('empty') {
          无结果
        }
        @case ('error') {
          出错：{{ error()?.message }}
          <button (click)="retry()">重试</button>
        }
        @case ('success') {
          共 {{ results().length }} 条
        }
      }
    </p>
  `
})
export class SearchComponent {
  private readonly db = inject(RxDB);
  private readonly handle = useSearch(this.db);

  readonly query = this.handle.query;
  readonly results = this.handle.results;
  readonly state = this.handle.state;
  readonly error = this.handle.error;

  setQuery(q: string) {
    this.query.set(q);
  }
  retry() {
    this.handle.retry();
  }
}
```

## React 集成

```tsx
'use client';
import { useSearch } from '@aiao/rxdb-plugin-search-react';
import { useRxDB } from '@aiao/rxdb-react';

export function SearchPage() {
  const db = useRxDB();
  const { query, setQuery, results, state, error, retry } = useSearch(db);
  return (
    <div>
      <input type="search" role="searchbox" value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索" />
      <p aria-live="polite">
        {state === 'loading' && '搜索中…'}
        {state === 'empty' && '无结果'}
        {state === 'error' && (
          <>
            出错：{error?.message} <button onClick={retry}>重试</button>
          </>
        )}
        {state === 'success' && `共 ${results.length} 条`}
      </p>
    </div>
  );
}
```

## Vue 集成

```vue
<script lang="ts" setup>
import { useRxDB } from '@aiao/rxdb-vue';
import { useSearch } from '@aiao/rxdb-plugin-search-vue';

const db = useRxDB();
const { query, results, state, error, retry } = useSearch(db);
</script>

<template>
  <input v-model="query" aria-label="搜索" role="searchbox" type="search" />
  <p aria-live="polite">
    <span v-if="state === 'loading'">搜索中…</span>
    <span v-else-if="state === 'empty'">无结果</span>
    <span v-else-if="state === 'error'">
      出错：{{ error?.message }}
      <button @click="retry">重试</button>
    </span>
    <span v-else-if="state === 'success'">共 {{ results.length }} 条</span>
  </p>
</template>
```

## API 参考

### `rxDBPluginSearch(options?)`

| 选项                  | 类型                | 默认值 | 说明                     |
| --------------------- | ------------------- | ------ | ------------------------ |
| `debounce`            | `number`            | `300`  | 输入防抖（ms）；`0` 关闭 |
| `pageSize`            | `number`            | `50`   | 每页结果数               |
| `snippetLength`       | `number`            | `120`  | 命中 snippet 字符数上限  |
| `excludedCollections` | `readonly string[]` | `[]`   | 全局排除的 collection 名 |

### `rxDB.search(query, options?)` / `collection.search(query, options?)`

返回 `SearchHandle`：

| 成员          | 类型                                            | 说明                                               |
| ------------- | ----------------------------------------------- | -------------------------------------------------- |
| `results$`    | `Observable<readonly SearchResult[]>`           | 结果流（BM25 rank 升序）                           |
| `state$`      | `Observable<SearchState>`                       | `idle` / `loading` / `success` / `empty` / `error` |
| `error$`      | `Observable<SearchExecutionError \| undefined>` | 最近一次执行错误                                   |
| `hasMore$`    | `Observable<boolean>`                           | 是否还有下一页                                     |
| `setQuery(q)` | `(q: string) => void`                           | 更新查询；入防抖通道                               |
| `loadMore()`  | `() => Promise<void>`                           | 追加下一页；无更多时 no-op                         |
| `clear()`     | `() => void`                                    | 清空查询 → idle                                    |
| `retry()`     | `() => void`                                    | 在 `error` 态用最后查询词重入 loading              |
| `destroy()`   | `() => void`                                    | 取消所有订阅                                       |

### `SearchResult`

| 字段           | 说明                               |
| -------------- | ---------------------------------- |
| `entity`       | 实体名（如 `Article`）             |
| `collection`   | RxDB collection 名                 |
| `id`           | 主键                               |
| `rank`         | BM25 rank（升序）                  |
| `matchedField` | 命中字段名                         |
| `snippet`      | 命中片段（原文截断，无 HTML 标记） |

### 错误类型

- **`SearchSchemaMismatchError`** — FTS5 签名与当前 schema 不一致；**不自动 drop**，需手动清理 `_fts_<table>` 与对应 migration 记录后再挂载
- **`SearchExecutionError`** — 运行时执行错误（SQL 失败等）；可通过 `retry()` 恢复，`cause` 暴露原始异常
- **`SearchUnsupportedAdapterError`** — 使用非 sqlite-wasm adapter；在插件注册阶段 fail-fast

## 可达性（A11y）

绑定层不强制 DOM，但 demo / 文档统一约定：

- 输入框 `role="searchbox"` + `aria-label`
- 状态文案容器 `aria-live="polite"`
- 搜索中写入 `aria-busy="true"`
- 错误态的"重试"按钮需键盘可达
- 空状态 / 结果数量由 `aria-live` 区域宣告

## Schema 漂移处理

FTS5 表在首次挂载时按 `(table, field-list, normalizer-version)` 计算签名并写入 RxDB migration 记录（`fts5__<table>__v1__install`）。后续挂载会比对签名：

- **签名一致**：直接复用，`.search()` 立即可用
- **签名不一致**：抛 `SearchSchemaMismatchError`，**不会自动 DROP**

> 设计意图：FTS5 外部内容表与 trigger 一旦建立即视为用户数据；自动重建会丢失 backfill 时长与可能的索引一致性保证，因此采用 fail-fast。

恢复路径（手动）：

```sql
DROP TABLE IF EXISTS _fts_article;
DELETE FROM _rxdb_migrations WHERE name IN (
  'fts5__article__v1__install',
  'fts5__article__v1__backfill'
);
```

清理后下次连接数据库会按当前 schema 重新走 install + backfill。

## 字段级排除

只有同时满足以下条件的字段才会进入 FTS5 索引：

1. 类型为 `StringProperty` / `EnumProperty` / `StringArrayProperty`
2. 显式标注 `searchable: true`

不满足的字段（如 `IntegerProperty`、未标注的 `string`）**完全不参与索引、不参与 BM25 rank**，也不会出现在 `SearchResult.matchedField` 中。

```typescript
{ name: 'title', type: PropertyType.string, searchable: true },   // 索引
{ name: 'body',  type: PropertyType.string, searchable: true },   // 索引
{ name: 'views', type: PropertyType.integer },                    // 不索引
{ name: 'note',  type: PropertyType.string }                      // 不索引（未标注）
```

## Collection 范围控制

`rxDB.search(query, options)` 在聚合时按以下顺序求交集：

1. **Candidates**：所有「至少一个 `searchable` 字段」的 collection
2. **Plugin-level exclusion**：减去 `excludedCollections`（硬排除，无论调用层是否要求）
3. **Per-call allowlist**：与 `SearchOptions.collections` 求交集（缺省时跳过此步）

```typescript
// 全局排除评论；本次调用仅在 Article 上搜
db.search('rxdb', { collections: ['Article'] });
```

未挂载 `searchable` 字段的 collection 不会暴露 `collection.search()`，调用 `(collection as any).search` 会得到 `undefined`，可用作能力探测。

> 该解析逻辑由 [resolveSearchScope](../../../../packages/rxdb-plugin-search/src/core/scope-resolver.ts) 纯函数实现，可独立单测。

## 响应式更新与 retry

`SearchHandle` 对外暴露五态 + 两路重查通道：

- **用户输入路径**：`setQuery(q)` → 默认 300 ms 防抖 → 入 `loading`
- **数据变更路径**：底层 entity create/update/remove 事件**绕过防抖**直通 pipeline，保证写入后立即看到结果
- **失败保留**：`error` 态保留最后一次查询词与上一组结果（不会清空 UI）
- **retry 重入**：`retry()` 在 `error` 态用 `lastQuery` 重新进入 `loading`；其他态 no-op

恢复成功**不引入第六种状态**：状态从 `error → loading → success/empty`，UI 通过 `aria-live` 区域宣告变化。

```ts
// React 例：失败后用户点击 "重试"
{state === 'error' && (
  <button onClick={retry} aria-label="重试上次搜索">
    重试
  </button>
)}
```
