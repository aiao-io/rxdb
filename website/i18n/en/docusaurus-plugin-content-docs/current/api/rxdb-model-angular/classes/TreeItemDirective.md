# TreeItemDirective

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L59)

Tree node directive implementing the CDK Highlightable interface

Used for the active styles when ActiveDescendantKeyManager drives keyboard navigation.
`exportAs: 'rxdbTreeItem'` allows templates to access the instance via `#ref="rxdbTreeItem"`.

## Implements

- `Highlightable`

## Constructors

### Constructor

```ts
new TreeItemDirective(): TreeItemDirective;
```

#### Returns

`TreeItemDirective`

## Properties

### isActive \{#isactive\}

```ts
readonly isActive: Signal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L61)

## Methods

### setActiveStyles() \{#setactivestyles\}

```ts
setActiveStyles(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L63)

Applies the styles for an active item to this item.

#### Returns

`void`

#### Implementation of

`Highlightable.setActiveStyles`

***

### setInactiveStyles() \{#setinactivestyles\}

```ts
setInactiveStyles(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/tree-select/tree-select.component.ts#L67)

Applies the styles for an inactive item to this item.

#### Returns

`void`

#### Implementation of

`Highlightable.setInactiveStyles`
