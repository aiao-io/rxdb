# EdgeInfoWithWeight

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L81)

Edge information (with weight)

## Extends

- [`EdgeInfo`](EdgeInfo.md)

## Extended by

- [`EdgeInfoFull`](EdgeInfoFull.md)

## Properties

### direction \{#direction\}

```ts
direction: 'in' | 'out';
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L75)

#### Inherited from

[`EdgeInfo`](EdgeInfo.md).[`direction`](EdgeInfo.md#direction)

---

### sourceId \{#sourceid\}

```ts
sourceId: string;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L73)

#### Inherited from

[`EdgeInfo`](EdgeInfo.md).[`sourceId`](EdgeInfo.md#sourceid)

---

### targetId \{#targetid\}

```ts
targetId: string;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L74)

#### Inherited from

[`EdgeInfo`](EdgeInfo.md).[`targetId`](EdgeInfo.md#targetid)

---

### weight \{#weight\}

```ts
weight: number | null;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L82)
