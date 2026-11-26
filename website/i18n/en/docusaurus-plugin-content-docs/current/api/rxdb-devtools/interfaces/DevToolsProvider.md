# DevToolsProvider

Defined in: [provider/types.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L172)

A provider implementation for one domain.

## Extended by

- [`DevToolsOpfsFilesProvider`](DevToolsOpfsFilesProvider.md)
- [`DevToolsFilesProviderWithSource`](DevToolsFilesProviderWithSource.md)
- [`DevToolsRxdbDatabaseProvider`](DevToolsRxdbDatabaseProvider.md)

## Properties

### descriptor \{#descriptor\}

```ts
readonly descriptor: DevToolsProviderDescriptor;
```

Defined in: [provider/types.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L174)

This provider's descriptor; the second layer of the authorization matrix reads it directly.

## Methods

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
| `params` | `unknown` | Parameters that have passed the generic wire-layer validation but are not yet interpreted per operation; the implementation is responsible for domain-level validation (e.g. path validity → `invalid_path`). |

#### Returns

`Promise`&lt;[`DevToolsProviderResult`](../type-aliases/DevToolsProviderResult.md)&gt;

A successful result or a mapped error.

#### Remarks

The caller guarantees that `operation` has passed the three layers of authorization, so the
implementation must **not** judge permissions again — two separate checks would drift sooner
or later, and drift shows up as one of them silently relaxing.
