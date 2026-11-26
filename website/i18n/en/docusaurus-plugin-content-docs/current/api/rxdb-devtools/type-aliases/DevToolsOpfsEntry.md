# DevToolsOpfsEntry

```ts
type DevToolsOpfsEntry = 
  | {
  entries: readonly DevToolsOpfsEntry[];
  kind: "directory";
  name: string;
  path: string;
}
  | {
  kind: "file";
  lastModified: number;
  name: string;
  path: string;
  size: number;
};
```

Defined in: [browser/opfs-files-provider.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L36)

A single directory entry; `entries` appears only on directories.
