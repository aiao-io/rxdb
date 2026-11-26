---
sidebar_label: "QueryBuilderControllerOptions⟨T⟩"
---

# QueryBuilderControllerOptions`<T>`

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L35)

Options for creating the query state machine.

## Extends

- [`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md)&lt;`T`&gt;

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

The configuration options

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`config`](QueryBuilderServiceOptions.md#config)

***

### fields? \{#fields\}

```ts
fields?: FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L44)

The field metadata

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`fields`](QueryBuilderServiceOptions.md#fields)

***

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L30)

The copy runtime.

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`i18n`](QueryBuilderServiceOptions.md#i18n)

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: RuleGroup<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L39)

The initial RxDB Query

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`initialQuery`](QueryBuilderServiceOptions.md#initialquery)

***

### initialState? \{#initialstate\}

```ts
initialState?: QueryBuilderState<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L34)

The initial query state

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`initialState`](QueryBuilderServiceOptions.md#initialstate)

***

### operatorRegistry? \{#operatorregistry\}

```ts
operatorRegistry?: OperatorRegistry;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L54)

A custom operator registry

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`operatorRegistry`](QueryBuilderServiceOptions.md#operatorregistry)

***

### queryConverter? \{#queryconverter\}

```ts
queryConverter?: QueryConverter<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L64)

A custom converter

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`queryConverter`](QueryBuilderServiceOptions.md#queryconverter)

***

### readonly? \{#readonly\}

```ts
readonly readonly?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L36)

***

### validationService? \{#validationservice\}

```ts
validationService?: ValidationService;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L59)

A custom validation service

#### Inherited from

[`QueryBuilderServiceOptions`](QueryBuilderServiceOptions.md).[`validationService`](QueryBuilderServiceOptions.md#validationservice)
