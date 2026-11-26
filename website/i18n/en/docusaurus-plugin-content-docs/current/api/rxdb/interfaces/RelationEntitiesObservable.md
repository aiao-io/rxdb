---
sidebar_label: 'RelationEntitiesObservable⟨T⟩'
---

# RelationEntitiesObservable`<T>`

Defined in: [packages/rxdb/src/entity/entity.interface.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L221)

Access interface for multiple relation objects
Provides observation and manipulation capabilities over a collection of related entities

## Extends

- `Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### add \{#add\}

```ts
add: (...entities) => void;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L232)

Adds related entities

#### Parameters

| Parameter     | Type                        | Description                 |
| ------------- | --------------------------- | --------------------------- |
| ...`entities` | `InstanceType`&lt;`T`&gt;[] | The list of entities to add |

#### Returns

`void`

---

### count$ \{#count\}

```ts
count$: Observable<number>;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L225)

Observable of the related entity count

---

### ~~operator~~ \{#operator\}

```ts
operator: (Operator<any, InstanceType<T>[]>) | undefined;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:17

#### Deprecated

Internal implementation detail, do not use directly. Will be made internal in v8.

#### Inherited from

`Observable.operator`

---

### remove \{#remove\}

```ts
remove: (...entities) => void;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L239)

Removes related entities

#### Parameters

| Parameter     | Type                        | Description                    |
| ------------- | --------------------------- | ------------------------------ |
| ...`entities` | `InstanceType`&lt;`T`&gt;[] | The list of entities to remove |

#### Returns

`void`

---

### ~~source~~ \{#source\}

```ts
source: (Observable<any>) | undefined;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:13

#### Deprecated

Internal implementation detail, do not use directly. Will be made internal in v8.

#### Inherited from

`Observable.source`

## Methods

### forEach() \{#foreach\}

#### Call Signature

```ts
forEach(next): Promise<void>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:90

Used as a NON-CANCELLABLE means of subscribing to an observable, for use with
APIs that expect promises, like `async/await`. You cannot unsubscribe from this.

**WARNING**: Only use this with observables you _know_ will complete. If the source
observable does not complete, you will end up with a promise that is hung up, and
potentially all of the state of an async function hanging out in memory. To avoid
this situation, look into adding something like timeout, take,
takeWhile, or takeUntil amongst others.

#### Example

```ts
import { interval, take } from 'rxjs';

const source$ = interval(1000).pipe(take(4));

async function getTotal() {
  let total = 0;

  await source$.forEach(value => {
    total += value;
    console.log('observable -> ' + value);
  });

  return total;
}

getTotal().then(total => console.log('Total: ' + total));

// Expected:
// 'observable -> 0'
// 'observable -> 1'
// 'observable -> 2'
// 'observable -> 3'
// 'Total: 6'
```

##### Parameters

| Parameter | Type                | Description                                         |
| --------- | ------------------- | --------------------------------------------------- |
| `next`    | (`value`) => `void` | A handler for each value emitted by the observable. |

##### Returns

`Promise`&lt;`void`&gt;

A promise that either resolves on observable completion or
rejects with the handled error.

##### Inherited from

`Observable.forEach`

#### Call Signature

```ts
forEach(next, promiseCtor): Promise<void>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:102

##### Parameters

| Parameter     | Type                     | Description                                            |
| ------------- | ------------------------ | ------------------------------------------------------ |
| `next`        | (`value`) => `void`      | a handler for each value emitted by the observable     |
| `promiseCtor` | `PromiseConstructorLike` | a constructor function used to instantiate the Promise |

##### Returns

`Promise`&lt;`void`&gt;

a promise that either resolves on observable completion or
rejects with the handled error

##### Deprecated

Passing a Promise constructor will no longer be available
in upcoming versions of RxJS. This is because it adds weight to the library, for very
little benefit. If you need this functionality, it is recommended that you either
polyfill Promise, or you create an adapter to convert the returned native promise
to whatever promise implementation you wanted. Will be removed in v8.

