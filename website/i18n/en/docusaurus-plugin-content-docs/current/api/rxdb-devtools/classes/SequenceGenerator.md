# SequenceGenerator

Defined in: [sequence.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/sequence.ts#L5)

Sequence number generator class
Generates monotonically increasing sequence numbers for event ordering

## Constructors

### Constructor

```ts
new SequenceGenerator(): SequenceGenerator;
```

#### Returns

`SequenceGenerator`

## Accessors

### current \{#current\}

#### Get Signature

```ts
get current(): number;
```

Defined in: [sequence.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/sequence.ts#L9)

Gets the current sequence number (without incrementing)

##### Returns

`number`

## Methods

### next() \{#next\}

```ts
next(): number;
```

Defined in: [sequence.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/sequence.ts#L14)

Gets the next sequence number

#### Returns

`number`

***

### reset() \{#reset\}

```ts
reset(): void;
```

Defined in: [sequence.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/sequence.ts#L19)

Resets the sequence number

#### Returns

`void`
