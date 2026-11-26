# RepositorySyncBeginEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:568](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L568)

Repository sync begin event

Fired when pullRepository(), pushRepository() or syncRepository() begins executing

## Constructors

### Constructor

```ts
new RepositorySyncBeginEvent(
   direction, 
   namespace, 
   entity, 
   includeRelated
): RepositorySyncBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:571](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L571)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `direction` | [`RepositorySyncDirection`](../type-aliases/RepositorySyncDirection.md) | Sync direction |
| `namespace` | `string` | Namespace |
| `entity` | `string` | Entity name |
| `includeRelated` | `boolean` | Whether related entities are included |

#### Returns

`RepositorySyncBeginEvent`

## Properties

### direction \{#direction\}

```ts
readonly direction: RepositorySyncDirection;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:573](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L573)

Sync direction

***

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:577](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L577)

Entity name

***

### includeRelated \{#includerelated\}

```ts
readonly includeRelated: boolean;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:579](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L579)

Whether related entities are included

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:575](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L575)

Namespace

***

### type \{#type\}

```ts
readonly type: "REPOSITORY_SYNC_BEGIN" = REPOSITORY_SYNC_BEGIN_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:569](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L569)
