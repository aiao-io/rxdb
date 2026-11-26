# find

`find` is the everyday list query: filtering, ordering, and a result limit, plus traditional pagination through `offset`.

## Signature

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

The repository layer fills in the current defaults:

- `limit` defaults to `100`
- `offset` defaults to `0`

## Basic query

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

## Ordering and filtering

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

## When to use it

- Admin table pagination
- Ordinary list pages
- When you explicitly need `limit + offset`

## When not to use it

- When you need all results, use [findAll](./findAll.md)
- For infinite scrolling or stable cursor pagination, use [findByCursor](./findByCursor.md)
- When you only need one record, use [findOne](./findOne.md)

## Performance notes

- The larger the `offset`, the more expensive the page
- Keep `orderBy` fields on commonly used indexes
- For live scrolling over large lists, prefer [findByCursor](./findByCursor.md)