##### Inherited from

`Observable.forEach`

---

### ~~lift()~~ \{#lift\}

```ts
lift<R>(operator?): Observable<R>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:42

Creates a new Observable, with this Observable instance as the source, and the passed
operator defined as the new observable's operator.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-r"></a> `R` |

#### Parameters

| Parameter   | Type                                               | Description                                                   |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `operator?` | `Operator`&lt;`InstanceType`&lt;`T`&gt;[], `R`&gt; | the operator defining the operation to take on the observable |

#### Returns

`Observable`&lt;`R`&gt;

A new observable with the Operator applied.

#### Deprecated

Internal implementation detail, do not use directly. Will be made internal in v8.
If you have implemented an operator using `lift`, it is recommended that you create an
operator by simply returning `new Observable()` directly. See "Creating new operators from
scratch" section here: https://rxjs.dev/guide/operators

#### Inherited from

`Observable.lift`

---

### pipe() \{#pipe\}

#### Call Signature

```ts
pipe(): Observable<InstanceType<T>[]>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:103

##### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A>(op1): Observable<A>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:104

##### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-a"></a> `A` |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |

##### Returns

`Observable`&lt;`A`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B>(op1, op2): Observable<B>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:105

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-1"></a> `A` |
| <a id="type-parameter-b"></a> `B`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |

##### Returns

`Observable`&lt;`B`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C>(
   op1,
   op2,
   op3
): Observable<C>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:106

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-2"></a> `A` |
| <a id="type-parameter-b-1"></a> `B` |
| <a id="type-parameter-c"></a> `C`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`     | `OperatorFunction`&lt;`B`, `C`&gt;                         |

##### Returns

`Observable`&lt;`C`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C, D>(
   op1,
   op2,
   op3,
   op4
): Observable<D>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:107

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-3"></a> `A` |
| <a id="type-parameter-b-2"></a> `B` |
| <a id="type-parameter-c-1"></a> `C` |
| <a id="type-parameter-d"></a> `D`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`     | `OperatorFunction`&lt;`B`, `C`&gt;                         |
| `op4`     | `OperatorFunction`&lt;`C`, `D`&gt;                         |

##### Returns

`Observable`&lt;`D`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C, D, E>(
   op1,
   op2,
   op3,
   op4,
   op5
): Observable<E>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:108

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-4"></a> `A` |
| <a id="type-parameter-b-3"></a> `B` |
| <a id="type-parameter-c-2"></a> `C` |
| <a id="type-parameter-d-1"></a> `D` |
| <a id="type-parameter-e"></a> `E`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`     | `OperatorFunction`&lt;`B`, `C`&gt;                         |
| `op4`     | `OperatorFunction`&lt;`C`, `D`&gt;                         |
| `op5`     | `OperatorFunction`&lt;`D`, `E`&gt;                         |

##### Returns

`Observable`&lt;`E`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C, D, E, F>(
   op1,
   op2,
   op3,
   op4,
   op5,
   op6
): Observable<F>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:109

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-5"></a> `A` |
| <a id="type-parameter-b-4"></a> `B` |
| <a id="type-parameter-c-3"></a> `C` |
| <a id="type-parameter-d-2"></a> `D` |
| <a id="type-parameter-e-1"></a> `E` |
| <a id="type-parameter-f"></a> `F`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`     | `OperatorFunction`&lt;`B`, `C`&gt;                         |
| `op4`     | `OperatorFunction`&lt;`C`, `D`&gt;                         |
| `op5`     | `OperatorFunction`&lt;`D`, `E`&gt;                         |
| `op6`     | `OperatorFunction`&lt;`E`, `F`&gt;                         |

##### Returns

