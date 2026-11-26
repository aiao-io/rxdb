# fingerprintOf()

```ts
function fingerprintOf(operation, patch): string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L120)

The fingerprint of the unit's current state (FNV-1a/32, fixed 8 hex digits).

## Parameters

| Parameter   | Type                                                                        | Description                     |
| ----------- | --------------------------------------------------------------------------- | ------------------------------- |
| `operation` | [`WorkingTreeEntryOperation`](../type-aliases/WorkingTreeEntryOperation.md) | The operation after folding     |
| `patch`     | `Record`&lt;`string`, `unknown`&gt; \| `null`                               | The forward patch after folding |

## Returns

`string`

The fingerprint string

## Remarks

A non-cryptographic hash is used because what it guards against is not forgery but **false equality**, and both ends compute it with the same implementation.

**No production code compares this column today**: cold replay, commit and diff do not read it (see `cold-replay.ts` and `toChangeUnit` in `commit-command.ts`); the content fingerprint of a commit goes through `computeChangeUnitFingerprint`'s SHA-256 instead; the conflict detection delivered by US-308 does not read it either — it uses the revision CAS and the active branch token. If a future consumer compares this column pairwise per identity across the two sides of the same entity, the probability of false equality is about 2⁻³² per pair, and about 2×10⁻⁵ across a hundred thousand pairs; the birthday bound of "about 77k entries for a half chance of collision" only applies when the fingerprint is used as a key across entities. Switching to SHA-256 would need neither async nor a new dependency (`@aiao/rxdb`'s `sha256Hex` is synchronous and already used by this plugin); the cost is one extra pure-JS digest per write on the capture hot path and a column width growing from 8 to 64 digits. Whether to switch is up to the first consumer that compares this column, and it is filed under "epic-006 architecture items deferred by review" in `requirements/roadmap.md`.

`operation` participates in the hash: the same patch under `insert` versus `update` is two different intents, and hashing only the patch would give the two the same fingerprint.
