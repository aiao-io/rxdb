# findAll

`findAll` 返回满足条件的全部结果，不做分页截断。

## 签名

```ts
findAll(options: FindAllOptions<T>): Observable<InstanceType<T>[]>
```

```ts
interface FindAllOptions<T> {
  where: RuleGroup<InstanceType<T>>;
  orderBy?: OrderBy[];
}
```

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const allTodos = await firstValueFrom(
  Todo.findAll({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
```

## 适合场景

- 配置项列表
- 小型字典表
- 导出前的全量拉取
- 本地内存里的二次加工

## 不适合场景

- 大表分页
- 无限滚动
- 你只需要前几十条

这些场景请改用 [find](./find.md) 或 [findByCursor](./findByCursor.md)。

## 性能提醒

`findAll` 会把所有匹配结果都拉回来。数据量大时，即使 API 本身没问题，UI 和内存也会先扛不住。

如数据量可能持续增长，应避免使用 `findAll`。
