# DevToolsMutationPolicy

```ts
type DevToolsMutationPolicy = 'allow' | 'omit';
```

Defined in: [v2/authorization.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L102)

Whether the owner opts in to write operations separately.

## Remarks

Omitted means read-only. The `full` tier does not imply "writes allowed" — the tier says "how many kinds of things this connection may do",
while the policy says "whether the owner opened writes for this run"; the two switches serve different decision makers.
