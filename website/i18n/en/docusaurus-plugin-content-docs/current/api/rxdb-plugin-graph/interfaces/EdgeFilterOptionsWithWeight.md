# EdgeFilterOptionsWithWeight

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L41)

Edge filter conditions (with weight)

## Extends

- [`EdgeFilterOptions`](../type-aliases/EdgeFilterOptions.md)

## Extended by

- [`EdgeFilterOptionsFull`](EdgeFilterOptionsFull.md)

## Properties

### weight? \{#weight\}

```ts
weight?: object;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L46)

Weight range filter

#### max?

```ts
max?: number;
```

#### min?

```ts
min?: number;
```

#### Example

```ts
{ min: 1, max: 10 }
```
