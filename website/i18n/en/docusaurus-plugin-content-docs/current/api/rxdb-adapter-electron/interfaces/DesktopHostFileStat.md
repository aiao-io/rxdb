# DesktopHostFileStat

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:323

Metadata of a single path; expressed as `null` rather than an error when the target does not exist.

## Properties

### kind \{#kind\}

```ts
readonly kind: "file" | "directory";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:324

---

### lastModified \{#lastmodified\}

```ts
readonly lastModified: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:328

Last modification time (epoch milliseconds).

---

### size \{#size\}

```ts
readonly size: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:326

File size in bytes; always 0 for directories.
