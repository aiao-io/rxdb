# PreferenceConstraint

```ts
type PreferenceConstraint = 
  | {
  kind: "enum";
  nullable?: boolean;
  values: readonly string[];
}
  | {
  kind: "number";
  max?: number;
  min?: number;
  nullable?: boolean;
}
  | {
  kind: "pattern";
  normalize?: (value) => string | undefined;
  pattern: RegExp;
};
```

Defined in: [preferences/merge.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/merge.ts#L7)

Value constraints for a leaf, derived from the preferences schema.
