# RepositorySyncErrorEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:615](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L615)

Repository sync error event

Fired when a repository sync operation fails

## Constructors

### Constructor

```ts
new RepositorySyncErrorEvent(
   direction, 
   namespace, 
   entity, 
   error
): RepositorySyncErrorEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:618](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L618)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `direction` | [`RepositorySyncDirection`](../type-aliases/RepositorySyncDirection.md) | Sync direction |
| `namespace` | `string` | Namespace |
| `entity` | `string` | Entity name |
| `error` | `Error` | Error information |

#### Returns

`RepositorySyncErrorEvent`

## Properties

### direction \{#direction\}

```ts
readonly direction: RepositorySyncDirection;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:620](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L620)

Sync direction

***

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:624](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L624)

Entity name

***

### error \{#error\}

```ts
readonly error: Error;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:626](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L626)

Error information

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:622](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L622)

Namespace

***

### type \{#type\}

```ts
readonly type: "REPOSITORY_SYNC_ERROR" = REPOSITORY_SYNC_ERROR_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:616](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L616)
