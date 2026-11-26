# FormFieldValidationError

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:82

Form field validation error

## Properties

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:84

The name of the field that failed

***

### message \{#message\}

```ts
message: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:86

Error message

***

### reason? \{#reason\}

```ts
reason?: object;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:88

A deterministic validation source used to regenerate the copy in the current language.

#### kind

```ts
kind: "validation" | "parse";
```

Distinguishes field constraint validation from input parse failures.

#### value

```ts
value: unknown;
```

The raw field value at the time the error was produced.
