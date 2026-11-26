# EntityDetailController

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L32)

Tabs, draft, save, and cancel state of the detail page.

## Constructors

### Constructor

```ts
new EntityDetailController(options): EntityDetailController;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L52)

#### Parameters

| Parameter | Type                                                                              |
| --------- | --------------------------------------------------------------------------------- |
| `options` | [`EntityDetailControllerOptions`](../interfaces/EntityDetailControllerOptions.md) |

#### Returns

`EntityDetailController`

## Properties

### form \{#form\}

```ts
readonly form: EntityFormController;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L45)

The shared form controller used by the same detail instance.

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): EntityDetailSnapshot;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L48)

Reads the current state of the detail page.

##### Returns

[`EntityDetailSnapshot`](../interfaces/EntityDetailSnapshot.md)

## Methods

### cancel() \{#cancel\}

```ts
cancel(): void;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L88)

Restores the most recent host input and invalidates the old session that is still saving.

#### Returns

`void`

---

### close() \{#close\}

```ts
close(): void;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L140)

Closes the current detail session so that a late save cannot close a later session.

#### Returns

`void`

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L154)

Releases the form subscriptions and resources, preventing late tasks from updating.

#### Returns

`void`

---

### open() \{#open\}

```ts
open(): void;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L147)

Opens a new detail session.

#### Returns

`void`

---

### save() \{#save\}

```ts
save(onSave?): Promise<EntityFormSubmitResult>;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L95)

Persists the current draft; re-entrant calls, stale sessions, and late results after disposal are never written back to the UI.

#### Parameters

| Parameter | Type                                            |
| --------- | ----------------------------------------------- |
| `onSave?` | (`result`) => `void` \| `Promise`&lt;`void`&gt; |

#### Returns

`Promise`&lt;[`EntityFormSubmitResult`](../type-aliases/EntityFormSubmitResult.md)&gt;

---

### selectTab() \{#selecttab\}

```ts
selectTab(key): void;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L71)

Activates a declared tab; an unknown key throws.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`void`

---

### setField() \{#setfield\}

```ts
setField(field, value):
  | {
  event: FormFieldChangeEvent;
  ok: true;
}
  | {
  ok: false;
  result: FormValidationResult;
};
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L78)

Modifies a field following the form's strict parsing and read-only constraints.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `field`   | `string`  |
| `value`   | `unknown` |

#### Returns

\| \{
`event`: [`FormFieldChangeEvent`](../interfaces/FormFieldChangeEvent.md);
`ok`: `true`;
\}
\| \{
`ok`: `false`;
`result`: [`FormValidationResult`](../interfaces/FormValidationResult.md);
\}

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L65)

Subscribes to detail state events and returns an unsubscribe function.

#### Parameters

| Parameter  | Type             |
| ---------- | ---------------- |
| `listener` | `DetailListener` |

#### Returns

() => `void`

---

### validate() \{#validate\}

```ts
validate(): FormValidationResult;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L83)

Validates the current draft and syncs field errors.

#### Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)
