# EntityFormSnapshot

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:5

Form state snapshot; consumers can map it directly to their own controls.

## Properties

### data \{#data\}

```ts
readonly data: EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:13

Current form values.

***

### dirty \{#dirty\}

```ts
readonly dirty: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:21

Whether the data has changed relative to the most recent input.

***

### errors \{#errors\}

```ts
readonly errors: readonly FormFieldValidationError[];
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:17

Current field errors.

***

### fields \{#fields\}

```ts
readonly fields: readonly FormFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:9

Full field configuration.

***

### fieldStates \{#fieldstates\}

```ts
readonly fieldStates: readonly EntityFormFieldSnapshot[];
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:11

Current value, error, read-only state, and default display text of each field.

***

### initialData \{#initialdata\}

```ts
readonly initialData: EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:15

The most recent input data, used for cancel.

***

### mode \{#mode\}

```ts
readonly mode: FormMode;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:7

Current mode.

***

### readonly \{#readonly\}

```ts
readonly readonly: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:23

true in view mode or when the fields are read-only.

***

### valid \{#valid\}

```ts
readonly valid: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:19

Whether the current data passes validation.
