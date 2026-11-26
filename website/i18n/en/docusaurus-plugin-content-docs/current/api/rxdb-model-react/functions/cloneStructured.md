# cloneStructured()

```ts
function cloneStructured<T>(value, seen?): T;
```

Defined in: packages/rxdb-model/dist/structural-equal.d.ts:12

Deep-clones a structured value from model state, preserving dates, byte sequences, and circular references.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `T` |
| `seen?` | `WeakMap`&lt;`object`, `unknown`&gt; |

## Returns

`T`
