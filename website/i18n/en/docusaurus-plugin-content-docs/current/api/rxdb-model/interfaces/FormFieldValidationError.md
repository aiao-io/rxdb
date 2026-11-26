# FormFieldValidationError

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L92)

Form field validation error

## Properties

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L94)

Name of the field that failed

---

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L96)

Error message

---

### reason? \{#reason\}

```ts
reason?: object;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L98)

Deterministic validation source used to regenerate the message in the current language.

#### kind

```ts
kind: 'validation' | 'parse';
```

Distinguishes field constraint validation from input parsing failures.

#### value

```ts
value: unknown;
```

The raw field value at the time the error was produced.
