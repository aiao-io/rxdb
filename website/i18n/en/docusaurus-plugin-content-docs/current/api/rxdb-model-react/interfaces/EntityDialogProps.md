# EntityDialogProps

Defined in: [packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx#L24)

Props of [EntityDialog](../functions/EntityDialog.md).

## Properties

### children? \{#children\}

```ts
children?: ReactNode;
```

Defined in: [packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx#L28)

Projected content.

---

### onCloseRequested? \{#oncloserequested\}

```ts
onCloseRequested?: () => void;
```

Defined in: [packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx#L30)

Close request (triggered by the title bar close button; mask clicks / Escape close the dialog directly and do not go through here — consistent with CDK).

#### Returns

`void`

---

### title \{#title\}

```ts
title: string;
```

Defined in: [packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx#L26)

Dialog title.
