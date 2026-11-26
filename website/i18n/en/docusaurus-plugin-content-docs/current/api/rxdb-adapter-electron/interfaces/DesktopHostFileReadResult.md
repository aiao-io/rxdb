# DesktopHostFileReadResult

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:331

One frame of a `file.read` result.

## Properties

### chunk \{#chunk\}

```ts
readonly chunk: Uint8Array<ArrayBuffer>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:333

This frame's content; when `length` reaches the end of the file it may be shorter than requested. The host buffer must be a plain `ArrayBuffer` (same as above).

---

### eof \{#eof\}

```ts
readonly eof: boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:335

`true` when this frame read to the end of the file.