`Observable`&lt;`F`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C, D, E, F, G>(
   op1,
   op2,
   op3,
   op4,
   op5,
   op6,
   op7
): Observable<G>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:110

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-6"></a> `A` |
| <a id="type-parameter-b-5"></a> `B` |
| <a id="type-parameter-c-4"></a> `C` |
| <a id="type-parameter-d-3"></a> `D` |
| <a id="type-parameter-e-2"></a> `E` |
| <a id="type-parameter-f-1"></a> `F` |
| <a id="type-parameter-g"></a> `G`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`     | `OperatorFunction`&lt;`B`, `C`&gt;                         |
| `op4`     | `OperatorFunction`&lt;`C`, `D`&gt;                         |
| `op5`     | `OperatorFunction`&lt;`D`, `E`&gt;                         |
| `op6`     | `OperatorFunction`&lt;`E`, `F`&gt;                         |
| `op7`     | `OperatorFunction`&lt;`F`, `G`&gt;                         |

##### Returns

`Observable`&lt;`G`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C, D, E, F, G, H>(
   op1,
   op2,
   op3,
   op4,
   op5,
   op6,
   op7,
   op8
): Observable<H>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:111

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-7"></a> `A` |
| <a id="type-parameter-b-6"></a> `B` |
| <a id="type-parameter-c-5"></a> `C` |
| <a id="type-parameter-d-4"></a> `D` |
| <a id="type-parameter-e-3"></a> `E` |
| <a id="type-parameter-f-2"></a> `F` |
| <a id="type-parameter-g-1"></a> `G` |
| <a id="type-parameter-h"></a> `H`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`     | `OperatorFunction`&lt;`B`, `C`&gt;                         |
| `op4`     | `OperatorFunction`&lt;`C`, `D`&gt;                         |
| `op5`     | `OperatorFunction`&lt;`D`, `E`&gt;                         |
| `op6`     | `OperatorFunction`&lt;`E`, `F`&gt;                         |
| `op7`     | `OperatorFunction`&lt;`F`, `G`&gt;                         |
| `op8`     | `OperatorFunction`&lt;`G`, `H`&gt;                         |

##### Returns

`Observable`&lt;`H`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C, D, E, F, G, H, I>(
   op1,
   op2,
   op3,
   op4,
   op5,
   op6,
   op7,
   op8,
   op9
): Observable<I>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:112

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-8"></a> `A` |
| <a id="type-parameter-b-7"></a> `B` |
| <a id="type-parameter-c-6"></a> `C` |
| <a id="type-parameter-d-5"></a> `D` |
| <a id="type-parameter-e-4"></a> `E` |
| <a id="type-parameter-f-3"></a> `F` |
| <a id="type-parameter-g-2"></a> `G` |
| <a id="type-parameter-h-1"></a> `H` |
| <a id="type-parameter-i"></a> `I`   |

##### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `op1`     | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`     | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`     | `OperatorFunction`&lt;`B`, `C`&gt;                         |
| `op4`     | `OperatorFunction`&lt;`C`, `D`&gt;                         |
| `op5`     | `OperatorFunction`&lt;`D`, `E`&gt;                         |
| `op6`     | `OperatorFunction`&lt;`E`, `F`&gt;                         |
| `op7`     | `OperatorFunction`&lt;`F`, `G`&gt;                         |
| `op8`     | `OperatorFunction`&lt;`G`, `H`&gt;                         |
| `op9`     | `OperatorFunction`&lt;`H`, `I`&gt;                         |

##### Returns

`Observable`&lt;`I`&gt;

##### Inherited from

`Observable.pipe`

#### Call Signature

