---
sidebar_label: 'DevToolsProviderOperation⟨TDomain⟩'
---

# DevToolsProviderOperation`<TDomain>`

```ts
type DevToolsProviderOperation<TDomain> = (typeof DEVTOOLS_PROVIDER_OPERATIONS)[TDomain][number];
```

Defined in: [provider/descriptor.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L57)

Mapping from domain to operation name.

## Type Parameters

| Type Parameter                                                                                                | Default type                                          |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-tdomain"></a> `TDomain` _extends_ [`DevToolsProviderDomain`](DevToolsProviderDomain.md) | [`DevToolsProviderDomain`](DevToolsProviderDomain.md) |
