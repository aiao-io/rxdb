# PGliteChangeEventSource

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L350)

Change event source: a client that can attach / detach [PGliteChangeType](../enumerations/PGliteChangeType.md) listeners.

## Remarks

Declared separately from [IPGliteClient](IPGliteClient.md) because **being able to push changes** and **being able to execute SQL** are two different things: read-only or query-only clients may satisfy only the latter. The adapter decides structurally by this contract rather than by concrete class; otherwise a proxy implementation (the US-208 desktop client) would be judged unsupported by `instanceof` — the symptom being all change events lost, and `disconnect()` never unbinding it either.

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(type, listener): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:351](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L351)

#### Type Parameters

| Type Parameter                                                                                  |
| ----------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ keyof [`PGliteClientEvents`](PGliteClientEvents.md) |

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `type`     | `T`                 |
| `listener` | (`event`) => `void` |

#### Returns

`void`

---

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener<T>(type, listener): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:352](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L352)

#### Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ keyof [`PGliteClientEvents`](PGliteClientEvents.md) |

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `type`     | `T`                 |
| `listener` | (`event`) => `void` |

#### Returns

`void`
