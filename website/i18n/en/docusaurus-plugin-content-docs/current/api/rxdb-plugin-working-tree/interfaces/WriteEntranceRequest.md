# WriteEntranceRequest

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L75)

One write handed to [classifyWriteEntrance](../functions/classifyWriteEntrance.md)

## Remarks

The entrance identity and the column set are **both indispensable**: the entrance alone cannot express matrix row 4, the column set alone cannot express the opposite conclusions of rows 6 and 9.

## Properties

### capabilityEnabled \{#capabilityenabled\}

```ts
readonly capabilityEnabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L98)

Does this database have the commit capability enabled

***

### columns \{#columns\}

```ts
readonly columns: WriteColumns;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L86)

Which columns this write touches

***

### entrance \{#entrance\}

```ts
readonly entrance: 
  | "unknown"
  | "crud"
  | "domain_recompute"
  | "remote_entity_apply"
  | "cleanup_expired"
  | "projection_rewrite"
  | "metadata_only_prefetch"
  | "query_cache_maintenance"
  | "raw_write"
  | "bulk_write"
  | "notify_external_update";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L77)

Who is writing

***

### operation \{#operation\}

```ts
readonly operation: WriteOperation;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L83)

What kind of operation the write is

***

### targetClass \{#targetclass\}

```ts
readonly targetClass: "system" | "versioned" | "untracked";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L80)

What class of table is being written

***

### untrackedFields \{#untrackedfields\}

```ts
readonly untrackedFields: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L95)

The column names on the target table that do not constitute a net business change

#### Remarks

Fetched from `VersionedDomainView.untrackedFieldsOf()` and injected by the caller. The judgment keeping its own copy is building the second list spec.md explicitly forbids.
