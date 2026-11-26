# EntityListComponent

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L183)

Entity list component

Encapsulates the complete UI of the entity list: toolbar (display name, filter, undo/redo, create) + data table.
Locates the RxDB entity via the `namespace` and `name` inputs, implementing lazy-load pagination and CRUD operations.

## Example

```html
<rxdb-entity-list [namespace]="namespace()" [name]="name()" />
```

## Constructors

### Constructor

```ts
new EntityListComponent(): EntityListComponent;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:560](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L560)

#### Returns

`EntityListComponent`

## Properties

### $isFilterQuery \{#isfilterquery\}

```ts
readonly $isFilterQuery: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:432](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L432)

***

### alreadyLinkedIds \{#alreadylinkedids\}

```ts
readonly alreadyLinkedIds: InputSignal<Set<string>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:414](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L414)

The set of already-linked entity IDs (filtered out in selection mode, no longer shown)

***

### baseTableColumns \{#basetablecolumns\}

```ts
protected readonly baseTableColumns: Signal<ColumnsDefine>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L340)

***

### canRedo \{#canredo\}

```ts
readonly canRedo: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:474](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L474)

***

### canUndo \{#canundo\}

```ts
readonly canUndo: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:473](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L473)

***

### createFormFieldConfigs \{#createformfieldconfigs\}

```ts
readonly createFormFieldConfigs: Signal<FormFieldConfig[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:492](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L492)

***

### creationChain \{#creationchain\}

```ts
readonly creationChain: InputSignal<string[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:399](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L399)

Entity types in the creation chain (namespace:name), used to block circular creation

***

### deleteConfirmTpl \{#deleteconfirmtpl\}

```ts
readonly deleteConfirmTpl: Signal<TemplateRef<void> | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:511](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L511)

Delete confirmation popover template (accidental deletion is costly and the undo entry is not prominent).

***

### deleteError \{#deleteerror\}

```ts
readonly deleteError: WritableSignal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:513](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L513)

Reason the most recent delete was rejected by the storage layer (e.g. still referenced by other records); cleared on the next delete or entity switch, `null` means no error

***

### displayName \{#displayname\}

```ts
readonly displayName: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:446](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L446)

***

### draftParentEntity \{#draftparententity\}

```ts
readonly draftParentEntity: InputSignal<EntityInstance | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:393](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L393)

Draft parent entity (used in cascading creation, where the child entity registers to the parent entity via the relation API)

***

### editChain \{#editchain\}

```ts
readonly editChain: InputSignal<string[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:402](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L402)

Stack of record ids (including ancestor records) of open detail dialogs, checked before "view" to prevent infinite nesting

***

### filteredCount \{#filteredcount\}

```ts
readonly filteredCount: Signal<number>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:459](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L459)

***

### filterQuery \{#filterquery\}

```ts
readonly filterQuery: WritableSignal<FilterQuery>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:426](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L426)

***

### fixedFormData \{#fixedformdata\}

```ts
readonly fixedFormData: InputSignal<EntityFormData | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:390](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L390)

Pre-filled foreign key data (passed to the child entity dialog in cascading creation)

***

### fixedQuery \{#fixedquery\}

```ts
readonly fixedQuery: InputSignal<FilterQuery | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L384)

Fixed query conditions, AND-combined with the user filter conditions (used for relation property filtering, e.g. ownerId = currentId)

***

### Funnel \{#funnel\}

```ts
protected readonly Funnel: typeof LucideFunnel;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L315)

***

### initialFilter \{#initialfilter\}

```ts
readonly initialFilter: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:387](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L387)

Initial filter conditions passed in by external navigation (JSON string), e.g. Query Builder "apply to entity browsing"

***

### isBrowser \{#isbrowser\}

```ts
readonly isBrowser: boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:444](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L444)

***

### isCreateBlocked \{#iscreateblocked\}

```ts
readonly isCreateBlocked: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:454](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L454)

The current entity does not accept creation from the list: `create` allows only system writes, or it is already in an ancestor creation chain (circular creation detection)

***

### isInitialLoading \{#isinitialloading\}

```ts
readonly isInitialLoading: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:461](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L461)

***

### isLoadingMore \{#isloadingmore\}

```ts
readonly isLoadingMore: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:466](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L466)

***

### isM2m \{#ism2m\}

```ts
readonly isM2m: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:507](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L507)

***

### isQueryActive \{#isqueryactive\}

```ts
readonly isQueryActive: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:458](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L458)

***

### isSelectMode \{#isselectmode\}

```ts
readonly isSelectMode: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:506](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L506)

***

### listTableOptions \{#listtableoptions\}

```ts
protected readonly listTableOptions: Signal<Partial<ListTableConstructorOptions>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:351](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L351)

***

### loadMore \{#loadmore\}

```ts
protected readonly loadMore: Signal<(() => void) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L374)

***

### m2mAlreadyLinkedIds \{#m2malreadylinkedids\}

