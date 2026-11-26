# WorkingTreeCaptureMountPoint

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L58)

A write primitive that must mount working tree capture.

## Remarks

`method` is narrowed to `keyof RawWritePrimitives`: registering a primitive that does not exist, or renaming a primitive and forgetting to update here,
are both **compile errors** rather than a silently mismatching rule.

## Extends

- [`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md)

## Properties

### host \{#host\}

```ts
readonly host: string;
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L39)

The name of the abstract base class declaring the method

#### Inherited from

[`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md).[`host`](WorkingTreeWritePrimitiveSignature.md#host)

---

### method \{#method\}

```ts
readonly method: keyof RawWritePrimitives;
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L63)

Which write primitive this row mounts

#### Overrides

[`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md).[`method`](WorkingTreeWritePrimitiveSignature.md#method)

---

### ordinal \{#ordinal\}

```ts
readonly ordinal: WorkingTreeCaptureMountPointOrdinal;
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L60)

Which row of the contract §1 table this corresponds to

---

### parameters \{#parameters\}

```ts
readonly parameters: readonly string[];
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L45)

Parameter names, in declaration order; optional markers and types are not involved

#### Inherited from

[`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md).[`parameters`](WorkingTreeWritePrimitiveSignature.md#parameters)

---

### why \{#why\}

```ts
readonly why: string;
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L66)

Why it must be mounted — the registry itself must be readable as documentation
