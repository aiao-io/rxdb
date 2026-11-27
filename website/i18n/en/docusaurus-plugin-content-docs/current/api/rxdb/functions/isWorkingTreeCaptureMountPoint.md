# isWorkingTreeCaptureMountPoint()

```ts
function isWorkingTreeCaptureMountPoint(signature): boolean;
```

Defined in: [packages/rxdb/src/capture/capture-mount-points.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-mount-points.ts#L165)

Judges whether a write primitive signature is a capture mount point.

## Parameters

| Parameter   | Type                                                                                        | Description                            |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| `signature` | [`WorkingTreeWritePrimitiveSignature`](../interfaces/WorkingTreeWritePrimitiveSignature.md) | The write primitive signature to judge |

## Returns

`boolean`

`true` when it matches [WORKING\_TREE\_CAPTURE\_MOUNT\_POINTS](../variables/WORKING_TREE_CAPTURE_MOUNT_POINTS.md).

## Remarks

All three items must be **exactly equal** to count as a match: host base class, method name, and the parameter name sequence. Missing any one comparison would misjudge the remote `mergeChanges` or a renamed local overload as a mount point.

## Example

```ts
isWorkingTreeCaptureMountPoint({
  host: 'RxDBAdapterLocalBase',
  method: 'mergeChanges',
  parameters: ['actions', 'localChanges', 'disableTriggers']
}); // true —— local overload
```
