---
sidebar_label: 'InfiniteScrollOptions⟨T⟩'
---

# InfiniteScrollOptions`<T>`

```ts
type InfiniteScrollOptions<T> =
  EntityStaticType<T, 'findByCursorOptions'> | (() => EntityStaticType<T, 'findByCursorOptions'>);
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L79)

Angular infinite scroll query options or a reactive options reader.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Remarks

RAN-014: previously hardcoded to the generic `FindByCursorOptions<T>`, so a custom `findByCursorOptions` declared by an entity via `ENTITY_STATIC_TYPES` had no effect on the Angular side — the same declaration that React/Vue enforce, Angular let through. After deriving from [EntityStaticType](../../rxdb/type-aliases/EntityStaticType.md), all three are consistent: the declared shape is used when the entity declares one, and only otherwise does it fall back to `FindByCursorOptions<T, object>`.
