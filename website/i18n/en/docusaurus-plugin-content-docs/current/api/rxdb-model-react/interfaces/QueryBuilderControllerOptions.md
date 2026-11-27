---
sidebar_label: 'QueryBuilderControllerOptions⟨T⟩'
---

# QueryBuilderControllerOptions`<T>`

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:26

Options for creating the query state machine.

## Extends

- [`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Properties

### config? \{#config\}

```ts
config?: QueryBuilderConfig<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:31

Configuration options

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`config`](QueryBuilderServiceOptions.md#config)

---

### fields? \{#fields\}

```ts
fields?: FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:27

Field metadata

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`fields`](QueryBuilderServiceOptions.md#fields)

---

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:15

Text runtime.

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`i18n`](QueryBuilderServiceOptions.md#i18n)

---

### initialQuery? \{#initialquery\}

```ts
initialQuery?: RuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:23

Initial RxDB Query

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`initialQuery`](QueryBuilderServiceOptions.md#initialquery)

---

### initialState? \{#initialstate\}

```ts
initialState?: QueryBuilderState<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:19

Initial query state

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`initialState`](QueryBuilderServiceOptions.md#initialstate)

---

### operatorRegistry? \{#operatorregistry\}

```ts
operatorRegistry?: OperatorRegistry;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:35

Custom operator registry

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`operatorRegistry`](QueryBuilderServiceOptions.md#operatorregistry)

---

### queryConverter? \{#queryconverter\}

```ts
queryConverter?: QueryConverter<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:43

Custom converter

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`queryConverter`](QueryBuilderServiceOptions.md#queryconverter)

---

### readonly? \{#readonly\}

```ts
readonly readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:27

---

### validationService? \{#validationservice\}

```ts
validationService?: ValidationService;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:39

Custom validation service

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`validationService`](QueryBuilderServiceOptions.md#validationservice)
