# EntityFormSnapshot

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:5

Snapshot of the form state; consumers can map it directly onto their own controls.

## Properties

### data \{#data\}

```ts
readonly data: EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:13

Current form value.

---

### dirty \{#dirty\}

```ts
readonly dirty: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:21

Whether the data has changed relative to the most recent input.

---

### errors \{#errors\}

```ts
readonly errors: readonly FormFieldValidationError[];
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:17

Current field errors.

---

### fields \{#fields\}

```ts
readonly fields: readonly FormFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:9

Complete field configuration.

---

### fieldStates \{#fieldstates\}

```ts
readonly fieldStates: readonly EntityFormFieldSnapshot[];
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:11

Current value, error, read-only state, and default display text of each field.

---

### initialData \{#initialdata\}

```ts
readonly initialData: EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:15

The most recent input data, used for cancellation.

---

### mode \{#mode\}

```ts
readonly mode: FormMode;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:7

Current mode.

---

### readonly \{#readonly\}

```ts
readonly readonly: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:23

true in view mode or when the field is read-only.

---

### valid \{#valid\}

```ts
readonly valid: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:19

Whether the current data passed validation.
