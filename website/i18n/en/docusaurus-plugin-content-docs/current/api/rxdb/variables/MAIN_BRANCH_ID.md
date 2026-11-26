# MAIN_BRANCH_ID

```ts
const MAIN_BRANCH_ID: "main" = 'main';
```

Defined in: [packages/rxdb/src/system/active-branch-guard.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/active-branch-guard.ts#L135)

Branch id of the root branch (also the recovery target when there is no active branch).

## Remarks

The recovery target must be **deterministic**: a database usually has a `feature-x`, and picking it over creating `main` would be "smarter" — but that means making a branch switch decision on the user's behalf.

Like [ACTIVE\_BRANCH\_KEY](ACTIVE_BRANCH_KEY.md) it **must** appear in the public surface, for the same reason: half of the places that recognize this id are raw SQL — `read_current_branch_id` on both backends uses it as the fallback predicate when there is no active branch (`WHERE id = 'main'`), `create_tables_sql` splices it into the change triggers of new tables, and `migrate_system_schema` uses it to converge the cardinality of activeKey. If each side copied its own literal, a typo on one side would not be a compile error — it would just make that side treat a different branch as the root: changes recorded under a nonexistent branch name, and a zero-active database recovering a second main.

The value itself takes part in no format convention (unlike the sentinel key, which rests on "branch ids contain no `*`"): it is an ordinary, legal branch id that happens to be reserved by default.
