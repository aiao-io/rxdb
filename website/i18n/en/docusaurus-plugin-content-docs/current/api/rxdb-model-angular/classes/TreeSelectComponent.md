# TreeSelectComponent

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L210)

Tree dropdown select component

## Description

Tree field selector based on the Popover API and `@angular/cdk/a11y`:

- Uses the native Popover API, so it is not clipped inside `overflow` containers
- Supports keyword filtering (automatically expands matching paths)
- Supports expanding/collapsing relation nodes
- Keyboard navigation: ↑↓ to move, → to expand, ← to collapse, Enter to select, Escape to close
- Uses the CDK `ActiveDescendantKeyManager` + `aria-activedescendant` to meet WAI-ARIA accessibility requirements

## Example

```html
<rxdb-tree-select
  (selectChange)="onFieldSelect($event)"
  [nodes]="fieldTree()"
  [selected]="selectedField()"
  placeholder="选择字段"
/>
```

## Constructors

### Constructor

```ts
new TreeSelectComponent(): TreeSelectComponent;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:287](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L287)

#### Returns

`TreeSelectComponent`

## Properties

### activeItemId \{#activeitemid\}

```ts
readonly activeItemId: Signal<string | null>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L273)

---

### ChevronDownIcon \{#chevrondownicon\}

```ts
protected readonly ChevronDownIcon: typeof LucideChevronDown;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L224)

---

### ChevronRightIcon \{#chevronrighticon\}

```ts
protected readonly ChevronRightIcon: typeof LucideChevronRight;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L225)

---

### defaultTypeColor \{#defaulttypecolor\}

```ts
protected readonly defaultTypeColor: "text-base-content/40" = 'text-base-content/40';
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L249)

---

### defaultTypeIcon \{#defaulttypeicon\}

```ts
protected readonly defaultTypeIcon: typeof LucideType = TypeIcon;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L248)

---

### displayValue \{#displayvalue\}

```ts
readonly displayValue: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L257)

---

### filterText \{#filtertext\}

```ts
protected readonly filterText: WritableSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L223)

---

### listId \{#listid\}

```ts
protected readonly listId: string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L222)

---

### minWidth \{#minwidth\}

```ts
readonly minWidth: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L254)

---

### nodes \{#nodes\}

```ts
readonly nodes: InputSignal<FieldTreeNode[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:251](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L251)

---

### placeholder \{#placeholder\}

```ts
readonly placeholder: InputSignal<string | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L253)

---

### selectChange \{#selectchange\}

```ts
readonly selectChange: OutputEmitterRef<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:255](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L255)

---

### selected \{#selected\}

```ts
readonly selected: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L252)

---

### selectedNode \{#selectednode\}

```ts
readonly selectedNode: Signal<FieldTreeNode | null | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:262](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L262)

---

### typeColorMap \{#typecolormap\}

```ts
protected readonly typeColorMap: Partial<Record<string, string>>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L237)

---

### typeIconMap \{#typeiconmap\}

```ts
protected readonly typeIconMap: Partial<Record<string, LucideIconInput>>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L226)

---

### uid \{#uid\}

```ts
protected readonly uid: string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L221)

---

### visibleItems \{#visibleitems\}

```ts
readonly visibleItems: Signal<FlatItem[]>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L267)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:283](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L283)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

---

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L280)

##### Returns

(`key`, `params?`) => `string`

## Methods

### onBeforeToggle() \{#onbeforetoggle\}

```ts
onBeforeToggle(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:308](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L308)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### onItemClick() \{#onitemclick\}

```ts
onItemClick(item): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:369](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L369)

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `item`    | `FlatItem` |

#### Returns

`void`

---

### onKeydown() \{#onkeydown\}

```ts
onKeydown(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:329](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L329)

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `KeyboardEvent` |

#### Returns

`void`

---

### onToggle() \{#ontoggle\}

```ts
onToggle(event): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L319)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### trackItem() \{#trackitem\}

```ts
protected trackItem(item): string;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:379](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L379)

Tracking function: uses value + isExistsOption to avoid duplicate keys

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `item`    | `FlatItem` |

#### Returns

`string`
