# get

`get` 适合“我已经知道主键”的场景。

## 签名

```ts
get(id: EntityStaticType<T, 'idType'>): Observable<InstanceType<T>>
```

## 基础用法

```ts
import { firstValueFrom } from 'rxjs';

const todo = await firstValueFrom(Todo.get(todoId));
console.log(todo.title);
```

## 没找到会怎样

`get()` 找不到记录时不会返回 `null`，而是抛出 `RxDBError`。

当前错误文本是：

```ts
Entity with id ${id} not found
```

## 为什么比 `findOne` 更合适

`get()` 内部就是按 `id` 生成 `where`，并强制 `limit: 1`。你已经知道主键时，没必要再手写一层 `findOne(where id = ...)`。

## 关于缓存

在同一个 RxDB 生命周期里，同一条实体通常会命中同一个实体引用缓存，所以你经常会拿到同一对象引用，而不是每次一份新对象。

这只是当前进程内缓存，不是跨重启持久缓存。

## 对比

| 方法      | 空结果行为  | 适合场景 |
| --------- | ----------- | -------- |
| `get`     | 抛错        | 已知主键 |
| `findOne` | 返回 `null` | 条件查询 |

## 参考

- [findOne](./findOne.md)
- [findOneOrFail](./findOneOrFail.md)
