# DevToolsV2MessageOptions

Defined in: [v2/wire.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L226)

The fixed fields of [createDevToolsV2Message](../functions/createDevToolsV2Message.md).

## Properties

### direction? \{#direction\}

```ts
readonly direction?: DevToolsV2Direction;
```

Defined in: [v2/wire.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L231)

Only bidirectional messages need it and must provide it; providing an inconsistent value for a unidirectional message throws.

---

### sequence \{#sequence\}

```ts
readonly sequence: number;
```

Defined in: [v2/wire.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L228)

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string | null;
```

Defined in: [v2/wire.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L227)

---

### timestamp \{#timestamp\}

```ts
readonly timestamp: number;
```

Defined in: [v2/wire.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L229)
