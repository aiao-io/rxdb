# TrustedCallsite

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L103)

One row of the registry.

## Remarks

Deliberately **does not carry** the "produces a working-tree unit" field: that column is the conclusion of the
matrix, and copying it here would make a second source of truth — and of two sources of truth, sooner or later
one is stale. To get that answer, call the plugin side's `producesWorkingTreeEntry()`.

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

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L125)

This intent's row in the write-entry semantics matrix.

---

### file \{#file\}

```ts
readonly file: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L113)

File **basename**, without directory and without package name.

#### Remarks

Deliberately stores only the basename: #1~#6 live in `@aiao/rxdb-plugin-history/src/` and #7~#9 in
`@aiao/rxdb-plugin-sync/src/`, and US-025's package extraction is exactly the move that took them out of the
core `version/` — had the directory been stored, this table would have gone fully out of match at that move,
and of the nine mismatched rows not one had really drifted. The basename together with the symbol name uniquely
locates one call site; name collisions are caught by T066's whole-repo scan (a same-key declaration appearing
in a same-name file is reported as a duplicate registration).

---

### intent \{#intent\}

```ts
readonly intent: TrustedWriteIntent;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L122)

The intent self-reported by the call site.

---

### symbol \{#symbol\}

```ts
readonly symbol: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L116)

The innermost named function that actually initiated this batch rewrite.

---

### verifiedAtLine \{#verifiedatline\}

```ts
readonly verifiedAtLine: number;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L128)

The line number at the time of this verification; **archive only**, not part of the registration key.

---

### writePrimitive \{#writeprimitive\}

```ts
readonly writePrimitive: TrustedWritePrimitive;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L119)

Which write primitive this row calls.
