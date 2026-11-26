# UIRuleWithWhere

```ts
type UIRuleWithWhere = UIRule & object;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-rule/query-rule-types.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-rule/query-rule-types.ts#L9)

UI rule with a where subquery (the shape of exists / notExists rules).

SFCs cannot export symbols, so this was split into its own module (aligned with the React-side `query-rule.tsx`
`export type UIRuleWithWhere` / the Angular-side `QueryRuleComponent` same-named export).

## Type Declaration

### where?

```ts
where?: QueryBuilderRuleGroup<Record<string, unknown>>;
```
