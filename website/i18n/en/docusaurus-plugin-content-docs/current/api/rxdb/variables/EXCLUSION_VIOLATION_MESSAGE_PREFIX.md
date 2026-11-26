# EXCLUSION_VIOLATION_MESSAGE_PREFIX

```ts
const EXCLUSION_VIOLATION_MESSAGE_PREFIX: "rxdb:exclusion_violation:" = 'rxdb:exclusion_violation:';
```

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L30)

Prefix of the `RAISE` message of the SQLite exclusion trigger (the PG-side plugin trigger uses the same `rxdb:<kind>:<detail>` format).
