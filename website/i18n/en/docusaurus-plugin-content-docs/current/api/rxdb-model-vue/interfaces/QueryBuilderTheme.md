# QueryBuilderTheme

Defined in: [packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts#L11)

QueryBuilder theme interface (aligned with `QueryBuilderTheme` on the Angular side).

Defines the component type of each UI slot, allowing them to be replaced with implementations from a different UI library.
Theme components must follow these conventions:

- accept standard props (field, operator, value, etc.);
- support both emit events and an optional `xxxFn` callback prop (for injection into dynamic components).

## Properties

### fieldSelector \{#fieldselector\}

```ts
fieldSelector: Component;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts#L13)

Field selector component

---

### operatorSelector \{#operatorselector\}

```ts
operatorSelector: Component;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts#L15)

Operator selector component

---

### valueInput \{#valueinput\}

```ts
valueInput: Component;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts#L17)

Value input component
