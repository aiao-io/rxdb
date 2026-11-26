# QueryBuilderTheme

Defined in: [packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts#L13)

QueryBuilder theme interface

## Description

Defines the component types for each UI slot, allowing them to be replaced with implementations from different UI libraries

Theme components must follow these conventions:

- accept standard signal inputs (field, operator, value, etc.)
- support both output() events and optional onXxx callback inputs (for NgComponentOutlet)

## Properties

### fieldSelector \{#fieldselector\}

```ts
fieldSelector: Type<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts#L15)

Field selector component

---

### operatorSelector \{#operatorselector\}

```ts
operatorSelector: Type<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts#L17)

Operator selector component

---

### valueInput \{#valueinput\}

```ts
valueInput: Type<unknown>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/theme/query-builder-theme.token.ts#L19)

Value input component
