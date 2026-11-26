# trustedCallsiteKey()

```ts
function trustedCallsiteKey(callsite): string;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L269)

Registry key: file + symbol + intent.

## Parameters

| Parameter  | Type                                                                                                      | Description                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `callsite` | `Pick`&lt;[`TrustedCallsite`](../interfaces/TrustedCallsite.md), `"file"` \| `"symbol"` \| `"intent"`&gt; | A row of the registry, or any declaration that self-reports these three parts |

## Returns

`string`

A stable key joining the three parts with `·`.

## Remarks

The parameter deliberately takes only the three parts rather than the whole row: when a trusted callsite self-reports its intent, it does not have `entrance` in hand yet (that is the registry's answer, not the callsite's input); requiring it to assemble a whole row would make it copy the answer, and a copy error would go unnoticed.

The line number is not in the key — it changes on every formatting pass, and the registry must survive reformatting. The write primitive is not in the key either: #5 and #6 are already distinguished by intent alone, and adding the primitive would make "the same strategy called from a different host" a false positive for a new callsite.
