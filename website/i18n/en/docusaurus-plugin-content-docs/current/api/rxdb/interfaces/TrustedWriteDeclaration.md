# TrustedWriteDeclaration

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L38)

The self-reported identity of one trusted write

## Remarks

The three fields correspond literally to [trustedCallsiteKey](../functions/trustedCallsiteKey.md), because this is what looks up the registry. Having the call site report
`entrance` directly would be worse: the registry and the call site would each store a copy of the entrance, and when one is changed but the other missed, nothing would ever report an error.

## Extended by

- [`ResolvedTrustedWrite`](ResolvedTrustedWrite.md)

## Properties

### file \{#file\}

```ts
readonly file: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L47)

The **basename** of the file containing the call site

#### Remarks

No package name and no directory, isomorphic to the `file` column of [TRUSTED\_CALLSITE\_REGISTRY](../variables/TRUSTED_CALLSITE_REGISTRY.md). US-025 moved the 9
call sites out of `packages/rxdb/src/version/` into `@aiao/rxdb-plugin-history` and
`@aiao/rxdb-plugin-sync`, and the basename key exists exactly for this: the move only changed directories, and not a single key moved.

***

### intent \{#intent\}

```ts
readonly intent: TrustedWriteIntent;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L53)

The intent self-reported by the call site

***

### symbol \{#symbol\}

```ts
readonly symbol: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L50)

The innermost named function that initiated this write
