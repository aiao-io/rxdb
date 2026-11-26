# isWorkingTreeCaptureMountPoint()

```ts
function isWorkingTreeCaptureMountPoint(signature): boolean;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:72

Determines whether a write primitive signature is a capture mount point

## Parameters

| Parameter   | Type                                                                                        | Description                            |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| `signature` | [`WorkingTreeWritePrimitiveSignature`](../interfaces/WorkingTreeWritePrimitiveSignature.md) | The write primitive signature to judge |

## Returns

`boolean`

`true` when it matches [WORKING\_TREE\_CAPTURE\_MOUNT\_POINTS](../variables/WORKING_TREE_CAPTURE_MOUNT_POINTS.md)

## Remarks

All three must be **fully equal** to match: the host base class, the method name, and the parameter name sequence. Missing any one of the comparisons would judge a remote `mergeChanges`
or a renamed local overload as a mount point.

## Example

```ts
isWorkingTreeCaptureMountPoint({
  host: 'RxDBAdapterLocalBase',
  method: 'mergeChanges',
  parameters: ['actions', 'localChanges', 'disableTriggers']
}); // true —— the local overload
```
