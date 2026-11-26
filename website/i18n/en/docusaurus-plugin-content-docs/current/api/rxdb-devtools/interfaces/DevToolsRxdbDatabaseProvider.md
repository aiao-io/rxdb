# DevToolsRxdbDatabaseProvider

Defined in: [rxdb/database-provider.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L96)

The `database` provider; additionally exposes the subscription reclaim entry point.

## Extends

- [`DevToolsProvider`](DevToolsProvider.md)

## Properties

### descriptor \{#descriptor\}

```ts
readonly descriptor: DevToolsProviderDescriptor;
```

Defined in: [provider/types.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L174)

This provider's declaration; the second layer of the authorization matrix reads it directly.

#### Inherited from

[`DevToolsProvider`](DevToolsProvider.md).[`descriptor`](DevToolsProvider.md#descriptor)

## Methods

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [rxdb/database-provider.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L106)

Removes all RxDB event listeners and closes event forwarding (to receive events again afterwards, `events` must be called again).

#### Returns

`void`

#### Remarks

Idempotent. Both session end and the connector's `disconnect()` call it; without reclaiming, the instance cannot be garbage-collected because the listeners still exist. Swapping instances at runtime does not require calling it: the listeners on the old instance are already removed at rebinding time; see [DevToolsRxdbDatabaseProviderPorts.getRxDB](DevToolsRxdbDatabaseProviderPorts.md#getrxdb).

***

### invoke() \{#invoke\}

```ts
invoke(operation, params): Promise<DevToolsProviderResult>;
```

Defined in: [provider/types.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L188)

Executes an operation.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operation` | `string` | The authorized operation name. |
| `params` | `unknown` | Parameters that have passed the wire layer's generic validation but have not been interpreted per operation; the implementation is responsible for domain-level validation (e.g. path validity → `invalid_path`). |

#### Returns

`Promise`&lt;[`DevToolsProviderResult`](../type-aliases/DevToolsProviderResult.md)&gt;

A successful result or an already-mapped error.

#### Remarks

The caller guarantees that `operation` has passed the three-layer authorization, so the implementation does **not** judge permissions again — two judgments would drift sooner or later, and the drift manifests as one of them quietly loosening.

#### Inherited from

[`DevToolsProvider`](DevToolsProvider.md).[`invoke`](DevToolsProvider.md#invoke)
