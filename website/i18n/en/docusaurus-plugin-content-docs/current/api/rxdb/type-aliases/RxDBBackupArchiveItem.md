# RxDBBackupArchiveItem

```ts
type RxDBBackupArchiveItem = 
  | {
  header: RxDBBackupEntryHeader;
  type: "entry";
}
  | {
  bytes: Uint8Array;
  type: "data";
}
  | {
  trailer: RxDBBackupTrailer;
  type: "end";
};
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L47)

The output of [RxDBBackupArchiveReader.next](../classes/RxDBBackupArchiveReader.md#next).

## Remarks

A file entry is followed by a number of `data` items whose byte count sums to the `size` declared in the header;
`end` is produced only when both the end marker and the digest verify and no bytes follow.
