# FormFieldValidationError

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:82

Form field validation error

## Properties

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:84

Name of the field with the error

---

### message \{#message\}

```ts
message: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:86

Error message

---

### reason? \{#reason\}

```ts
reason?: object;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:88

Deterministic validation source used to regenerate the message in the current language.

#### kind

```ts
kind: 'validation' | 'parse';
```

Distinguishes field constraint validation from input parse failure.

#### value

```ts
value: unknown;
```

The original field value when this error occurred.
