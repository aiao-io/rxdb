# DevToolsConnectorNegotiationPorts

Defined in: [v2/negotiation-connector.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L48)

The construction ports of the connector negotiation machine.

## Properties

### capability \{#capability\}

```ts
readonly capability: DevToolsCapability;
```

Defined in: [v2/negotiation-connector.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L54)

The tier of the owner's locally trusted configuration; in the HANDSHAKE it is only **informing**, not a permission input.

---

### clock \{#clock\}

```ts
readonly clock: DevToolsClock;
```

Defined in: [v2/negotiation-connector.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L52)

The timestamp source.

---

### descriptors \{#descriptors\}

```ts
readonly descriptors: readonly DevToolsProviderDescriptor[];
```

Defined in: [v2/negotiation-connector.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L56)

The provider descriptors existing in this session.

---

### legacyHandshake \{#legacyhandshake\}

```ts
readonly legacyHandshake: AnyDevToolsMessage;
```

Defined in: [v2/negotiation-connector.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L58)

The eager v1 handshake constructed by the owner; this module only decides when it goes out.

---

### send \{#send\}

```ts
readonly send: (message) => void;
```

Defined in: [v2/negotiation-connector.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L50)

The outbound callback.

#### Parameters

| Parameter | Type                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------- |
| `message` | [`DevToolsConnectorNegotiationMessage`](../type-aliases/DevToolsConnectorNegotiationMessage.md) |

#### Returns

`void`

---

### supportedVersions? \{#supportedversions\}

```ts
readonly supportedVersions?: readonly number[];
```

Defined in: [v2/negotiation-connector.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L60)

The protocol versions supported by this end; defaults to `[2, 1]` — v1 is fulfilled by the eager legacy handshake.
