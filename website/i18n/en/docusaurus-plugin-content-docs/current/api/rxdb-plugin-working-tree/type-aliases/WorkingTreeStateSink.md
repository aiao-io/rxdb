---
sidebar_label: "WorkingTreeStateSink⟨S⟩"
---

# WorkingTreeStateSink`<S>`

```ts
type WorkingTreeStateSink<S> = (state) => void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L202)

Where state goes; each of the three frameworks wires it to its own reactive primitives.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-s"></a> `S` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | `S` |

## Returns

`void`
