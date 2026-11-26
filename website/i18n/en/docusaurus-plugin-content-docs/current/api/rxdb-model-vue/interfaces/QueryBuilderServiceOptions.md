---
sidebar_label: "QueryBuilderServiceOptions⟨T⟩"
---

# QueryBuilderServiceOptions`<T>`

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:13

QueryBuilderService options

## Extended by

- [`QueryBuilderControllerOptions`](QueryBuilderControllerOptions.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Properties

### config? \{#config\}

```ts
config?: QueryBuilderConfig<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:31

Configuration options

***

### fields? \{#fields\}

```ts
fields?: FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:27

Field metadata

***

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:15

Text runtime.

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: RuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:23

Initial RxDB Query

***

### initialState? \{#initialstate\}

```ts
initialState?: QueryBuilderState<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:19

Initial query state

***

### operatorRegistry? \{#operatorregistry\}

```ts
operatorRegistry?: OperatorRegistry;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:35

Custom operator registry

***

### queryConverter? \{#queryconverter\}

```ts
queryConverter?: QueryConverter<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:43

Custom converter

***

### validationService? \{#validationservice\}

```ts
validationService?: ValidationService;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:39

Custom validation service
