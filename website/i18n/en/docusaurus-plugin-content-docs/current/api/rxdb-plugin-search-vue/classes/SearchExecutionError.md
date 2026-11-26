# SearchExecutionError

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:152

Runtime execution error (SQL failure / storage unavailable); recoverable via [SearchHandle.retry](../interfaces/SearchHandle.md#retry).

## Extends

- [`SearchError`](../../rxdb-plugin-search/classes/SearchError.md)

## Constructors

### Constructor

```ts
new SearchExecutionError(
   message,
   cause?,
   name?
): SearchExecutionError;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:155

#### Parameters

| Parameter | Type      | Description                                     |
| --------- | --------- | ----------------------------------------------- |
| `message` | `string`  | -                                               |
| `cause?`  | `unknown` | The original exception that triggered the error |
| `name?`   | `string`  | -                                               |

#### Returns

`SearchExecutionError`

#### Overrides

[`SearchError`](../../rxdb-plugin-search/classes/SearchError.md).[`constructor`](../../rxdb-plugin-search/classes/SearchError.md#constructor)

## Properties

### cause? \{#cause\}

```ts
readonly cause?: unknown;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:154

The original exception that triggered the error

#### Overrides

[`SearchError`](../../rxdb-plugin-search/classes/SearchError.md).[`cause`](../../rxdb-plugin-search/classes/SearchError.md#cause)

---

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`SearchError`](../../rxdb-plugin-search/classes/SearchError.md).[`message`](../../rxdb-plugin-search/classes/SearchError.md#message)

---

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`SearchError`](../../rxdb-plugin-search/classes/SearchError.md).[`name`](../../rxdb-plugin-search/classes/SearchError.md#name)

---

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`SearchError`](../../rxdb-plugin-search/classes/SearchError.md).[`stack`](../../rxdb-plugin-search/classes/SearchError.md#stack)
