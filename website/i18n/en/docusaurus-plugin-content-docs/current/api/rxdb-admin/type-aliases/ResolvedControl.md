# ResolvedControl

```ts
type ResolvedControl =
  | {
      kind: 'switch';
    }
  | {
      kind: 'select';
      options: ResolvedOption[];
    }
  | {
      kind: 'segmented';
      options: ResolvedOption[];
    }
  | {
      kind: 'cards';
      options: ResolvedOption[];
      preview: PreferencePreview;
    }
  | {
      kind: 'number';
      max: number;
      min: number;
      nullable: boolean;
      step: number;
      unit?: string;
    }
  | {
      kind: 'text';
      placeholder?: string;
    }
  | {
      kind: 'color';
      presets: readonly string[];
    }
  | {
      kind: 'themes';
    }
  | {
      kind: 'widgets';
    }
  | {
      kind: 'shortcuts';
    };
```

Defined in: [preferences/drawer-model.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L22)

A control with resolved option labels; the three bindings render by `kind`.
