# getSystemEntityIdentities()

```ts
function getSystemEntityIdentities(): ReadonlySet<string>;
```

Defined in: [packages/rxdb/src/system/system-entities.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-entities.ts#L121)

The identities of all system tables (`namespace:name`, e.g. `rxdb:RxDBBranch`).

## Returns

`ReadonlySet`&lt;`string`&gt;

The identity set computed from the current registry; **re-evaluated on every call**

## Remarks

Same source and same "live view" definition as [getSystemEntityNames](getSystemEntityNames.md) (see there for the reasoning), the only difference being **whether the
namespace is included**: a bare name cannot answer "is `public:Commit` a system table", and the system tables of epic-006 happen to include one
`rxdb:Commit` — integrators using `Commit` as a business entity name are perfectly legitimate. Judged by bare name, that business entity's writes would be
batch-classified as `system` and silently bypass working tree capture — changes never enter commits, with no error shape at all.

It returns the set rather than a per-item predicate (the one in [isSystemEntity](isSystemEntity.md) wants the entity **class**): consumers often hold
only the two strings `namespace` + `entity` read from the change log, and cannot get back to a class reference.
