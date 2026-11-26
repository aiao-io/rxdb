# RxDBChangeInitData

Defined in: [packages/rxdb/src/system/types.ts:655](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L655)

Initialization data

## Properties

### createdAt? \{#createdat\}

```ts
createdAt?: Date;
```

Defined in: [packages/rxdb/src/system/types.ts:696](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L696)

Creation time

#### Default

```ts
new Date();
```

---

### entity? \{#entity\}

```ts
entity?: string;
```

Defined in: [packages/rxdb/src/system/types.ts:679](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L679)

Entity

---

### entityId? \{#entityid\}

```ts
entityId?: RxDBEntityId;
```

Defined in: [packages/rxdb/src/system/types.ts:683](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L683)

Entity ID

---

### id? \{#id\}

```ts
id?: number;
```

Defined in: [packages/rxdb/src/system/types.ts:659](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L659)

id

---

### inversePatch? \{#inversepatch\}

```ts
inversePatch?: Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/types.ts:687](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L687)

Inverse patch

---

### namespace? \{#namespace\}

```ts
namespace?: string;
```

Defined in: [packages/rxdb/src/system/types.ts:675](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L675)

Namespace

---

### patch? \{#patch\}

```ts
patch?: Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/types.ts:691](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L691)

Patch

---

### redoInvalidatedAt? \{#redoinvalidatedat\}

```ts
redoInvalidatedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/types.ts:713](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L713)

Redo invalidation time

---

### remoteId? \{#remoteid\}

```ts
remoteId?: number | null;
```

Defined in: [packages/rxdb/src/system/types.ts:663](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L663)

Remote ID

---

### revertChangedAt? \{#revertchangedat\}

```ts
revertChangedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/types.ts:705](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L705)

Revert time

---

### revertChangeId? \{#revertchangeid\}

```ts
revertChangeId?: number | null;
```

Defined in: [packages/rxdb/src/system/types.ts:709](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L709)

Revert change ID

---

### transactionId? \{#transactionid\}

```ts
transactionId?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb/src/system/types.ts:671](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L671)

Transaction ID

---

### type? \{#type\}

```ts
type?: string;
```

Defined in: [packages/rxdb/src/system/types.ts:667](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L667)

Type

---

### updatedAt? \{#updatedat\}

```ts
updatedAt?: Date;
```

Defined in: [packages/rxdb/src/system/types.ts:701](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.ts#L701)

Update time

#### Default

```ts
new Date();
```
