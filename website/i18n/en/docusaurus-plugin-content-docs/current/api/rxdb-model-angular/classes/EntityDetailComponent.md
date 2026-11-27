# EntityDetailComponent

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L98)

Tabbed entity detail component: a base form tab + one table tab per one-to-many/many-to-many relation;
create mode first builds an in-memory draft entity, which is persisted only after validation passes and it is saved;
edit mode loads the instance from the Repository by `entityId` (route input or DIALOG_DATA) and persists internally on save.
The entity list embedded in a relation tab can in turn open child entity detail dialogs (nesting), with cycles blocked by `editChain`.

## Constructors

### Constructor

```ts
new EntityDetailComponent(): EntityDetailComponent;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:369](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L369)

#### Returns

`EntityDetailComponent`

## Properties

### activeRelationName \{#activerelationname\}

```ts
readonly activeRelationName: Signal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:293](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L293)

The relationName of the currently active relation tab (used to register relations for child entities)

---

### activeTab \{#activetab\}

```ts
readonly activeTab: Signal<DetailTab | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:316](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L316)

---

### activeTabKey \{#activetabkey\}

```ts
readonly activeTabKey: WritableSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:311](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L311)

---

### creationChain \{#creationchain\}

```ts
readonly creationChain: Signal<string[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L280)

Creation chain: the current entity + the ancestor chain, passed to the child entity-list to block circular creation (the ancestor chain input takes priority, falling back to DIALOG_DATA)

---

### creationChainInput \{#creationchaininput\}

```ts
readonly creationChainInput: InputSignal<string[] | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L245)

Input of the ancestor creation chain (entity types `namespace:name`), used to block circular creation.

#### Remarks

The binding name is `creationChain`, aligned with the same-named prop in React / Vue; the same-named class member `creationChain`
is the effective chain after appending the current entity (public since main), so the input is declared under an alias.

---

### delegateSave \{#delegatesave\}

```ts
readonly delegateSave: InputSignal<boolean | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L237)

Delegated save: does not create a draft entity, only emits formSubmitted for the caller to handle

---

### dialogTitle \{#dialogtitle\}

```ts
readonly dialogTitle: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L272)

Dialog title

---

### draftEntitySignal \{#draftentitysignal\}

```ts
readonly draftEntitySignal: WritableSignal<EntityInstance | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L259)

Exposes the draft entity to the template (needed by the entity-list of relation tabs)

---

### draftFormData \{#draftformdata\}

```ts
readonly draftFormData: WritableSignal<EntityFormData>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L256)

Current form edit data (tracks user input in create mode)

---

### editChain \{#editchain\}

```ts
readonly editChain: Signal<string[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:290](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L290)

Stack of record ids of open detail dialogs (input takes priority, falling back to DIALOG_DATA, including the current record); the relation tab lists use this to block infinite nesting

---

### editChainInput \{#editchaininput\}

```ts
readonly editChainInput: InputSignal<string[] | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L231)

Input of the stack of record ids (including the current record) of open detail dialogs.

#### Remarks

The binding name is `editChain`, aligned with the same-named prop in React / Vue; the same-named class member `editChain`
is the effective value after merging the input with DIALOG_DATA (public since main), so the input is declared under an alias.

---

### entityId \{#entityid\}

```ts
readonly entityId: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L213)

---

### fieldChanged \{#fieldchanged\}

```ts
readonly fieldChanged: OutputEmitterRef<FormFieldChangeEvent>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L249)

---

### fixedFormData \{#fixedformdata\}

```ts
readonly fixedFormData: InputSignal<EntityFormData | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L234)

Pre-filled foreign key data (not editable), used in cascading creation

---

### formCancelled \{#formcancelled\}

```ts
readonly formCancelled: OutputEmitterRef<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L248)

---

### formData \{#formdata\}

```ts
readonly formData: InputSignal<EntityFormData | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L221)

---

### formErrors \{#formerrors\}

```ts
readonly formErrors: WritableSignal<FormValidationResult | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:262](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L262)

Validation error panel: the validation result of the most recent submission (same semantics as React/Vue, US-104).

---

### formFields \{#formfields\}

```ts
readonly formFields: InputSignal<FormFieldConfig[] | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L220)

---

### formMode \{#formmode\}

```ts
readonly formMode: InputSignal<FormMode | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L222)

---

### formSubmitted \{#formsubmitted\}

```ts
readonly formSubmitted: OutputEmitterRef<EntityFormData>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L247)

---

### isCreateMode \{#iscreatemode\}

```ts
readonly isCreateMode: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L253)

Whether the external save mode is used (in create mode, the save/cancel buttons are below the tabs instead of inside the form)

---

### isEditPending \{#iseditpending\}

```ts
protected readonly isEditPending: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L206)

The edit target is not ready (the query has not emitted or has failed): blocks submission, hides the internal form actions, leaving only cancel below the tabs.
Without an injected database there is nothing to load from, and `entityId` only passes through with the form data, which does not count as pending.

---

### loadError \{#loaderror\}

```ts
protected readonly loadError: Signal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L200)

Reason for the load failure (the edit entity query errored): while the entity is not ready only cancel remains available, so the reason must be visible.

---

### metadata \{#metadata\}

```ts
readonly metadata: InputSignal<
  | Readonly<EntityMetadataType>
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L219)

---

### name \{#name\}

```ts
readonly name: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L212)

---

### namespace \{#namespace\}

