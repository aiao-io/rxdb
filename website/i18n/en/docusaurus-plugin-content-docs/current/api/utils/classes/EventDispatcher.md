---
sidebar_label: 'EventDispatcher⟨Events⟩'
---

# EventDispatcher`<Events>`

Defined in: [packages/utils/src/tools/event.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L27)

A type-safe synchronous event dispatcher.

Dispatch semantics align with the DOM `EventTarget`:

- `dispatchEvent` takes a **snapshot** of the listener set before iterating. Listeners added during dispatch do not receive the current event — they wait for the next dispatch; listeners removed during dispatch **are still** invoked this time.
- Exceptions thrown by a listener are not swallowed; they bubble up to the caller and subsequent listeners do not run.
- Only `addEventListener` creates a set for an event name; once the set is emptied it is immediately collected for that name, preventing unbounded Map growth for unbounded event names.

## Extended by

- [`PGliteClient`](../../rxdb-adapter-pglite/classes/PGliteClient.md)
- [`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md)
- [`SqliteClient`](../../rxdb-adapter-sqlite-wasm/classes/SqliteClient.md)

## Type Parameters

| Type Parameter                                                 | Default type                            |
| -------------------------------------------------------------- | --------------------------------------- |
| <a id="type-parameter-events"></a> `Events` _extends_ `object` | [`EventMap`](../interfaces/EventMap.md) |

## Implements

- [`IEventDispatcher`](../interfaces/IEventDispatcher.md)&lt;`Events`&gt;

## Constructors

### Constructor

```ts
new EventDispatcher<Events>(): EventDispatcher<Events>;
```

#### Returns

`EventDispatcher`&lt;`Events`&gt;

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(type, listener): void;
```

Defined in: [packages/utils/src/tools/event.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L36)

Registers a listener. Registering the same `listener` again keeps only one copy (set semantics).

#### Type Parameters

| Type Parameter                                                               |
| ---------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter  | Type                                                                       | Description |
| ---------- | -------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                        | Event name  |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;`Events`\[`T`\]&gt; | Listener    |

#### Returns

`void`

#### Implementation of

[`IEventDispatcher`](../interfaces/IEventDispatcher.md).[`addEventListener`](../interfaces/IEventDispatcher.md#addeventlistener)

---

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent<T>(type, data): void;
```

Defined in: [packages/utils/src/tools/event.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L81)

Dispatches an event synchronously.

Iterates a snapshot, not the live set: `addEventListener` calls made by a listener while handling the event do not feed this iteration (otherwise a single synchronous dispatch could be prolonged indefinitely by third-party listeners, UTL-011).

#### Type Parameters

| Type Parameter                                                                 |
| ------------------------------------------------------------------------------ |
| <a id="type-parameter-t-1"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter | Type            | Description |
| --------- | --------------- | ----------- |
| `type`    | `T`             | Event name  |
| `data`    | `Events`\[`T`\] | Event data  |

#### Returns

`void`

#### Throws

Any exception thrown by a listener bubbles up as-is; listeners after it do not run

#### Implementation of

[`IEventDispatcher`](../interfaces/IEventDispatcher.md).[`dispatchEvent`](../interfaces/IEventDispatcher.md#dispatchevent)

---

### hasEventListener() \{#haseventlistener\}

```ts
hasEventListener<T>(type, listener): boolean;
```

Defined in: [packages/utils/src/tools/event.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L52)

Checks whether a listener is registered. Does not create a set for unknown event names.

#### Type Parameters

| Type Parameter                                                                 |
| ------------------------------------------------------------------------------ |
| <a id="type-parameter-t-2"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter  | Type                                                                       | Description |
| ---------- | -------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                        | Event name  |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;`Events`\[`T`\]&gt; | Listener    |

#### Returns

`boolean`

Whether it is registered

#### Implementation of

[`IEventDispatcher`](../interfaces/IEventDispatcher.md).[`hasEventListener`](../interfaces/IEventDispatcher.md#haseventlistener)

---

### removeAllEventListeners() \{#removealleventlisteners\}

```ts
removeAllEventListeners(): void;
```

Defined in: [packages/utils/src/tools/event.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L90)

Removes all listeners under all event names.

#### Returns

`void`

#### Implementation of

[`IEventDispatcher`](../interfaces/IEventDispatcher.md).[`removeAllEventListeners`](../interfaces/IEventDispatcher.md#removealleventlisteners)

---

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener<T>(type, listener): void;
```

Defined in: [packages/utils/src/tools/event.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L64)

Removes a listener. Unknown event names or unregistered listeners are no-ops and no empty set is created.

If removed during `dispatchEvent`, the removed listener **still** receives the current event (snapshot semantics).

#### Type Parameters

| Type Parameter                                                                 |
| ------------------------------------------------------------------------------ |
| <a id="type-parameter-t-3"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter  | Type                                                                       | Description |
| ---------- | -------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                        | Event name  |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;`Events`\[`T`\]&gt; | Listener    |

#### Returns

`void`

#### Implementation of

[`IEventDispatcher`](../interfaces/IEventDispatcher.md).[`removeEventListener`](../interfaces/IEventDispatcher.md#removeeventlistener)
