---
sidebar_label: "QueryBuilderServiceOptions⟨T⟩"
---

# QueryBuilderServiceOptions`<T>`

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L28)

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

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L49)

Configuration options

***

### fields? \{#fields\}

```ts
fields?: FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L44)

Field metadata

***

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L30)

Message runtime.

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: RuleGroup<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L39)

Initial RxDB query

***

### initialState? \{#initialstate\}

```ts
initialState?: QueryBuilderState<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L34)

Initial query state

***

### operatorRegistry? \{#operatorregistry\}

```ts
operatorRegistry?: OperatorRegistry;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L54)

Custom operator registry

***

### queryConverter? \{#queryconverter\}

```ts
queryConverter?: QueryConverter<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L64)

Custom converter

***

### validationService? \{#validationservice\}

```ts
validationService?: ValidationService;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L59)

Custom validation service
