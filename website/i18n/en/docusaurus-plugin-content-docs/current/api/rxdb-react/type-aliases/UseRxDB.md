---
sidebar_label: "UseRxDB⟨T⟩"
---

# UseRxDB`<T>`

```ts
type UseRxDB<T> = (db?) => T;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L52)

Hook type that reads RxDB from an explicit parameter or the nearest Provider; throws when not ready.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `db?` | `T` |

## Returns

`T`
