---
sidebar_label: 'DevToolsV2Envelope⟨TType⟩'
---

# DevToolsV2Envelope`<TType>`

Defined in: [v2/wire.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L196)

The v2 envelope of a single message type.

## Type Parameters

| Type Parameter                                                                                                          | Default type                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| <a id="type-parameter-ttype"></a> `TType` _extends_ [`DevToolsV2MessageType`](../type-aliases/DevToolsV2MessageType.md) | [`DevToolsV2MessageType`](../type-aliases/DevToolsV2MessageType.md) |

## Properties

### direction \{#direction\}

```ts
readonly direction: DevToolsV2Direction;
```

Defined in: [v2/wire.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L199)

---

### payload \{#payload\}

```ts
readonly payload: DevToolsV2PayloadMap[TType];
```

Defined in: [v2/wire.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L203)

---

### protocol \{#protocol\}

```ts
readonly protocol: 2;
```

Defined in: [v2/wire.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L198)

---

### sequence \{#sequence\}

```ts
readonly sequence: number;
```

Defined in: [v2/wire.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L205)

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string | null;
```

Defined in: [v2/wire.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L202)

A UUID v4 after negotiation completes; `null` only for `PROTOCOL_HELLO`.

---

### source \{#source\}

```ts
readonly source: "@aiao/rxdb-devtools";
```

Defined in: [v2/wire.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L197)

---

### timestamp \{#timestamp\}

```ts
readonly timestamp: number;
```

Defined in: [v2/wire.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L204)

---

### type \{#type\}

```ts
readonly type: TType;
```

Defined in: [v2/wire.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L200)
