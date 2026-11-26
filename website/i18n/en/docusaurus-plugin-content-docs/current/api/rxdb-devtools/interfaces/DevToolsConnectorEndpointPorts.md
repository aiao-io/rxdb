# DevToolsConnectorEndpointPorts

Defined in: [v2/endpoint.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L91)

The construction ports of the endpoint.

## Properties

### capability \{#capability\}

```ts
readonly capability: DevToolsCapability;
```

Defined in: [v2/endpoint.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L97)

The tier locally configured by the connector owner; the value echoed on the wire does not count.

***

### clock \{#clock\}

```ts
readonly clock: DevToolsClock;
```

Defined in: [v2/endpoint.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L95)

The only injection point for all time limits.

***

### legacyHandshake \{#legacyhandshake\}

```ts
readonly legacyHandshake: AnyDevToolsMessage;
```

Defined in: [v2/endpoint.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L103)

The eager v1 handshake constructed by the owner; the endpoint only decides when it goes out.

***

### mutationPolicy \{#mutationpolicy\}

```ts
readonly mutationPolicy: DevToolsMutationPolicy;
```

Defined in: [v2/endpoint.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L99)

The write switch locally configured by the connector owner.

***

### providers \{#providers\}

```ts
readonly providers: DevToolsProviderRegistry;
```

Defined in: [v2/endpoint.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L101)

The provider seams.

***

### send \{#send\}

```ts
readonly send: (message) => void;
```

Defined in: [v2/endpoint.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L93)

The outbound callback; both the v1 legacy handshake and v2 frames go through here.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | [`DevToolsConnectorNegotiationMessage`](../type-aliases/DevToolsConnectorNegotiationMessage.md) |

#### Returns

`void`

***

### supportedVersions? \{#supportedversions\}

```ts
readonly supportedVersions?: readonly number[];
```

Defined in: [v2/endpoint.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L105)

Overrides the protocol version list declared by this end; defaults to `[2, 1]`.
