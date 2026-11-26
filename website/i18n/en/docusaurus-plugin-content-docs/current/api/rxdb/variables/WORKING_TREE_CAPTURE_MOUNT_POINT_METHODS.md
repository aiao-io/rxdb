# WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS

```ts
const WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS: readonly (keyof RawWritePrimitives)[];
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L130)

Names of the mounted write primitives, in the table order of contract §1.

## Remarks

`Object.keys()` drops the literal types of the keys; this asserts them back — the exhaustiveness of the keys is guaranteed by the `Record` annotation of MOUNT\_POINTS\_BY\_PRIMITIVE, and this line merely reads it out.

Install and uninstall share this single list: a missing name is a permanently open hole, and it is now sourced from the same registry.
