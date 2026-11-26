# RestoreCompatibility

```ts
type RestoreCompatibility = 
  | {
  ok: true;
  path: readonly string[];
}
  | {
  incompatible: RestoreIncompatibility;
  ok: false;
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L142)

Preflight conclusion.

## Union Members

### Type Literal

```ts
{
  ok: true;
  path: readonly string[];
}
```

#### ok

```ts
readonly ok: true;
```

The whole path is compatible

#### path

```ts
readonly path: readonly string[];
```

The chosen replay path, in replay order (HEAD first), **not including** the target node itself

***

### Type Literal

```ts
{
  incompatible: RestoreIncompatibility;
  ok: false;
}
```

#### incompatible

```ts
readonly incompatible: RestoreIncompatibility;
```

The first incompatible node, see [RestoreIncompatibility](../interfaces/RestoreIncompatibility.md)

#### ok

```ts
readonly ok: false;
```

Some node on the path is incompatible

## Remarks

A discriminated union rather than "two optional fields": the object assembled from the latter has four possible values, of which "both ok and carrying
incompatible" and "neither ok nor carrying anything" are meaningless, while the `if` at the call site only covers one of them.
After discrimination, those two are inexpressible at compile time.
