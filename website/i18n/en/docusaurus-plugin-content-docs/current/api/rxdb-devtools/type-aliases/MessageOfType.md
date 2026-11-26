---
sidebar_label: "MessageOfType⟨T⟩"
---

# MessageOfType`<T>`

```ts
type MessageOfType<T> = Extract<AnyDevToolsMessage, {
  type: T;
}>;
```

Defined in: [types.ts:709](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L709)

Resolves the message definition for a given message type.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`MessageType`](MessageType.md) |

## Remarks

Uses `Extract` rather than `{ [M in AnyDevToolsMessage as M['type']]: M }`: the latter, faced with
`DISCONNECT` (one page→devtools and one devtools→page), would keep only one because of the duplicate key,
silently marking the other legal direction as illegal.
