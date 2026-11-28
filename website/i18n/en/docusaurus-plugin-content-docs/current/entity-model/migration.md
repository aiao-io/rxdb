# Migration notes

## Migrating from the enterprise packages

The open-source `@aiao/rxdb-model` / `@aiao/rxdb-model-angular` are ported from the enterprise packages of the same name; the React / Vue bindings (`@aiao/rxdb-model-react` / `@aiao/rxdb-model-vue`) are the symmetric three-framework delivery of the same component set. Migration notes:

- **Icon library**: uses the repository-standard icon package (lucide icon data), replacing the enterprise package's old dependency; the icon data format is unchanged.
- **Table engine**: keeps the enterprise technical choice of VTable, pinned to the 1.26.x series, provided by consumers as a peer dependency.
- **Styling strategy**: the consumer styling pipeline is Tailwind + daisyUI class names; the component packages do not publish compiled CSS (see [Styling](styling.md)). The enterprise packages' old style artifacts no longer apply.
- **Copy**: UI and error copy stays in Chinese; if internationalization is needed later, it is a separate project.

`rxdb-model` is a projection layer over entity metadata (forms / details / tables / query builder); it introduces no new collections or schema and needs no data migration.

## Action column delete predicate

The third argument of `actionsColumn` gains a **required** `canDelete` parameter (a breaking change); the previous third argument, the view label, moves to the fourth position:

```typescript
// Before
actionsColumn(title: string, deleteLabel: string, viewLabel?: string): ColumnDefine;

// After
actionsColumn(title: string, deleteLabel: string, canDelete: RecordDeletePredicate, viewLabel?: string): ColumnDefine;
```

Old two-argument and three-argument calls fail at compile time with TS2554 / TS2345; apps that only use the action column through `EntityList` or `buildEditableColumns` are unaffected. See [Migration guide: action column delete predicate](../migration/actions-column-can-delete.md) for the full background, the per-entity-permission approach, and per-row predicate examples.

## Entity operation permission model (US-027)

An entity's write permissions are split into three independent capabilities — create / update / delete (each `both` or `system`) — and the UI behavior derives from them:

- `create: 'system'`: the list offers no "+ New" button;
- `update: 'system'`: rows degrade to read-only, "View" opens the detail in view mode, deletion still possible (when `delete` allows it);
- `delete: 'system'`: the action column shows no "Delete", rows stay editable.

Consumers that maintain `actionsColumn` calls or custom action columns across versions should derive `canDelete` with `deriveEntityCapabilities(metadata)` to stay consistent with `EntityList`'s internal decision; for an entity whose `delete` is declared with a rule (US-029), derive it per row with `deriveRowCapabilities(metadata, record, { grants: rxdb.grants.snapshot })`.
