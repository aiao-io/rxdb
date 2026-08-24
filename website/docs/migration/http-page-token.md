# HTTP 适配器翻页键改名：`cursor` → `pageToken`

`@aiao/rxdb-adapter-http` 的翻页参数改名了：handler 拿到的 `ctx.cursor` 变成 `ctx.pageToken`，
`parse` 返回的 `{ rows, nextCursor }` 变成 `{ rows, nextPageToken }`。

这是一次**破坏性变更**，影响所有用了游标（token）翻页形态的 handler。
只用数组形态（短页终止）的接入方不受影响，`ctx.offset` / `ctx.limit` 没有变化。

## 为什么改

「cursor」在这个仓库里已经被 core 占了：[`findByCursor`](../model-query/findByCursor.md) 的游标是
**实体实例**做的 keyset 锚点——它有字段、能比较、会在 `Repository` 里被编译成 `where` 规则组，
适配器根本看不到它。

HTTP 适配器这个是完全不同的东西：远端发的**不透明续页串**，适配器只做「相等 / 不等 / 是否
`undefined`」三种判断，从不解析内部结构。两者同名，读的人会以为后者也能拆开看，
进而写出「按 cursor 里的时间戳过滤」这类只在某一个后端上碰巧成立的 handler。

`pageToken` / `nextPageToken` 整词不含 cursor，且 `token` 本身就表示「不透明、别拆」。

## 变更清单

| 位置                                      | 变更前                 | 变更后                      |
| ----------------------------------------- | ---------------------- | --------------------------- |
| `FetchMetadataContext`                    | `cursor?: string`      | `pageToken?: string`        |
| `FetchMetadataResult` 对象形态            | `{ rows, nextCursor }` | `{ rows, nextPageToken }`   |
| `HttpPaginationError.reason`              | `cursor_not_advancing` | `page_token_not_advancing`  |
| `createRestHandlers()` 发出的请求体       | `{ …, cursor }`        | `{ …, pageToken }`          |

导出的类型名、类名与函数名都没有变化，`import` 语句不需要改。

## 怎么改

### 自己写的 handler

```typescript
// 之前
onFetchMetadata: {
  request: ctx => ({
    url: `${ctx.entityName}/metadata`,
    method: 'POST',
    body: { where: ctx.where, limit: ctx.limit, cursor: ctx.cursor }
  }),
  parse: body => body as { rows: Metadata[]; nextCursor?: string }
}

// 之后
onFetchMetadata: {
  request: ctx => ({
    url: `${ctx.entityName}/metadata`,
    method: 'POST',
    body: { where: ctx.where, limit: ctx.limit, pageToken: ctx.pageToken }
  }),
  parse: body => body as { rows: Metadata[]; nextPageToken?: string }
}
```

`request()` 里漏改 `ctx.cursor` 会**编译失败**（属性不存在），不需要担心漏网。

服务端的字段名不必跟着改——`parse` 就是做这个映射的地方：

```typescript
parse: body => {
  const page = body as { rows: Metadata[]; next_cursor?: string };
  return { rows: page.rows, nextPageToken: page.next_cursor };
}
```

### 用 `createRestHandlers()` 的

预设发出的请求体键从 `cursor` 变成 `pageToken`，**服务端要跟着改**读取的字段名。
不改的话服务端每页都收不到位置参数，会一直回第一页，翻页不推进，直到 `maxPages`
触顶抛 `HttpPaginationError`——而错误信息指向的是页数上限，不是这个键。

响应仍由你的 `parse` 决定，如果服务端返回的是 `{ rows, nextCursor }`，见下一节。

### `catch` 里判 `reason` 的

```typescript
if (e instanceof HttpPaginationError && e.reason === 'page_token_not_advancing') { … }
```

`reason` 是字符串联合类型，写旧值会编译失败。

## 遗留的 `nextCursor` 会抛错，不会被当成末页

`parse` 返回 `{ rows, nextCursor: 'x' }` 而没有 `nextPageToken` 时，适配器抛
`HttpHandlerContractError`，**不做兼容读取**。

这里刻意不宽容：静默读成 `undefined` 就等于「首页即末页」，整表只剩第一页，
其余 id 会被上层判成**远端已删除**——叠加 QueryCache 的删除传播，还活着的行会从本地被抹掉，
而全程没有任何错误。这正是这个适配器通篇在防的那一类静默截断，不能因为一次改名把它引进来。

两个键都在时以 `nextPageToken` 为准，不算遗留：说明 handler 已经认得新契约，
多出来的 `nextCursor` 只是原样透传的远端字段。

## 参考

- [HTTP 适配器](../adapters/http.md)
- [`findByCursor`](../model-query/findByCursor.md)：core 的 keyset 游标，与本文无关的另一个概念
