# count

`count` returns only the number, not the entities themselves.

## Signature

```ts
count(options: CountOptions<T>): Observable<number>
```

## Basic usage

```ts
import { firstValueFrom } from 'rxjs';

const total = await firstValueFrom(
  Todo.count({
    where: { combinator: 'and', rules: [] }
  })
);
```

## Conditional count

```ts
const completed = await firstValueFrom(
  Todo.count({
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: true }]
    }
  })
);
```

## The most common combination

```ts
const where = {
  combinator: 'and' as const,
  rules: [{ field: 'completed', operator: '=', value: false }]
};

const [items, total] = await Promise.all([
  firstValueFrom(Todo.find({ where, limit: 20, offset: 0 })),
  firstValueFrom(Todo.count({ where }))
]);
```

## Return semantics

- An empty result returns `0`
- It never returns `null`
- It is an `Observable<number>`, not a `Promise<number>`

## When to use it

- List totals
- Badge numbers
- A quick "greater than zero" check

## See also

- [find](./find.md)
- [findByCursor](./findByCursor.md)
