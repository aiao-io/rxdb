# DevToolsPanelNegotiationPorts

Defined in: [v2/negotiation-panel.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L46)

Construction ports for the panel negotiation state machine.

## Properties

### clock \{#clock\}

```ts
readonly clock: DevToolsClock;
```

Defined in: [v2/negotiation-panel.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L50)

The sole timing source for the 1,000 ms decision window.

***

### send \{#send\}

```ts
readonly send: (message) => void;
```

Defined in: [v2/negotiation-panel.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L48)

Outbound callback; wired to the concrete transport by the thin driver from 904c.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | [`DevToolsPanelNegotiationMessage`](../type-aliases/DevToolsPanelNegotiationMessage.md) |

#### Returns

`void`

***

### supportedVersions? \{#supportedversions\}

```ts
readonly supportedVersions?: readonly number[];
```

Defined in: [v2/negotiation-panel.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L52)

Protocol versions supported by this end; non-empty, strictly descending, at most 8 items, each
1–255. Defaults to `[2, 1]`.
