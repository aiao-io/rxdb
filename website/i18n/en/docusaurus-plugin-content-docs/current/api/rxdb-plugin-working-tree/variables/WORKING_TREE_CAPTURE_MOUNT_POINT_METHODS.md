# WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS

```ts
const WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS: readonly (keyof RawWritePrimitives)[];
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:50

Names of the mounted write primitives, in contract §1 table order.

## Remarks

`Object.keys()` drops the literal types of the keys; this line asserts them back — the exhaustiveness of the keys is guaranteed by
MOUNT\_POINTS\_BY\_PRIMITIVE's `Record` annotation, this line only reads it out.

Installation and uninstallation share this one list: one missing name is one permanent opening, and it is now sourced from the same registry.
