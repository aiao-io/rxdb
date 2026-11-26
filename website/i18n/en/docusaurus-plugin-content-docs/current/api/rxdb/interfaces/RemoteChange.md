# RemoteChange

Defined in: [packages/rxdb/src/system/system.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L27)

Remote change data interface.

## Extends

- [`IRxDBChange`](IRxDBChange.md)

## Properties

### branchId? \{#branchid\}

```ts
branchId?: string;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L11)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`branchId`](IRxDBChange.md#branchid)

---

### clientId? \{#clientid\}

```ts
clientId?: string;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L17)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`clientId`](IRxDBChange.md#clientid)

---

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L19)

The edit moment: when the change was written locally on the originating client. The remote adapter preserves it as-is
when pushing, and `LWWConflictResolver` compares exactly this.

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`createdAt`](IRxDBChange.md#createdat)

---

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L9)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`entity`](IRxDBChange.md#entity)

---

### entityId \{#entityid\}

```ts
entityId: RxDBEntityId;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L10)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`entityId`](IRxDBChange.md#entityid)

---

### id \{#id\}

```ts
id: number;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L28)

#### Overrides

[`IRxDBChange`](IRxDBChange.md).[`id`](IRxDBChange.md#id)

---

### inversePatch? \{#inversepatch\}

```ts
inversePatch?: Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L14)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`inversePatch`](IRxDBChange.md#inversepatch)

---

### localId? \{#localid\}

```ts
localId?: number | null;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L16)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`localId`](IRxDBChange.md#localid)

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L8)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`namespace`](IRxDBChange.md#namespace)

---

### patch? \{#patch\}

```ts
patch?: Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L13)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`patch`](IRxDBChange.md#patch)

---

### transactionId? \{#transactionid\}

```ts
transactionId?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L15)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`transactionId`](IRxDBChange.md#transactionid)

---

### type \{#type\}

```ts
type: 'INSERT' | 'UPDATE' | 'DELETE';
```

Defined in: [packages/rxdb/src/system/system.interface.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L12)

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`type`](IRxDBChange.md#type)

---

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [packages/rxdb/src/system/system.interface.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system.interface.ts#L21)

The last-write moment; in the remote log it is the push moment.

#### Inherited from

[`IRxDBChange`](IRxDBChange.md).[`updatedAt`](IRxDBChange.md#updatedat)
