# PreferenceOptions

```ts
type PreferenceOptions = 
  | readonly PreferenceOption[]
  | {
  source: PreferenceOptionSource;
};
```

Defined in: [preferences/schema/types.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L23)

Options: a static list, or a reference to a runtime source.
