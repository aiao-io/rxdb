---
sidebar_label: 'IEventDispatcher⟨Events⟩'
---

# IEventDispatcher`<Events>`

Defined in: [packages/utils/src/tools/event.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L9)

## Type Parameters

| Type Parameter                                                 | Default type              |
| -------------------------------------------------------------- | ------------------------- |
| <a id="type-parameter-events"></a> `Events` _extends_ `object` | [`EventMap`](EventMap.md) |

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(type, listener): void;
```

Defined in: [packages/utils/src/tools/event.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L10)

#### Type Parameters

| Type Parameter                                                               |
| ---------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter  | Type                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `type`     | `T`                                                                        |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;`Events`\[`T`\]&gt; |

#### Returns

`void`

---

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent<T>(type, data): void;
```

Defined in: [packages/utils/src/tools/event.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L13)

#### Type Parameters

| Type Parameter                                                                 |
| ------------------------------------------------------------------------------ |
| <a id="type-parameter-t-1"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `type`    | `T`             |
| `data`    | `Events`\[`T`\] |

#### Returns

`void`

---

### hasEventListener() \{#haseventlistener\}

```ts
hasEventListener<T>(type, listener): boolean;
```

Defined in: [packages/utils/src/tools/event.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L11)

#### Type Parameters

| Type Parameter                                                                 |
| ------------------------------------------------------------------------------ |
| <a id="type-parameter-t-2"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter  | Type                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `type`     | `T`                                                                        |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;`Events`\[`T`\]&gt; |

#### Returns

`boolean`

---

### removeAllEventListeners() \{#removealleventlisteners\}

```ts
removeAllEventListeners(): void;
```

Defined in: [packages/utils/src/tools/event.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L14)

#### Returns

`void`

---

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener<T>(type, listener): void;
```

Defined in: [packages/utils/src/tools/event.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/tools/event.ts#L12)

#### Type Parameters

| Type Parameter                                                                 |
| ------------------------------------------------------------------------------ |
| <a id="type-parameter-t-3"></a> `T` _extends_ `string` \| `number` \| `symbol` |

#### Parameters

| Parameter  | Type                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `type`     | `T`                                                                        |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;`Events`\[`T`\]&gt; |

#### Returns

`void`
