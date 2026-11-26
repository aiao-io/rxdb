# WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS

```ts
const WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS: readonly (keyof RawWritePrimitives)[];
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:50

The names of the mounted write primitives, in the order of the contract §1 table.

## Remarks

`Object.keys()` drops the keys' literal types; this asserts them back — the keys' exhaustiveness is
guaranteed by MOUNT\_POINTS\_BY\_PRIMITIVE's `Record` annotation, and this line merely reads it out.

Installation and uninstallation share this one list: one missing name is one permanent opening, and it now
shares a source with the registry.
