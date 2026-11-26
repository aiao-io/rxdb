# DevToolsAuthorizationInput

Defined in: [v2/authorization.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L105)

The input of an operation authorization; all three configuration items come from the local side, and `domain` / `operation` come from the wire.

## Properties

### capability \{#capability\}

```ts
readonly capability: DevToolsCapability;
```

Defined in: [v2/authorization.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L107)

The locally configured tier.

---

### descriptors \{#descriptors\}

```ts
readonly descriptors: readonly DevToolsProviderDescriptor[];
```

Defined in: [v2/authorization.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L111)

The provider declarations existing in this session.

---

### domain \{#domain\}

```ts
readonly domain: "database" | "files" | "settings";
```

Defined in: [v2/authorization.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L113)

The requested domain.

---

### mutationPolicy \{#mutationpolicy\}

```ts
readonly mutationPolicy: DevToolsMutationPolicy;
```

Defined in: [v2/authorization.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L109)

The locally configured write switch.

---

### operation \{#operation\}

```ts
readonly operation: string;
```

Defined in: [v2/authorization.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L115)

The requested operation name; on the wire it may be any string.
