# fingerprintOf()

```ts
function fingerprintOf(operation, patch): string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L120)

The fingerprint of a unit's current state (FNV-1a/32, fixed 8 hexadecimal digits).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operation` | [`WorkingTreeEntryOperation`](../type-aliases/WorkingTreeEntryOperation.md) | The operation after folding |
| `patch` | `Record`&lt;`string`, `unknown`&gt; \| `null` | The forward patch after folding |

## Returns

`string`

The fingerprint string

## Remarks

A non-cryptographic hash is used because it guards against **mistaken equality**, not forgery, and both ends compute it with the same implementation.

**No production code compares this column today**: cold replay, commit and diff don't read it (see `cold-replay.ts` and `toChangeUnit` in `commit-command.ts`); the commit content fingerprint goes through `computeChangeUnitFingerprint`'s SHA-256 separately; and the conflict detection delivered by US-308 doesn't read it either, going through revision CAS and the active branch token. If a future consumer compares this column **pairwise by identity** between the two sides of the same entity, the mistaken-equality probability is about 2⁻³² per pair, about 2×10⁻⁵ over a hundred thousand pairs; the birthday bound of "about 77 thousand entries to reach a collision probability above half" only holds when the fingerprint is used as a key across entities. If it were actually replaced with SHA-256, no async and no new dependency would be needed (`sha256Hex` in `@aiao/rxdb` is synchronous and this plugin already uses it), at the cost of one extra pure-JS digest per write on the capture hot path and the column width going from 8 to 64 digits. Whether to switch is decided by the first consumer that compares this column, and is registered in `requirements/roadmap.md` under "epic-006 architecture items deferred in review".

`operation` participates in the hash: the same patch under `insert` and `update` is two different intents, and hashing only the patch would give the two identical fingerprints.
