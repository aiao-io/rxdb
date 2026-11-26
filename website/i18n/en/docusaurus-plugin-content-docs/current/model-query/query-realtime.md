# Reactive queries

Subscribe once to receive the current result and subsequent changes. For example, an open-task counter can stay subscribed while a view is mounted. The query uses the `Todo` from [Getting Started](/getting-started/README.md).

```ts
const openCount$ = Todo.count({
  where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
});

const subscription = openCount$.subscribe(count => console.log('Open tasks:', count));
// When the view closes:
subscription.unsubscribe();
```

When a local write succeeds, RxDB processes the create, update, or remove event. For a simple count it can often adjust the total in memory. For a filtered page it may need to query the adapter again to determine which rows belong on that page. Leave result maintenance to RxDB.

Tree and graph queries also depend on relationships. Moving a tree node can change both its ancestor chain and descendant counts. Adding a graph edge can change which nodes are reachable or which path is shortest. A structural change can therefore require a fresh query even when the displayed node properties stay the same.

Use `firstValueFrom` when you only need the current result. For ongoing UI updates, the Angular, React, and Vue bindings manage the subscription with the view lifecycle. See [Querying entities](/model-query/README.md) and [Framework integration](/frameworks/README.md).
