# 插件升级与启用

插件通过 `RxDB` 配置的 `plugins` 数组注册。启用一个新插件通常包含三步：安装包、在配置中注册、按插件要求标注实体元数据。

## 启用全文搜索插件

以 `@aiao/rxdb-plugin-search` 为例（仅兼容 `@aiao/rxdb-adapter-sqlite-wasm` 适配器）：

```typescript
// 1. 安装
// pnpm add @aiao/rxdb-plugin-search @aiao/rxdb-adapter-sqlite-wasm

// 2. 在数据库配置中注册插件
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

const db = new RxDB({
  dbName: 'myapp',
  entities: [Article],
  plugins: [
    rxDBPluginSearch({
      debounce: 300, // 默认 300ms；0 表示关闭
      pageSize: 50
    })
  ]
});
```

```typescript
// 3. 在实体上标注 searchable 字段，才会建立 FTS5 表
@Entity({
  name: 'article',
  properties: [
    { name: 'title', type: PropertyType.string, searchable: true },
    { name: 'body', type: PropertyType.string, searchable: true }
  ]
})
export class Article extends EntityBase {
  title!: string;
  body!: string;
}
```

同一实体至少标注一个 `searchable` 字段才会挂载搜索能力；否则该 collection 不建立 FTS5 表。

## 框架绑定

搜索插件的框架层同功能对称：

| 框架    | 包                                 | 入口                                                       |
| :------ | :--------------------------------- | :--------------------------------------------------------- |
| Angular | `@aiao/rxdb-plugin-search-angular` | `useSearch()`（旧名 `injectSearch` 为 `@deprecated` 别名） |
| React   | `@aiao/rxdb-plugin-search-react`   | `useSearch()`                                              |
| Vue     | `@aiao/rxdb-plugin-search-vue`     | `useSearch()`                                              |

## 升级已启用的插件

1. 所有 `@aiao/*` 包同步版本号，升级时**插件与核心保持同一版本**。
2. 升级后检查插件选项是否有破坏性变更（见对应版本的 [v1 升级说明](./v1.md)）。
3. 若插件涉及底层表结构（如 FTS5），首次以新版本连接时会按需重建，无需手工干预。

## 注意事项

1. 搜索插件在非 `sqlite-wasm` 适配器上会在数据库创建阶段 fail-fast —— 启用前对照[兼容矩阵](../compatibility.md)。
2. 插件选项变更不影响已持久化的业务数据，仅影响运行期行为。

## 参考

- 搜索插件完整用法见「插件 › 全文搜索」章节
- [框架绑定迁移](./frameworks.md)
