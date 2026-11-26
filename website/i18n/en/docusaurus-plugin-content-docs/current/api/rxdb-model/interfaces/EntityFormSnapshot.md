# EntityFormSnapshot

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L28)

Form state snapshot; consumers can map it directly to their own controls.

## Properties

### data \{#data\}

```ts
readonly data: EntityFormData;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L36)

Current form values.

***

### dirty \{#dirty\}

```ts
readonly dirty: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L44)

Whether the data has changed relative to the most recent input.

***

### errors \{#errors\}

```ts
readonly errors: readonly FormFieldValidationError[];
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L40)

Current field errors.

***

### fields \{#fields\}

```ts
readonly fields: readonly FormFieldConfig[];
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L32)

Full field configuration.

***

### fieldStates \{#fieldstates\}

```ts
readonly fieldStates: readonly EntityFormFieldSnapshot[];
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L34)

Current value, error, read-only state, and default display text for each field.

***

### initialData \{#initialdata\}

```ts
readonly initialData: EntityFormData;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L38)

The most recent input data, used for canceling.

***

### mode \{#mode\}

```ts
readonly mode: FormMode;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L30)

Current mode.

***

### readonly \{#readonly\}

```ts
readonly readonly: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L46)

true in view mode or when the field is read-only.

***

### valid \{#valid\}

```ts
readonly valid: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L42)

Whether the current data passes validation.
