# DevToolsPanelEndpointPorts

Defined in: [v2/panel-endpoint.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L144)

The construction ports of the panel data plane client.

## Properties

### clock \{#clock\}

```ts
readonly clock: DevToolsClock;
```

Defined in: [v2/panel-endpoint.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L148)

The only timing source for request timeouts.

---

### send \{#send\}

```ts
readonly send: (message) => void;
```

Defined in: [v2/panel-endpoint.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L146)

The outbound callback; wired to the concrete transport by the platform driver.

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `message` | [`DevToolsPanelNegotiationMessage`](../type-aliases/DevToolsPanelNegotiationMessage.md) |

#### Returns

`void`

---

### supportedVersions? \{#supportedversions\}

```ts
readonly supportedVersions?: readonly number[];
```

Defined in: [v2/panel-endpoint.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L150)

The protocol versions supported by this end; defaults to `[2, 1]`.
