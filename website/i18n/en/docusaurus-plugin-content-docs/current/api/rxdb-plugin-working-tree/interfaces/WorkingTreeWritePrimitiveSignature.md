# WorkingTreeWritePrimitiveSignature

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:16

A write primitive's signature identity

## Remarks

The formal parameter **name sequence** participates in the identity so the discriminator works for overloads: `mergeChanges` has the same name on the local and remote base classes, one writes the local business projection (must capture), one pushes to the remote (capturing it records a push as a batch of uncommitted changes — the user commits once, the working tree gets dirty instead). An implementation discriminating by function name would mount both.

Formal parameter name drift (someone renames `disableTriggers` to `silent`) is therefore **judged as not a mount point**, no fuzzy matching: fuzzy matching keeps capture "working" after a rename while the hook site has actually mismatched.

`method` is a bare `string` here — the signatures being judged come from source text, and method names like `rawQuery` that are **not** mount points must also be askable. The registry side narrows to [WorkingTreeCaptureMountPoint.method](WorkingTreeCaptureMountPoint.md#method).

## Extended by

- [`WorkingTreeCaptureMountPoint`](WorkingTreeCaptureMountPoint.md)

## Properties

### host \{#host\}

```ts
readonly host: string;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:18

The name of the abstract base class declaring the method

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

The formal parameter names, in declaration order; optional markers and types do not participate
