---
sidebar_label: 'ActionResource⟨Options, RT⟩'
---

# ActionResource`<Options, RT>`

Defined in: [rxdb-angular/src/use-action.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-action.ts#L16)

Return value of [useAction](../functions/useAction.md).

## Type Parameters

| Type Parameter                                | Description                                            |
| --------------------------------------------- | ------------------------------------------------------ |
| <a id="type-parameter-options"></a> `Options` | Input type of `execute`; `void` when there is no input |
| <a id="type-parameter-rt"></a> `RT`           | Return type of the async function                      |

## Properties

### execute \{#execute\}

```ts
readonly execute: (options) => Promise<RT>;
```

Defined in: [rxdb-angular/src/use-action.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-action.ts#L20)

Triggers one invocation; errors bubble up to the caller as-is.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `options` | `Options` |

#### Returns

`Promise`&lt;`RT`&gt;

---

### isPending \{#ispending\}

```ts
readonly isPending: Signal<boolean>;
```

Defined in: [rxdb-angular/src/use-action.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-action.ts#L18)

Whether there are in-flight calls; for concurrent calls it counts them, and only returns to `false` after the last one settles.
