# WorkingTreeCaptureMountPoint

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:33

A write primitive that must have working tree capture mounted.

## Remarks

`method` is narrowed to `keyof RawWritePrimitives`: registering a nonexistent primitive, or forgetting to update this after a primitive rename, is a **compile error** rather than a silently mismatched rule.

## Extends

- [`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md)

## Properties

### host \{#host\}

```ts
readonly host: string;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:18

The name of the abstract base class that declares this method

#### Inherited from

[`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md).[`host`](WorkingTreeWritePrimitiveSignature.md#host)

---

### method \{#method\}

```ts
readonly method: keyof RawWritePrimitives;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:37

Which write primitive this row mounts

#### Overrides

[`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md).[`method`](WorkingTreeWritePrimitiveSignature.md#method)

---

### ordinal \{#ordinal\}

```ts
readonly ordinal: WorkingTreeCaptureMountPointOrdinal;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:35

Which row of the contract §1 table this corresponds to

---

### parameters \{#parameters\}

```ts
readonly parameters: readonly string[];
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:22

The formal parameter names, in declaration order; optionality markers and types do not participate

#### Inherited from

[`WorkingTreeWritePrimitiveSignature`](WorkingTreeWritePrimitiveSignature.md).[`parameters`](WorkingTreeWritePrimitiveSignature.md#parameters)

---

### why \{#why\}

```ts
readonly why: string;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:39

Why it must be mounted — the registry itself must be readable as documentation
