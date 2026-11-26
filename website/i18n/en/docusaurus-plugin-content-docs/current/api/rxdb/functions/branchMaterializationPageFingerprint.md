# branchMaterializationPageFingerprint()

```ts
function branchMaterializationPageFingerprint(payload): string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:230](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L230)

Computes the fingerprint of one page of snapshot payload — **this is the public definition of the page fingerprint** (FR-044).

## Parameters

| Parameter | Type                                | Description                                    |
| --------- | ----------------------------------- | ---------------------------------------------- |
| `payload` | `Record`&lt;`string`, `unknown`&gt; | The payload that is stored as-is for this page |

## Returns

`string`

Hexadecimal SHA-256

## Remarks

The source side computes it once when handing over the page, and before the barrier projection the stored payload is recomputed and compared; if the definition only existed on one side,
the other side could only arrive at it by trial and error — and the trialed one would silently mismatch on the day this function changes.

Only the payload is consumed; the page number, attempt id or target branch are not mixed in: mixing them in would make the same page content "change content" due to page-number offset when reusing an old
attempt, and whether the page number is offset is answered separately by the barrier's density check.
Folding two things into one value means the reported cause would forever be just one.

## Example

```ts
const payload = { repository: 'public:todo', changes: [] };
const page = { payload, fingerprint: branchMaterializationPageFingerprint(payload) };
```
