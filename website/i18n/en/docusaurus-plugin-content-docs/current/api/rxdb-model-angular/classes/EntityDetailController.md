# EntityDetailController

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:24

Tab, draft, save, and cancel state for the detail page.

## Constructors

### Constructor

```ts
new EntityDetailController(options): EntityDetailController;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:30

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

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:27

The shared form controller used by the same detail instance.

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): EntityDetailSnapshot;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:29

Reads the current state of the detail page.

##### Returns

[`EntityDetailSnapshot`](../interfaces/EntityDetailSnapshot.md)

## Methods

### cancel() \{#cancel\}

```ts
cancel(): void;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:40

Restores the most recent host input and invalidates the session that is being saved.

#### Returns

`void`

---

### close() \{#close\}

```ts
close(): void;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:46

Closes the current detail session so a late save cannot close a subsequent session.

#### Returns

`void`

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:50

Releases form subscriptions and resources, preventing late tasks from updating.

#### Returns

`void`

---

### open() \{#open\}

```ts
open(): void;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:48

Opens a new detail session.

#### Returns

`void`

---

### save() \{#save\}

```ts
save(onSave?): Promise<EntityFormSubmitResult>;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:42

Persists the current draft; late results from re-entry, expired sessions, and post-disposal never write back to the UI.

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

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:34

Activates a declared tab; an unknown key throws an error.

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

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:36

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

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:32

Subscribes to detail state events, returning the unsubscribe function.

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

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:38

Validates the current draft and syncs field errors.

#### Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)
