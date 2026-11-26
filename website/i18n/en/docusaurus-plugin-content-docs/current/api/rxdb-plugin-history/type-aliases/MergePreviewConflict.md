# MergePreviewConflict

```ts
type MergePreviewConflict = 
  | {
  fields: readonly string[];
  kind: "overwrite";
}
  | {
  fields: readonly string[];
  kind: "delete_edited";
}
  | {
  kind: "update_deleted";
}
  | {
  kind: "revive_deleted";
};
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L93)

The four situations where a merge hits changes made on the target branch since the fork.

## Remarks

A merge is a one-way overwrite: UPDATE writes only the fields in the patch, INSERT goes through `INSERT OR REPLACE`, DELETE deletes by primary key.
"Since the fork" means since the two lines diverged: the base is the most recent common ancestor (merge base) of the source tip and the target tip, not the source branch's own
fork point — when the target is a descendant of the source, forked earlier than the source, or separated from the source by an intermediate branch, the two are not the same point.

- `overwrite`: among the business fields the source writes, some were changed on the target since the fork and differ on both sides; `fields` are the ones that will be overwritten
- `delete_edited`: the source deleted this entity, and the target changed it since the fork; `fields` are the business fields the target changed, which will disappear with the entity
- `update_deleted`: the source changed this entity, but the target has no such row — the target deleted it since the fork, or it was created by a branch upstream of the source after the two sides split
  (a merge only moves the source branch's own changes, so the creation is not carried over); the UPDATE finds no row and this update is a no-op
- `revive_deleted`: the source deleted and then recreated this entity, and the target deleted it since the fork; the merge will recreate it
