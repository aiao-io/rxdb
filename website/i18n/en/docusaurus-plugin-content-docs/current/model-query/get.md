# get

`get` fits the "I already know the primary key" case.

## Signature

```ts
get(id: EntityStaticType<T, 'idType'>): Observable<InstanceType<T>>
```

## Basic usage

```ts
import { firstValueFrom } from 'rxjs';

const todo = await firstValueFrom(Todo.get(todoId));
console.log(todo.title);
```

## What happens when the record is missing

`get()` does not return `null` when the record is not found; it throws an `RxDBError`.

The current error text is:

```ts
Entity with id ${id} not found
```

## Why it beats `findOne` here

Internally `get()` builds a `where` from the `id` and forces `limit: 1`. When you already know the primary key, there is no point writing `findOne(where id = ...)` by hand.

## About caching

Within one RxDB lifecycle, the same entity usually hits the same entity reference cache, so you often get the same object reference instead of a fresh object each time.

This is only an in-process cache, not a persistent cache across restarts.

## Comparison

| Method    | Empty-result behavior | Fits              |
| --------- | --------------------- | ----------------- |
| `get`     | Throws                | Known primary key |
| `findOne` | Returns `null`        | Conditional query |

## See also

- [findOne](./findOne.md)
- [findOneOrFail](./findOneOrFail.md)
