# PersistedStateRegistryOptions

Defined in: [packages/utils/src/@browser/persisted-state.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L100)

Constructor options for [PersistedStateRegistry](../classes/PersistedStateRegistry.md).

## Properties

### onError? \{#onerror\}

```ts
onError?: (error) => void;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L109)

Out-of-band reporting when a disk read / write fails.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `error` | `unknown` |

#### Returns

`void`

#### Remarks

For wiring into the host framework's global error channel (Angular `ErrorHandler`, Sentry, `console.error`, etc.).
Complementary to [PersistedStateEntry.persistError](PersistedStateEntry.md#persisterror): the former is for ops, the latter for the UI.
When not provided, failures are **silently** swallowed — still observable via `persistError()`.
