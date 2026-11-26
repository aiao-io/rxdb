# DevToolsHandshakeCapabilities

Defined in: [v2/wire.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L101)

Capability surface announced by the connector in HANDSHAKE.

## Properties

### capability \{#capability\}

```ts
readonly capability: DevToolsCapability;
```

Defined in: [v2/wire.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L103)

The tier configured locally by the connector owner; **informational only** — the panel must
not relax its own validation based on it.

---

### descriptors \{#descriptors\}

```ts
readonly descriptors: readonly DevToolsProviderDescriptor[];
```

Defined in: [v2/wire.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L105)

Providers present in this session; a domain being absent is a legal shape, and requesting it
returns `provider_unsupported`.