```ts
readonly m2mAlreadyLinkedIds: Signal<Set<string>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:545](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L545)

***

### m2mSelectTpl \{#m2mselecttpl\}

```ts
readonly m2mSelectTpl: Signal<TemplateRef<void> | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:509](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L509)

***

### mode \{#mode\}

```ts
readonly mode: InputSignal<"select" | "default">;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:411](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L411)

List mode: default=normal list, select=selection mode (with a checkbox column)

***

### name \{#name\}

```ts
readonly name: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:381](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L381)

***

### namespace \{#namespace\}

```ts
readonly namespace: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L380)

***

### overlayPositions \{#overlaypositions\}

```ts
protected readonly overlayPositions: (
  | {
  offsetY: number;
  originX: "end";
  originY: "bottom";
  overlayX: "end";
  overlayY: "top";
}
  | {
  offsetY: number;
  originX: "end";
  originY: "top";
  overlayX: "end";
  overlayY: "bottom";
})[];
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:357](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L357)

CDK Overlay positioning strategy: prefer right-aligned below, then right-aligned above

***

### parentEntity \{#parententity\}

```ts
readonly parentEntity: InputSignal<EntityInstance | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:408](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L408)

Parent entity instance (used for M2M relation operations, includes drafts and saved entities)

***

### parentRelationName \{#parentrelationname\}

```ts
readonly parentRelationName: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L396)

Name of the relation property on the parent entity (e.g. 'children'), used to call parent.children$.add(child)

***

### pendingQuery \{#pendingquery\}

```ts
readonly pendingQuery: WritableSignal<FilterQuery>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:436](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L436)

***

### pendingQueryValid \{#pendingqueryvalid\}

```ts
readonly pendingQueryValid: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:442](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L442)

***

### queryBuilderFields \{#querybuilderfields\}

```ts
readonly queryBuilderFields: Signal<FieldMetadata[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:484](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L484)

***

### Redo2 \{#redo2\}

```ts
protected readonly Redo2: typeof LucideRedo2;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:314](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L314)

***

### redoCount \{#redocount\}

```ts
readonly redoCount: Signal<number>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:472](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L472)

***

### redoHint \{#redohint\}

```ts
readonly redoHint: Signal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:480](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L480)

Explanation shown when the redo button is disabled, same as [undoHint](#undohint)

***

### relationKind \{#relationkind\}

```ts
readonly relationKind: InputSignal<RelationKind | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L405)

Relation type (MANY_TO_MANY enables selection mode)

***

### reorderError \{#reordererror\}

```ts
readonly reorderError: WritableSignal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:519](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L519)

Hint that the most recent drag-reorder persistence failed; `null` means no error

***

### rowDragEnabled \{#rowdragenabled\}

```ts
readonly rowDragEnabled: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:522](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L522)

Whether the current list allows drag reordering (whether the row drag handles are shown)

***

### saveToast \{#savetoast\}

```ts
readonly saveToast: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:515](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L515)

Save-success toast (auto-dismisses after 2 seconds).

***

### selectedCount \{#selectedcount\}

```ts
readonly selectedCount: Signal<number>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:543](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L543)

***

### selectedIds \{#selectedids\}

```ts
readonly selectedIds: WritableSignal<Set<string>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:542](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L542)

***

### selectionCancelled \{#selectioncancelled\}

```ts
readonly selectionCancelled: OutputEmitterRef<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:423](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L423)

Selection mode: fired when the selection is cancelled

***

### selectionConfirmed \{#selectionconfirmed\}

```ts
readonly selectionConfirmed: OutputEmitterRef<EntityInstance[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:420](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L420)

Selection mode: fired when the selection is confirmed, carrying the selected entity instances

***

### showFilterPopover \{#showfilterpopover\}

```ts
readonly showFilterPopover: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:434](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L434)

***

### sourceTableRecords \{#sourcetablerecords\}

```ts
protected readonly sourceTableRecords: Signal<EntityTableRecord[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:321](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L321)

***

### tableColumns \{#tablecolumns\}

```ts
readonly tableColumns: Signal<ColumnDefine[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:499](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L499)

***

### tableRecords \{#tablerecords\}

```ts
readonly tableRecords: Signal<EntityTableRecord[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:503](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L503)

***

### Undo2 \{#undo2\}

```ts
protected readonly Undo2: typeof LucideUndo2;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:313](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L313)

***

### undoCount \{#undocount\}

```ts
readonly undoCount: Signal<number>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:471](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L471)

***

### undoHint \{#undohint\}

```ts
readonly undoHint: Signal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:476](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L476)

Explanation shown when the undo button is disabled: the stack is stopped at the child-branch fork point (US-315); `null` when undo is possible or that is not the reason

***

### viewEntity \{#viewentity\}

```ts
readonly viewEntity: OutputEmitterRef<EntityTableRecord>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:417](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L417)

Fired when the "view" button is clicked, carrying the corresponding row record; the component also opens the built-in edit dialog (only emits when the record is already in editChain or is an unsaved draft)

