---
sidebar_label: 'ActionResource⟨Options, RT⟩'
---

# ActionResource`<Options, RT>`

Defined in: [rxdb-vue/src/use-action.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-action.ts#L11)

The wrapped async action.

## Type Parameters

| Type Parameter                                | Description                                     |
| --------------------------------------------- | ----------------------------------------------- |
| <a id="type-parameter-options"></a> `Options` | Call parameter type; `void` means no parameters |
| <a id="type-parameter-rt"></a> `RT`           | Return type of the async function               |

## Properties

### execute \{#execute\}

```ts
readonly execute: (options) => Promise<RT>;
```

Defined in: [rxdb-vue/src/use-action.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-action.ts#L21)

Calls the wrapped async function.

#### Parameters

| Parameter | Type      | Description                                  |
| --------- | --------- | -------------------------------------------- |
| `options` | `Options` | Passed through to the wrapped function as-is |

#### Returns

`Promise`&lt;`RT`&gt;

The return value of the wrapped function, passed through as-is

#### Throws

Any error thrown by the wrapped function bubbles up as-is (not swallowed, not normalized)

---

### isPending \{#ispending\}

```ts
readonly isPending: ComputedRef<boolean>;
```

Defined in: [rxdb-vue/src/use-action.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-action.ts#L13)

Whether there **remain** calls in flight; counts outstanding calls, not a boolean flag.
