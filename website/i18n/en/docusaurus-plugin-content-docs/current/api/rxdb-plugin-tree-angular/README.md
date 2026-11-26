# rxdb-plugin-tree-angular

The Angular integration layer for [`@aiao/rxdb-plugin-tree`](../rxdb-plugin-tree/README.md). Wires the four tree queries into Angular signals.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-tree @aiao/rxdb-angular @aiao/rxdb-plugin-tree-angular @angular/core rxjs
```

## Usage

```typescript
import { Component, input } from '@angular/core';
import { useCountDescendants, useFindDescendants } from '@aiao/rxdb-plugin-tree-angular';

@Component({
  selector: 'app-category-tree',
  template: `
    @if (children.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    } @else {
      <h2>{{ total.value() }} descendants total</h2>
      <ul>
        @for (node of children.value(); track node.id) {
          <li>{{ node.name }}</li>
        }
      </ul>
    }
  `
})
export class CategoryTreeComponent {
  readonly rootId = input.required<string>();

  protected readonly children = useFindDescendants(Category, () => ({ entityId: this.rootId(), level: 1 }));
  protected readonly total = useCountDescendants(Category, () => ({ entityId: this.rootId() }));
}
```

The four functions must be called in an injection context (a field initializer or `runInInjectionContext`). They depend on the `TreeRepository` registered by the plugin; the application must call `rxdb.use(rxDBPluginTree)` and then `init()`.

## API

| Function              | Repository method  | Result type                      | Default |
| --------------------- | ------------------ | --------------------------------- | ------- |
| `useFindDescendants`  | `findDescendants`  | `RxDBResource<InstanceType<T>[]>` | `[]`    |
| `useCountDescendants` | `countDescendants` | `RxDBResource<number>`            | `0`     |
| `useFindAncestors`    | `findAncestors`    | `RxDBResource<InstanceType<T>[]>` | `[]`    |
| `useCountAncestors`   | `countAncestors`   | `RxDBResource<number>`            | `0`     |

All four are thin wrappers around [`useRepositoryQuery`](../rxdb-angular/README.md): they only decide "which repository method to query and what the default value is"; subscription and destruction are entirely handled by `@aiao/rxdb-angular`. Every field of `RxDBResource` is a signal, so read values with parentheses.

The generics are narrowed to `TreeEntityType`: entities whose instances do not satisfy `ITreeEntity` (missing `createdAt` / `updatedAt`) are rejected at compile time.

Symmetric functionality across the three frameworks: see [`@aiao/rxdb-plugin-tree-react`](../rxdb-plugin-tree-react/README.md) for React and [`@aiao/rxdb-plugin-tree-vue`](../rxdb-plugin-tree-vue/README.md) for Vue.

## Migration

These four functions used to be exported by `@aiao/rxdb-angular`. Import them from this package instead; see the [tree-split migration notes](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md).

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-tree-angular - Angular integration layer

Provides the four functions `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`,
wiring the tree queries registered by `@aiao/rxdb-plugin-tree` into Angular signals.
Naming is consistent with the React / Vue binding layers.

## Remarks

These four functions depend on the `TreeRepository` registered by the plugin; the application must call `rxdb.use(rxDBPluginTree)` first.

## Functions

| Function | Description |
| ------ | ------ |
| [useCountAncestors](functions/useCountAncestors.md) | Counts the ancestors in the tree structure |
| [useCountDescendants](functions/useCountDescendants.md) | Counts the descendants in the tree structure |
| [useFindAncestors](functions/useFindAncestors.md) | Finds all ancestor entities in the tree structure |
| [useFindDescendants](functions/useFindDescendants.md) | Finds all descendant entities in the tree structure |
