# WorkingTreeWritePrimitiveSignature

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L37)

The signature identity of a write primitive

## Remarks

The parameter **name sequence** participates in the identity so the discrimination works for overloads: `mergeChanges` has the same name on the local and remote base classes,
one writes local business projections (must be captured), one pushes to the remote (capturing it would record one push as a batch of uncommitted changes —
the user commits once and the working tree gets dirty instead). A function-name-based discriminator would hook both.

Parameter name drift (someone renaming `disableTriggers` to `silent`) is therefore **judged as not a mount point**, with no fuzzy matching:
fuzzy matching would let capture keep "holding" after a rename, while the spot where the hook attaches has actually already mismatched.

`method` here is a bare `string` — the signatures to discriminate come from source text, and method names that are **not** mount points,
like `rawQuery`, must also be askable. The registry side narrows it to [WorkingTreeCaptureMountPoint.method](WorkingTreeCaptureMountPoint.md#method).

## Extended by

- [`WorkingTreeCaptureMountPoint`](WorkingTreeCaptureMountPoint.md)

## Properties

### host \{#host\}

```ts
readonly host: string;
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L39)

The name of the abstract base class declaring the method

***

### method \{#method\}

```ts
readonly method: string;
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L42)

Method name

***

### parameters \{#parameters\}

```ts
readonly parameters: readonly string[];
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L45)

Parameter names, in declaration order; optional markers and types are not involved
