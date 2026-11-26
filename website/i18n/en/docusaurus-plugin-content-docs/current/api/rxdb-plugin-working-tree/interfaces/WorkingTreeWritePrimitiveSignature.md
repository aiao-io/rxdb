# WorkingTreeWritePrimitiveSignature

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:16

The signature identity of a write primitive.

## Remarks

The formal parameter **name sequence** participates in the identity so the discrimination works across overloads: `mergeChanges` has the same name on the local and remote base classes,
one writes the local business projection (must be captured), the other pushes to the remote side (capturing it would record one push as a batch of uncommitted changes,
the user commits once and the working tree ends up dirtier). An implementation that discriminates by function name would mount both.

A drifted parameter name (someone renames `disableTriggers` to `silent`) is therefore **judged not to be a mount point**, with no fuzzy matching:
fuzzy matching would keep capture "working" after a rename while the hook site has actually gone out of sync.

`method` is a bare `string` here — the signature to be judged comes from source text, and names like `rawQuery` that are **not** mount points must also be queryable.
The registry side narrows it to [WorkingTreeCaptureMountPoint.method](WorkingTreeCaptureMountPoint.md#method).

## Extended by

- [`WorkingTreeCaptureMountPoint`](WorkingTreeCaptureMountPoint.md)

## Properties

### host \{#host\}

```ts
readonly host: string;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:18

The name of the abstract base class that declares this method

***

### method \{#method\}

```ts
readonly method: string;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:20

The method name

***

### parameters \{#parameters\}

```ts
readonly parameters: readonly string[];
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:22

The formal parameter names, in declaration order; optionality markers and types do not participate
