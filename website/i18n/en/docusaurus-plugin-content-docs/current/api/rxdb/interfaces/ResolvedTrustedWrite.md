# ResolvedTrustedWrite

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L57)

A declaration with its entry resolved; the return shape of [takeDeclaredWrite](../functions/takeDeclaredWrite.md).

## Extends

- [`TrustedWriteDeclaration`](TrustedWriteDeclaration.md)

## Properties

### entrance \{#entrance\}

```ts
readonly entrance: 
  | "crud"
  | "domain_recompute"
  | "remote_entity_apply"
  | "cleanup_expired"
  | "projection_rewrite"
  | "metadata_only_prefetch"
  | "query_cache_maintenance"
  | "raw_write"
  | "bulk_write"
  | "notify_external_update"
  | "unknown";
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L59)

The row of this registration in the write entry semantics matrix

***

### file \{#file\}

```ts
readonly file: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L47)

The **basename** of the file containing the call site

#### Remarks

No package name and no directory, isomorphic with the `file` column of [TRUSTED\_CALLSITE\_REGISTRY](../variables/TRUSTED_CALLSITE_REGISTRY.md). US-025 moved 9
call sites from `packages/rxdb/src/version/` into `@aiao/rxdb-plugin-history` and
`@aiao/rxdb-plugin-sync`; the basename key exists exactly for this — the move only changed directories, and the keys did not move by one cell.

#### Inherited from

[`TrustedWriteDeclaration`](TrustedWriteDeclaration.md).[`file`](TrustedWriteDeclaration.md#file)

***

### intent \{#intent\}

```ts
readonly intent: TrustedWriteIntent;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L53)

The intent self-reported by the call site

#### Inherited from

[`TrustedWriteDeclaration`](TrustedWriteDeclaration.md).[`intent`](TrustedWriteDeclaration.md#intent)

***

### symbol \{#symbol\}

```ts
readonly symbol: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L50)

The innermost named function that initiated this write

#### Inherited from

[`TrustedWriteDeclaration`](TrustedWriteDeclaration.md).[`symbol`](TrustedWriteDeclaration.md#symbol)
