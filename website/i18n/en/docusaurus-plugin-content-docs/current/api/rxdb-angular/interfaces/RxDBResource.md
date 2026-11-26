---
sidebar_label: "RxDBResource⟨T⟩"
---

# RxDBResource`<T>`

Defined in: [rxdb-angular/src/hooks.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L23)

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Properties

### error \{#error\}

```ts
readonly error: Signal<Error | undefined>;
```

Defined in: [rxdb-angular/src/hooks.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L27)

Error of the resource

***

### hasValue \{#hasvalue\}

```ts
readonly hasValue: Signal<boolean>;
```

Defined in: [rxdb-angular/src/hooks.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L33)

Whether the resource has a value

***

### isEmpty \{#isempty\}

```ts
readonly isEmpty: Signal<boolean | undefined>;
```

Defined in: [rxdb-angular/src/hooks.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L31)

Whether the resource is empty

***

### isLoading \{#isloading\}

```ts
readonly isLoading: Signal<boolean>;
```

Defined in: [rxdb-angular/src/hooks.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L29)

Loading state of the resource

***

### value \{#value\}

```ts
readonly value: Signal<T>;
```

Defined in: [rxdb-angular/src/hooks.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L25)

Value of the resource