```ts
pipe<A, B, C, D, E, F, G, H, I>(
   op1,
   op2,
   op3,
   op4,
   op5,
   op6,
   op7,
   op8,
   op9,
   ...operations
): Observable<unknown>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:113

##### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-a-9"></a> `A` |
| <a id="type-parameter-b-8"></a> `B` |
| <a id="type-parameter-c-7"></a> `C` |
| <a id="type-parameter-d-6"></a> `D` |
| <a id="type-parameter-e-5"></a> `E` |
| <a id="type-parameter-f-4"></a> `F` |
| <a id="type-parameter-g-3"></a> `G` |
| <a id="type-parameter-h-2"></a> `H` |
| <a id="type-parameter-i-1"></a> `I` |

##### Parameters

| Parameter       | Type                                                       |
| --------------- | ---------------------------------------------------------- |
| `op1`           | `OperatorFunction`&lt;`InstanceType`&lt;`T`&gt;[], `A`&gt; |
| `op2`           | `OperatorFunction`&lt;`A`, `B`&gt;                         |
| `op3`           | `OperatorFunction`&lt;`B`, `C`&gt;                         |
| `op4`           | `OperatorFunction`&lt;`C`, `D`&gt;                         |
| `op5`           | `OperatorFunction`&lt;`D`, `E`&gt;                         |
| `op6`           | `OperatorFunction`&lt;`E`, `F`&gt;                         |
| `op7`           | `OperatorFunction`&lt;`F`, `G`&gt;                         |
| `op8`           | `OperatorFunction`&lt;`G`, `H`&gt;                         |
| `op9`           | `OperatorFunction`&lt;`H`, `I`&gt;                         |
| ...`operations` | `OperatorFunction`&lt;`any`, `any`&gt;[]                   |

##### Returns

`Observable`&lt;`unknown`&gt;

##### Inherited from

`Observable.pipe`

---

### subscribe() \{#subscribe\}

#### Call Signature

```ts
subscribe(observerOrNext?): Subscription;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:43

##### Parameters

| Parameter         | Type                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `observerOrNext?` | \| `Partial`&lt;`Observer`&lt;`InstanceType`&lt;`T`&gt;[]&gt;&gt; \| ((`value`) => `void`) |

##### Returns

`Subscription`

##### Inherited from

`Observable.subscribe`

#### Call Signature

```ts
subscribe(
   next?,
   error?,
   complete?
): Subscription;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:45

##### Parameters

| Parameter   | Type                            |
| ----------- | ------------------------------- |
| `next?`     | ((`value`) => `void`) \| `null` |
| `error?`    | ((`error`) => `void`) \| `null` |
| `complete?` | (() => `void`) \| `null`        |

##### Returns

`Subscription`

##### Deprecated

Instead of passing separate callback arguments, use an observer argument. Signatures taking separate callback arguments will be removed in v8. Details: https://rxjs.dev/deprecations/subscribe-arguments

##### Inherited from

`Observable.subscribe`

---

### ~~toPromise()~~ \{#topromise\}

#### Call Signature

```ts
toPromise(): Promise<InstanceType<T>[] | undefined>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:115

##### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[] \| `undefined`&gt;

##### Deprecated

Replaced with firstValueFrom and lastValueFrom. Will be removed in v8. Details: https://rxjs.dev/deprecations/to-promise

##### Inherited from

`Observable.toPromise`

#### Call Signature

```ts
toPromise(PromiseCtor): Promise<InstanceType<T>[] | undefined>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:117

##### Parameters

| Parameter     | Type                 |
| ------------- | -------------------- |
| `PromiseCtor` | `PromiseConstructor` |

##### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[] \| `undefined`&gt;

##### Deprecated

Replaced with firstValueFrom and lastValueFrom. Will be removed in v8. Details: https://rxjs.dev/deprecations/to-promise

##### Inherited from

`Observable.toPromise`

#### Call Signature

```ts
toPromise(PromiseCtor): Promise<InstanceType<T>[] | undefined>;
```

Defined in: node\_modules/.pnpm/rxjs@7.8.2/node\_modules/rxjs/dist/types/internal/Observable.d.ts:119

##### Parameters

| Parameter     | Type                     |
| ------------- | ------------------------ |
| `PromiseCtor` | `PromiseConstructorLike` |

##### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[] \| `undefined`&gt;

##### Deprecated

Replaced with firstValueFrom and lastValueFrom. Will be removed in v8. Details: https://rxjs.dev/deprecations/to-promise

##### Inherited from

`Observable.toPromise`
