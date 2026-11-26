---
sidebar_label: "ActionResource⟨Options, RT⟩"
---

# ActionResource`<Options, RT>`

Defined in: [rxdb-react/src/use-action.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-action.ts#L11)

Return value of [useAction](../functions/useAction.md).

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-options"></a> `Options` | Input type of `execute`; `void` when there is no input |
| <a id="type-parameter-rt"></a> `RT` | Return type of the async function |

## Properties

### execute \{#execute\}

```ts
readonly execute: (options) => Promise<RT>;
```

Defined in: [rxdb-react/src/use-action.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-action.ts#L23)

Triggers one invocation.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `Options` |

#### Returns

`Promise`&lt;`RT`&gt;

#### Remarks

Function identity is stable across renders, so it can be used directly in `useEffect` / `useCallback` dependency arrays. What it calls is always the `promiseFn` from the **latest committed render**: this holds even when invoked from this commit's layout effects (including parent components') or from events dispatched synchronously during commit; concurrent renders that are suspended or discarded and never committed cannot change it.

***

### isPending \{#ispending\}

```ts
readonly isPending: boolean;
```

Defined in: [rxdb-react/src/use-action.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-action.ts#L13)

Whether there are in-flight calls; for concurrent calls it counts them, and only returns to `false` after the last one settles.