***

### viewFields \{#viewfields\}

```ts
readonly viewFields: Signal<ListViewField[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:500](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L500)

***

### viewState \{#viewstate\}

```ts
protected readonly viewState: WritableSignal<ListViewState>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L317)

***

### X \{#x\}

```ts
protected readonly X: typeof LucideX;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:316](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L316)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:556](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L556)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

***

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:553](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L553)

##### Returns

(`key`, `params?`) => `string`

## Methods

### applyFilter() \{#applyfilter\}

```ts
applyFilter(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:607](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L607)

#### Returns

`void`

***

### cancelDelete() \{#canceldelete\}

```ts
cancelDelete(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:711](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L711)

#### Returns

`void`

***

### cancelSelection() \{#cancelselection\}

```ts
cancelSelection(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:829](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L829)

#### Returns

`void`

***

### confirmDelete() \{#confirmdelete\}

```ts
confirmDelete(): Promise<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:685](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L685)

Executes the delete from the confirmation popover (same path as the delete icon).

#### Returns

`Promise`&lt;`void`&gt;

***

### confirmSelection() \{#confirmselection\}

```ts
confirmSelection(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:819](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L819)

#### Returns

`void`

***

### m2mCancelSelection() \{#m2mcancelselection\}

```ts
m2mCancelSelection(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:815](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L815)

#### Returns

`void`

***

### onBatchUpdated() \{#onbatchupdated\}

```ts
onBatchUpdated(mutations): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:719](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L719)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mutations` | [`BatchChangeItem`](../interfaces/BatchChangeItem.md)[] |

#### Returns

`void`

***

### onCellChanged() \{#oncellchanged\}

```ts
onCellChanged(event): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:644](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L644)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`CellChangeEvent`](../interfaces/CellChangeEvent.md) |

#### Returns

`void`

***

### onIconClicked() \{#oniconclicked\}

```ts
onIconClicked(event): Promise<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:674](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L674)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `name`: `string`; `record`: [`EntityTableRecord`](../interfaces/EntityTableRecord.md); \} |
| `event.name` | `string` |
| `event.record` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### onKeydown() \{#onkeydown\}

```ts
onKeydown(e): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:618](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L618)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `KeyboardEvent` |

#### Returns

`void`

***

### onM2mSelectionConfirmed() \{#onm2mselectionconfirmed\}

```ts
onM2mSelectionConfirmed(entities): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:792](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L792)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | [`EntityInstance`](../type-aliases/EntityInstance.md)[] |

#### Returns

`void`

***

### onQueryChange() \{#onquerychange\}

```ts
onQueryChange(query): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:636](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L636)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | \| \{ `combinator`: `"and"` \| `"or"`; `rules`: `unknown`[]; \} \| `undefined` |

#### Returns

`void`

***

### onRowDeleted() \{#onrowdeleted\}

```ts
onRowDeleted(event): Promise<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:715](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L715)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### onRowMoved() \{#onrowmoved\}

```ts
onRowMoved(move): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:836](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L836)

Single row drag-and-drop: when allowed, persists the reorder by the on-screen neighbors; when not allowed or on failure, restores the table to the original order (US-028).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `move` | [`RowMoveEvent`](../interfaces/RowMoveEvent.md) |

#### Returns

`void`

***

### onSortClicked() \{#onsortclicked\}

```ts
onSortClicked(event): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:856](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L856)

Column header sort click: drives a cursor orderBy re-query (VTable client-side sorting is disabled).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `field`: `unknown`; `order`: `unknown`; \} |
| `event.field` | `unknown` |
| `event.order` | `unknown` |

#### Returns

`void`

***

### onValidationChange() \{#onvalidationchange\}

```ts
onValidationChange(result): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:640](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L640)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | [`ValidationResult`](../interfaces/ValidationResult.md) |

#### Returns

`void`

***

### onViewSettingsChange() \{#onviewsettingschange\}

```ts
onViewSettingsChange(value): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:849](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L849)

Applies the list view configuration and syncs the manual ordering constraints.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | [`ListViewState`](../interfaces/ListViewState.md) |

#### Returns

`void`

***

### openCreateDialog() \{#opencreatedialog\}

```ts
openCreateDialog(): Promise<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:726](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L726)

#### Returns

`Promise`&lt;`void`&gt;

***

### openM2mSelectDialog() \{#openm2mselectdialog\}

```ts
openM2mSelectDialog(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:773](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L773)

#### Returns

`void`

***

### redo() \{#redo\}

```ts
redo(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:670](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L670)

#### Returns

`void`

***

### resetFilter() \{#resetfilter\}

```ts
resetFilter(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:612](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L612)

#### Returns

`void`

***

### toggleFilterPopover() \{#togglefilterpopover\}

```ts
toggleFilterPopover(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:603](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L603)

#### Returns

`void`

***

### undo() \{#undo\}

```ts
undo(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-list/entity-list.component.ts:666](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts#L666)

#### Returns

`void`
