---
sidebar_label: 'DevToolsMessage⟨T⟩'
---

# DevToolsMessage`<T>`

Defined in: [types.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L89)

The base message structure.

## Extended by

- [`BranchesMessage`](BranchesMessage.md)
- [`ClearMessage`](ClearMessage.md)
- [`CreateBranchMessage`](CreateBranchMessage.md)
- [`DbInfoMessage`](DbInfoMessage.md)
- [`DbModelInfoMessage`](DbModelInfoMessage.md)
- [`DeleteBranchMessage`](DeleteBranchMessage.md)
- [`DisconnectRxdbMessage`](DisconnectRxdbMessage.md)
- [`DisconnectRxdbResultMessage`](DisconnectRxdbResultMessage.md)
- [`EntityDataMessage`](EntityDataMessage.md)
- [`EventMessage`](EventMessage.md)
- [`GetBranchesMessage`](GetBranchesMessage.md)
- [`HandshakeAckMessage`](HandshakeAckMessage.md)
- [`HandshakeMessage`](HandshakeMessage.md)
- [`InspectDbMessage`](InspectDbMessage.md)
- [`PingMessage`](PingMessage.md)
- [`QueryEntityMessage`](QueryEntityMessage.md)
- [`SwitchBranchMessage`](SwitchBranchMessage.md)

## Type Parameters

| Type Parameter                    | Default type |
| --------------------------------- | ------------ |
| <a id="type-parameter-t"></a> `T` | `unknown`    |

## Properties

### direction \{#direction\}

```ts
direction: MessageDirection;
```

Defined in: [types.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L91)

---

### payload \{#payload\}

```ts
payload: T;
```

Defined in: [types.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L93)

---

### sequence \{#sequence\}

```ts
sequence: number;
```

Defined in: [types.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L95)

---

### source \{#source\}

```ts
source: '@aiao/rxdb-devtools';
```

Defined in: [types.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L90)

---

### tabId? \{#tabid\}

```ts
tabId?: number;
```

Defined in: [types.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L96)

---

### timestamp \{#timestamp\}

```ts
timestamp: number;
```

Defined in: [types.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L94)

---

### type \{#type\}

```ts
type: MessageType;
```

Defined in: [types.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L92)
