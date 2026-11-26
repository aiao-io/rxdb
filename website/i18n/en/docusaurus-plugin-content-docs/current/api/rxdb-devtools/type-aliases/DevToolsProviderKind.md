---
sidebar_label: 'DevToolsProviderKind⟨TDomain⟩'
---

# DevToolsProviderKind`<TDomain>`

```ts
type DevToolsProviderKind<TDomain> = (typeof DEVTOOLS_PROVIDER_KINDS)[TDomain][number];
```

Defined in: [provider/descriptor.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L39)

Mapping from domain to semantic kind.

## Type Parameters

| Type Parameter                                                                                                | Default type                                          |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-tdomain"></a> `TDomain` _extends_ [`DevToolsProviderDomain`](DevToolsProviderDomain.md) | [`DevToolsProviderDomain`](DevToolsProviderDomain.md) |
