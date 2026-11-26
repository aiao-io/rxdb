# isWorkingTreeCaptureMountPoint()

```ts
function isWorkingTreeCaptureMountPoint(signature): boolean;
```

Defined in: packages/rxdb/dist/capture/capture-mount-points.d.ts:72

Judges whether a write primitive signature is a capture mount point

## Parameters

| Parameter   | Type                                                                                        | Description                            |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| `signature` | [`WorkingTreeWritePrimitiveSignature`](../interfaces/WorkingTreeWritePrimitiveSignature.md) | The write primitive signature to judge |

## Returns

`boolean`

`true` when it hits [WORKING\_TREE\_CAPTURE\_MOUNT\_POINTS](../variables/WORKING_TREE_CAPTURE_MOUNT_POINTS.md)

## Remarks

All three parts must be **identical** to count as a hit: host base class, method name, and parameter name
sequence. Omitting any one comparison would judge a remote `mergeChanges`, or a renamed local overload, as a
mount point.

## Example

```ts
isWorkingTreeCaptureMountPoint({
  host: 'RxDBAdapterLocalBase',
  method: 'mergeChanges',
  parameters: ['actions', 'localChanges', 'disableTriggers']
}); // true — the local overload
```
