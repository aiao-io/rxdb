# TrustedCallsite

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L103)

One row of the registry

## Remarks

Deliberately does **not** carry a "produces working tree units" field: that column is the matrix's conclusion, and copying it here would create a second source of truth, and of the two truths
one would eventually go stale. To get that answer, call the plugin side's `producesWorkingTreeEntry()`.

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

The row of this intent in the write-entrance semantics matrix

---

### file \{#file\}

```ts
readonly file: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L113)

The file **basename**, without directory or package name

#### Remarks

Deliberately stores only the basename: #1~#6 live in `@aiao/rxdb-plugin-history/src/` and #7~#9 in `@aiao/rxdb-plugin-sync/src/`,
and the US-025 package extraction was exactly the move that took them out of the core's `version/` — had the directory been stored, this table would have
mismatched wholesale at that move, while not a single one of the nine mismatched rows had actually drifted. Basename plus symbol name uniquely locate a call site,
and duplicates are caught by T066's whole-repo scan (declarations with the same key appearing in same-named files are reported as duplicate registrations).

---

### intent \{#intent\}

```ts
readonly intent: TrustedWriteIntent;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L122)

The intent self-reported by the call site

---

### symbol \{#symbol\}

```ts
readonly symbol: string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L116)

The innermost named function that actually initiated this bulk rewrite

---

### verifiedAtLine \{#verifiedatline\}

```ts
readonly verifiedAtLine: number;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L128)

The line number at the time of this check; **archival only**, not part of the registration key

---

### writePrimitive \{#writeprimitive\}

```ts
readonly writePrimitive: TrustedWritePrimitive;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L119)

Which write primitive this row calls
