# AdminPageDirective

Defined in: [rxdb-admin-angular/src/layout/admin-page.directive.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-page.directive.ts#L21)

Marks the page content of `AdminLayoutComponent` so "Refresh" can recreate it.

## Remarks

React rebuilds the content area with `key={refreshKey}`; Angular's `<ng-content>` projected content belongs to the parent view, so the layout cannot rebuild it.
Put the page content inside `*rxdbAdminPage`, and the layout instantiates it as a template: when `shell.ui.refresh()` increments the refresh counter,
the old instance is destroyed and a new one is created, so the components inside the page are recreated.

When projecting content directly without the directive, refresh only rebuilds the `.admin-page` container; **the projected content is not rebuilt**.

## Example

```html
<rxdb-admin-layout [menu]="menu" [url]="url()">
  <router-outlet *rxdbAdminPage />
</rxdb-admin-layout>
```

## Constructors

### Constructor

```ts
new AdminPageDirective(): AdminPageDirective;
```

#### Returns

`AdminPageDirective`

## Properties

### template \{#template\}

```ts
readonly template: TemplateRef<unknown>;
```

Defined in: [rxdb-admin-angular/src/layout/admin-page.directive.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/layout/admin-page.directive.ts#L23)

Template of the page content.
