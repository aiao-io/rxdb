# MiniProgramFileLayout

```ts
type MiniProgramFileLayout =
  | {
      kind: 'single';
    }
  | {
      chunkBytes: number;
      kind: 'chunked';
    };
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L77)

The storage layout of the database file on the host file system.

- `single`: one logical file maps to one host file, and every flush overwrites the whole file.
- `chunked`: the logical file `P` is stored as `P.0`, `P.1`…, each chunk `chunkBytes` bytes; only changed chunks are rewritten,
  and 2×`chunkBytes` of rollback headroom is reserved before creating the main journal, yielded to rollback when the quota is hit.

Files in the two layouts are mutually incompatible: declaring `chunked` when the directory already contains a single-file database is rejected directly, without migration.
