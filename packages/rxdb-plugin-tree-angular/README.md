# @aiao/rxdb-plugin-tree-angular

[`@aiao/rxdb-plugin-tree`](../rxdb-plugin-tree) 的 Angular 集成层。把四个树查询接到 Angular signal。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-tree @aiao/rxdb-angular @aiao/rxdb-plugin-tree-angular @angular/core rxjs
```

## 用法

```typescript
import { Component, input } from '@angular/core';
import { useCountDescendants, useFindDescendants } from '@aiao/rxdb-plugin-tree-angular';

@Component({
  selector: 'app-category-tree',
  template: `
    @if (children.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    } @else {
      <h2>共 {{ total.value() }} 个后代</h2>
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

四个函数必须在注入上下文里调用（字段初始化器或 `runInInjectionContext`）。它们依赖插件注册的 `TreeRepository`，应用必须先 `rxdb.use(rxDBPluginTree)` 再 `init()`。

## API

| 函数                  | 仓储方法           | 结果类型                          | 默认值 |
| --------------------- | ------------------ | --------------------------------- | ------ |
| `useFindDescendants`  | `findDescendants`  | `RxDBResource<InstanceType<T>[]>` | `[]`   |
| `useCountDescendants` | `countDescendants` | `RxDBResource<number>`            | `0`    |
| `useFindAncestors`    | `findAncestors`    | `RxDBResource<InstanceType<T>[]>` | `[]`   |
| `useCountAncestors`   | `countAncestors`   | `RxDBResource<number>`            | `0`    |

都是 [`useRepositoryQuery`](../rxdb-angular) 的薄包装：只决定「查哪个仓储方法、默认值是什么」，订阅与销毁全部由 `@aiao/rxdb-angular` 负责。`RxDBResource` 的每个字段都是 signal，读值要带括号。

泛型收紧到 `TreeEntityType`：实例不满足 `ITreeEntity`（缺 `createdAt` / `updatedAt`）的实体在编译期就被拒。

三框架同功能对称：React 见 [`@aiao/rxdb-plugin-tree-react`](../rxdb-plugin-tree-react)，Vue 见 [`@aiao/rxdb-plugin-tree-vue`](../rxdb-plugin-tree-vue)。

## 迁移

这四个函数曾由 `@aiao/rxdb-angular` 导出。改从本包取，见 [tree-split 迁移说明](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md)。

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
