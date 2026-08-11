# find

`find` 是最常规的列表查询：有过滤、有排序、有限制数量，也可以配合 `offset` 做传统分页。

## 签名

```ts
find(options: FindOptions<T>): Observable<InstanceType<T>[]>
```

```ts
interface FindOptions<T> {
  where: RuleGroup<InstanceType<T>>;
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
}
```

当前默认值由仓库层补齐：

- `limit` 默认 `100`
- `offset` 默认 `0`

## 基础查询

```ts
import { firstValueFrom } from 'rxjs';

const todos = await firstValueFrom(
  Todo.find({
    where: { combinator: 'and', rules: [] },
    limit: 20,
    offset: 0
  })
);
```

## 排序与过滤

```ts
const todos = await firstValueFrom(
  Todo.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [
      { field: 'createdAt', sort: 'desc' },
      { field: 'id', sort: 'asc' }
    ],
    limit: 20
  })
);
```

## 什么时候用它

- 后台表格分页
- 普通列表页
- 你明确需要 `limit + offset`

## 不适合的场景

- 需要全量结果时，使用 [findAll](./findAll.md)
- 做无限滚动或稳定游标分页时，用 [findByCursor](./findByCursor.md)
- 只查一条时，用 [findOne](./findOne.md)

## 性能提醒

- `offset` 越大，分页越贵
- 排序字段尽量落在常用索引上
- 大列表的实时滚动更适合 [findByCursor](./findByCursor.md)