```ts
readonly namespace: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L211)

---

### parentEntityForRelation \{#parententityforrelation\}

```ts
readonly parentEntityForRelation: Signal<EntityInstance | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L267)

Parent entity (draft or saved instance), used for the entity-list of relation tabs

---

### relatedEntityProvider \{#relatedentityprovider\}

```ts
readonly relatedEntityProvider: InputSignal<
  | RelatedEntityProvider
  | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L223)

---

### saveError \{#saveerror\}

```ts
readonly saveError: WritableSignal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:264](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L264)

Reason for the save failure (persistence errors other than validation errors).

---

### tabGroupName \{#tabgroupname\}

```ts
readonly tabGroupName: string;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L216)

Unique radio group name, avoiding radio conflicts between multiple EntityDetailComponent instances

---

### tabs \{#tabs\}

```ts
readonly tabs: Signal<DetailTab[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:298](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L298)

---

### validationErrors \{#validationerrors\}

```ts
readonly validationErrors: OutputEmitterRef<FormValidationResult>;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L250)

## Accessors

### delegateSaveValue \{#delegatesavevalue\}

#### Get Signature

```ts
get delegateSaveValue(): boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:358](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L358)

Whether saving is delegated (input takes priority, falling back to DIALOG_DATA)

##### Returns

`boolean`

---

### displayedFormErrors \{#displayedformerrors\}

#### Get Signature

```ts
get displayedFormErrors(): FormValidationResult | null;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:335](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L335)

##### Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md) \| `null`

---

### fixedFormDataValue \{#fixedformdatavalue\}

#### Get Signature

```ts
get fixedFormDataValue(): EntityFormData | undefined;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:353](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L353)

Pre-filled foreign key data (input takes priority, falling back to DIALOG_DATA)

##### Returns

[`EntityFormData`](../interfaces/EntityFormData.md) \| `undefined`

---

### formDataValue \{#formdatavalue\}

#### Get Signature

```ts
get formDataValue(): EntityFormData;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L340)

##### Returns

[`EntityFormData`](../interfaces/EntityFormData.md)

---

### formFieldsValue \{#formfieldsvalue\}

#### Get Signature

```ts
get formFieldsValue(): FormFieldConfig[];
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:326](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L326)

##### Returns

[`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]

---

### formModeValue \{#formmodevalue\}

#### Get Signature

```ts
get formModeValue(): FormMode;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:344](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L344)

##### Returns

[`FormMode`](../type-aliases/FormMode.md)

---

### metadataValue \{#metadatavalue\}

#### Get Signature

```ts
get metadataValue():
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:321](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L321)

##### Returns

\| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;
\| `undefined`

---

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:365](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L365)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

---

### relatedEntityProviderValue \{#relatedentityprovidervalue\}

#### Get Signature

```ts
get relatedEntityProviderValue():
  | RelatedEntityProvider
  | undefined;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L348)

##### Returns

\| [`RelatedEntityProvider`](../interfaces/RelatedEntityProvider.md)
\| `undefined`

---

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:362](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L362)

##### Returns

(`key`, `params?`) => `string`

## Methods

### buildFixedFormData() \{#buildfixedformdata\}

```ts
buildFixedFormData(tab): EntityFormData | undefined;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:519](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L519)

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `tab`     | [`DetailTableTab`](../interfaces/DetailTableTab.md) |

#### Returns

[`EntityFormData`](../interfaces/EntityFormData.md) \| `undefined`

---

### buildFixedQuery() \{#buildfixedquery\}

```ts
buildFixedQuery(tab):
  | {
  combinator: "and";
  rules: unknown[];
}
  | undefined;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:504](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L504)

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `tab`     | [`DetailTableTab`](../interfaces/DetailTableTab.md) |

#### Returns

\| \{
`combinator`: `"and"`;
`rules`: `unknown`[];
\}
\| `undefined`

---

### onCancel() \{#oncancel\}

```ts
onCancel(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:500](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L500)

#### Returns

`void`

---

### onFieldChanged() \{#onfieldchanged\}

```ts
onFieldChanged(event): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:450](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L450)

#### Parameters

| Parameter | Type                                                            |
| --------- | --------------------------------------------------------------- |
| `event`   | [`FormFieldChangeEvent`](../interfaces/FormFieldChangeEvent.md) |

#### Returns

`void`

---

### onFormCancelled() \{#onformcancelled\}

```ts
onFormCancelled(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:443](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L443)

#### Returns

`void`

---

### onFormDataChanged() \{#onformdatachanged\}

```ts
onFormDataChanged(data): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L407)

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `data`    | [`EntityFormData`](../interfaces/EntityFormData.md) |

#### Returns

`void`

---

### onFormSubmitted() \{#onformsubmitted\}

```ts
onFormSubmitted(data): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:411](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L411)

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `data`    | [`EntityFormData`](../interfaces/EntityFormData.md) |

#### Returns

`void`

---

### onSave() \{#onsave\}

```ts
onSave(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:466](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L466)

External save button (create mode)

#### Returns

`void`

---

### onValidationErrors() \{#onvalidationerrors\}

```ts
onValidationErrors(result): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:459](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L459)

#### Parameters

| Parameter | Type                                                            |
| --------- | --------------------------------------------------------------- |
| `result`  | [`FormValidationResult`](../interfaces/FormValidationResult.md) |

#### Returns

`void`

---

### selectTab() \{#selecttab\}

```ts
selectTab(key): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:390](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L390)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`void`
