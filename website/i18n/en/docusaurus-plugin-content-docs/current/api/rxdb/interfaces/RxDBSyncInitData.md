# RxDBSyncInitData

Defined in: [packages/rxdb/src/system/types.ts:507](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L507)

Initialization data

## Properties

### createdAt? \{#createdat\}

```ts
createdAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/types.ts:549](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L549)

Creation time

#### Default

```ts
new Date()
```

***

### enabled? \{#enabled\}

```ts
enabled?: boolean;
```

Defined in: [packages/rxdb/src/system/types.ts:544](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L544)

Whether enabled

***

### entity? \{#entity\}

```ts
entity?: string;
```

Defined in: [packages/rxdb/src/system/types.ts:519](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L519)

Entity

***

### id? \{#id\}

```ts
id?: string;
```

Defined in: [packages/rxdb/src/system/types.ts:511](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L511)

id

***

### lastPulledAt? \{#lastpulledat\}

```ts
lastPulledAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/types.ts:536](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L536)

Last pull time

***

### lastPullRemoteChangeId? \{#lastpullremotechangeid\}

```ts
lastPullRemoteChangeId?: number | null;
```

Defined in: [packages/rxdb/src/system/types.ts:540](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L540)

ID of the last pulled remote change

***

### lastPushedAt? \{#lastpushedat\}

```ts
lastPushedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/types.ts:532](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L532)

Last push time

***

### lastPushedChangeId? \{#lastpushedchangeid\}

```ts
lastPushedChangeId?: number | null;
```

Defined in: [packages/rxdb/src/system/types.ts:528](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L528)

ID of the last pushed change

***

### namespace? \{#namespace\}

```ts
namespace?: string;
```

Defined in: [packages/rxdb/src/system/types.ts:515](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L515)

Namespace

***

### syncType? \{#synctype\}

```ts
syncType?: "local" | "remote" | "filter" | "full" | "querycache" | "none";
```

Defined in: [packages/rxdb/src/system/types.ts:524](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L524)

Sync type

#### Default

```ts
'none'
```

***

### updatedAt? \{#updatedat\}

```ts
updatedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/types.ts:554](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L554)

Update time

#### Default

```ts
new Date()
```
