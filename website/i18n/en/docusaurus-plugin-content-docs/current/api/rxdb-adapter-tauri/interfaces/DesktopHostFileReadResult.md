# DesktopHostFileReadResult

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:331

One frame of a `file.read` result.

## Properties

### chunk \{#chunk\}

```ts
readonly chunk: Uint8Array<ArrayBuffer>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:333

Content of this frame; may be shorter than the requested length when `length` reaches the end of the file. The host buffer is always a plain `ArrayBuffer` (same as above).

***

### eof \{#eof\}

```ts
readonly eof: boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:335

`true` when this frame read to the end of the file.
