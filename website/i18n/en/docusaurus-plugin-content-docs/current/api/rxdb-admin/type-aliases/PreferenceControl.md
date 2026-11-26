# PreferenceControl

```ts
type PreferenceControl =
  | {
      kind: 'switch';
    }
  | {
      kind: 'select';
      options: PreferenceOptions;
    }
  | {
      kind: 'segmented';
      nullable?: boolean;
      options: readonly PreferenceOption[];
    }
  | {
      kind: 'cards';
      options: readonly PreferenceOption[];
      preview: PreferencePreview;
    }
  | {
      kind: 'number';
      max: number;
      min: number;
      nullable?: boolean;
      step: number;
      unit?: string;
    }
  | {
      kind: 'text';
      placeholderKey?: string;
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

Defined in: [preferences/schema/types.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L29)

A control. Generic controls render by kind; `themes` / `widgets` / `shortcuts` are special controls driven by shell data.
