# rxdb-model

Framework-agnostic core library for the RxDB entity model: it derives all pure logic needed for forms, detail pages, editable tables, and the visual query builder from entity metadata (`EntityMetadata`), plus the VTable table runtime infrastructure.

## Positioning and boundaries

- **Single input source**: `EntityMetadata` produced by the entity decorator system of `@aiao/rxdb`.
- **Framework-agnostic**: this package has no Angular / React / Vue dependencies and can be consumed by any frontend stack; the three-framework UI component layer lives in `@aiao/rxdb-model-angular` (React / Vue versions to follow).
- **Boundary with `@aiao/rxdb`**: the core package's `entity-field.utils` (Field Descriptor field semantic metadata) and `entity-value.utils` (`parseEntityFieldValue`/`formatEntityFieldValue`/`validateFieldValue`, etc.) serve the core internals and plugin contracts; the same-named modules in this package target the "entity management UI" scenario (form field extraction, field value parsing/formatting/validation, table column construction). The semantics differ — do not mix them.
- **Table engine**: `@visactor/vtable` and `@visactor/vtable-editors` are peer dependencies (`~1.26.x`), provided by the consumer.
- **Headless entry**: `@aiao/rxdb-model/headless` only exports the state and actions for the form, query builder, list, detail, dialog, and QueryTable; it does not load VTable. The two VTable peers are optional in the package manifest. Install and use the root entry only when the default table display is needed.

## Module overview

| Directory                                                              | Responsibility                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Root `entity-field.utils` / `entity-value.utils` / `structural-equal`  | Field config extraction, field value parsing/formatting/validation, key-order-independent structured deep comparison |
| `entity-form/`                                                         | Metadata → form field config (create/edit/view modes), bidirectional entity/form data conversion (changed fields only), form validation |
| `entity-detail/`                                                       | Metadata → detail page tab structure (base form + one table tab per relation)                        |
| `entity-table/`                                                        | Editable table column construction, 15 VTable cell editors, clipboard / keyboard / theme / tooltip / drag-reorder runtime infrastructure |
| `query-builder/`                                                       | Visual query builder engine: state service, operator registry, query conversion, schema parsing, instant validation, field tree utilities |

## Usage

```ts
import { buildFormFields, buildEditableColumns, buildDetailTabs } from '@aiao/rxdb-model';

const fields = buildFormFields(metadata, 'create');
const columns = buildEditableColumns(metadata);
const tabs = buildDetailTabs(metadata);
```

When only state and actions are needed, import `createEntityFormController` from `@aiao/rxdb-model/headless`. This entry does not touch the DOM and does not load VTable; the consumer renders the field controls themselves. The controller's `snapshot`, `setField`, `discardInput`, `validate`, `submit`, `cancel`, and `dispose` form the stable form interaction contract. See Headless entity capabilities for complete three-framework integration examples.

Query builder (framework-agnostic service layer):

```ts
import { createQueryBuilderService, createSchemaFromEntity } from '@aiao/rxdb-model';

const qb = createQueryBuilderService<MyEntity>({ fields: createSchemaFromEntity(metadata) });
qb.state$.subscribe(state => console.log(state));
// The first argument is the target group ID; null means the root group
qb.addRule(null, { field: 'title', operator: 'contains', value: 'a' });
const rxdbQuery = qb.toRxDBQuery();
```

## Internationalization

`modelMessages` ships with a default `zh-Hans` catalog. When no i18n provider is supplied, components keep the original Chinese text, dates keep the hours/minutes/seconds from the original `toLocaleString()`, and numbers keep their original text format. Once a provider is explicitly connected, dates are formatted per locale with second precision, and plain numbers are grouped per locale. The English example catalog `modelEnMessages` is registered explicitly by the application:

```ts
import { I18n } from '@aiao/rxdb-i18n';
import { modelMessages, modelEnMessages, buildEditableColumns, buildDetailTabs } from '@aiao/rxdb-model';

const i18n = new I18n({
  defaultLocale: 'zh-Hans',
  deviceLocale: 'zh-Hans',
  catalogs: [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }]
});
const columns = buildEditableColumns(metadata, { i18n });
const tabs = buildDetailTabs(metadata, i18n);
await i18n.setLocale('en');
```

Angular / React / Vue components consume the corresponding `@aiao/rxdb-i18n-{angular,react,vue}` provider without passing the translation function down layer by layer. The imperative table receives the same runtime via the sixth argument of `createListTable`; already-open editors update their placeholders, hints, and current errors, and unsubscribe when editing ends.

Application catalogs use namespace=`rxdb-model` and the keys from the text inventory. In database mode, `i18n.setMessages({ locale: 'en', namespace: 'rxdb-model', messages: { 'common.save': 'Submit' } })` persists per-key overrides that remain effective after restart; uncovered keys fall back to Chinese along the fallback chain. Existing options such as `actionsTitle` always take precedence over the catalog.

Entity, field, and relation display names can be declared with stable keys in the same `rxdb-model` namespace: `entity.assets.Asset.displayName`, `entity.assets.Asset.property.name`, `entity.assets.Asset.relation.category`. Lists, filters, details, and already-open forms in all three frameworks update their labels when the catalog or language changes, preserving unsaved data. Keys with no declaration keep using the entity's original display name, and no missing-key diagnostics are recorded. `localizeEntityMetadata(metadata, runtime)` clones only the display metadata, keeping the original entity declarations, field names, default values, and record contents unchanged; `localizeEntityFormFields(metadata, fields, runtime)` can update labels of already-constructed form fields. A custom `ModelI18n` can implement the optional `resolve()` to enable this capability.

`FormFieldValidationError.reason` stores the source value for known constraint validation or input parsing failures. When the detail page switches languages, `refreshFormValidationResult(result, fields, runtime)` regenerates the error text, preserving unsaved data and the last valid value of controlled inputs; external errors without a source keep their original text.

## Development

```bash
pnpm nx test rxdb-model        # Vitest (node default environment; DOM cases switch to happy-dom via a file-header pragma)
pnpm nx build rxdb-model       # Vite library build (single ES format + dts)
```

RxDB Model - Core entity and data model definitions
Provides entity field handling, entity value handling, structural equality checks, and other basic capabilities

## Classes

| Class | Description |
| ------ | ------ |
| [CellTooltipManager](classes/CellTooltipManager.md) | Cell error tooltip lifecycle management |
| [DateEditor](classes/DateEditor.md) | Date-time picker editor |
| [EntityDetailController](classes/EntityDetailController.md) | Tabs, draft, save, and cancel state of the detail page. |
| [EntityDialogController](classes/EntityDialogController.md) | Connects the consumer's dialog shell with open, close, and result state. |
| [EntityFormController](classes/EntityFormController.md) | Shared state and actions of the form. |
| [EntityListController](classes/EntityListController.md) | Shared controller for list filtering, pagination, selection, and data state. |
| [EnumEditor](classes/EnumEditor.md) | Enum dropdown select editor |
| [GlobalOverlayEditor](classes/GlobalOverlayEditor.md) | Abstract base class for global overlay list editors |
| [~~IconListEditor~~](classes/IconListEditor.md) | Single-select list editor with icon + text support |
| [JsonEditor](classes/JsonEditor.md) | JSON / KeyValue editor |
| [KeyValueEditor](classes/KeyValueEditor.md) | KeyValue (`Record<string, unknown>`) editor — Schema mode only |
| [ListViewSettingsController](classes/ListViewSettingsController.md) | Popover positioning, pointer drag, and keyboard reorder for the list settings shared by all three frameworks. |
| [ModelEditorI18n](classes/ModelEditorI18n.md) | Manages translation and subscriptions of open DOM editors. |
| [MultiSelectEditor](classes/MultiSelectEditor.md) | Custom multi-select editor for VTable |
| [NumberEditor](classes/NumberEditor.md) | Number input editor |
| [OperatorRegistry](classes/OperatorRegistry.md) | Operator registry service — manages available operators and their metadata |
| [QueryBuilderController](classes/QueryBuilderController.md) | UI-free facade wrapper around an existing QueryBuilderService. |
| [QueryBuilderService](classes/QueryBuilderService.md) | QueryBuilder core service — RxJS-based reactive state management |
| [QueryConverter](classes/QueryConverter.md) | Query conversion service — handles bidirectional conversion between QueryBuilder state and RxDB queries |
| [QueryTableController](classes/QueryTableController.md) | Query, pagination, ordering, and selection state of QueryTable; rendering can be fully taken over by the consumer. |
| [RelationEditor](classes/RelationEditor.md) | Relation field search dropdown editor (oneToOne / manyToOne) |
| [SafeListEditor](classes/SafeListEditor.md) | Workaround for VTable `ListEditor` bug: `onEnd` throws TypeError when `element.parentNode` is null during keyboard-triggered cell navigation. |
| [SchemaParser](classes/SchemaParser.md) | Schema parsing service — converts RxDB EntityMetadata into field metadata usable by QueryBuilder |
| [TableClipboardManager](classes/TableClipboardManager.md) | Internal clipboard manager — wraps system clipboard API interaction + internal backup |
| [TagsEditor](classes/TagsEditor.md) | Tags (array) input editor |
| [ValidationService](classes/ValidationService.md) | Validation service — validates QueryBuilder rules and values |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [BatchChangeItem](interfaces/BatchChangeItem.md) | Batch change item |
| [BuildEditableColumnsOptions](interfaces/BuildEditableColumnsOptions.md) | Options for building editable columns |
| [CellChangeEvent](interfaces/CellChangeEvent.md) | Cell change event |
| [ClipboardCell](interfaces/ClipboardCell.md) | Clipboard snapshot of a single cell |
| [CSSVariables](interfaces/CSSVariables.md) | daisyUI theme CSS variable set |
| [DetailFormTab](interfaces/DetailFormTab.md) | Form tab config (displays the entity's basic information form) |
| [DetailTabBase](interfaces/DetailTabBase.md) | Base config for detail page tabs |
| [DetailTableTab](interfaces/DetailTableTab.md) | Table tab config (displays relation data of related entities) |
| [EntityCapabilities](interfaces/EntityCapabilities.md) | UI operations allowed for the entity on the public write entrances |
| [EntityCapabilityContext](interfaces/EntityCapabilityContext.md) | Instance-side context for [deriveEntityCapabilities](functions/deriveEntityCapabilities.md). |
| [EntityDetailControllerOptions](interfaces/EntityDetailControllerOptions.md) | Detail form input plus initial tab and open state. |
| [EntityDetailSnapshot](interfaces/EntityDetailSnapshot.md) | Snapshot of the detail page mode, tabs, form draft, and save lifecycle. |
| [EntityDialogControllerOptions](interfaces/EntityDialogControllerOptions.md) | Dialog initial data and open state. |
| [EntityDialogSnapshot](interfaces/EntityDialogSnapshot.md) | Dialog lifecycle state with no dependency on a popup implementation. |
| [EntityFieldConfig](interfaces/EntityFieldConfig.md) | Entity field config |
| [EntityFormControllerOptions](interfaces/EntityFormControllerOptions.md) | Inputs required to create a headless form. |
| [EntityFormData](interfaces/EntityFormData.md) | Form data (mapping of field names to field values) |
| [EntityFormFieldSnapshot](interfaces/EntityFormFieldSnapshot.md) | A single field's config, current value, errors, and display state. |
| [EntityFormSnapshot](interfaces/EntityFormSnapshot.md) | Form state snapshot; consumers can map it directly onto their own controls. |
| [EntityListControllerOptions](interfaces/EntityListControllerOptions.md) | List initial state, query data source, and persistence actions. |
| [EntityListLoadContext](interfaces/EntityListLoadContext.md) | Request context received by the query data source. |
| [EntityListLoadResult](interfaces/EntityListLoadResult.md) | List query result. |
| [EntityListSnapshot](interfaces/EntityListSnapshot.md) | List snapshot of the current query, pagination, selection, records, and capability constraints. |
| [EntityTableConfig](interfaces/EntityTableConfig.md) | Table config |
| [EntityTableHandle](interfaces/EntityTableHandle.md) | Command surface of the entity table: the same set of commands exposed by the `EntityTable` component in all three frameworks. |
| [EntityTableRecord](interfaces/EntityTableRecord.md) | Base interface for generic entity table records |
| [EnumItem](interfaces/EnumItem.md) | Enum option config |
| [FieldExtractorConfig](interfaces/FieldExtractorConfig.md) | Field extractor config |
| [FieldMetadata](interfaces/FieldMetadata.md) | Field metadata |
| [FieldTreeNode](interfaces/FieldTreeNode.md) | Field tree node (used by CascadeSelect) |
| [FieldValidationError](interfaces/FieldValidationError.md) | Field validation error |
| [FormFieldChangeEvent](interfaces/FormFieldChangeEvent.md) | Form field value change event |
| [FormFieldConfig](interfaces/FormFieldConfig.md) | Form field config |
| [FormFieldValidationError](interfaces/FormFieldValidationError.md) | Form field validation error |
| [FormValidationResult](interfaces/FormValidationResult.md) | Form validation result |
| [HeaderPositionChange](interfaces/HeaderPositionChange.md) | The part of the VTable `change_header_position` event payload used by this module |
| [HeaderSortClick](interfaces/HeaderSortClick.md) | State handed over by VTable when a column header sort is clicked |
| [~~IconLabeledItem~~](interfaces/IconLabeledItem.md) | List item with an icon |
| [KeyboardHandlerContext](interfaces/KeyboardHandlerContext.md) | Keyboard handling context — callbacks provided by the component |
| [KeyValueSchemaEntry](interfaces/KeyValueSchemaEntry.md) | Schema config for a single key in a key-value type field |
| [KVSchemaEntry](interfaces/KVSchemaEntry.md) | Property description of a single key in keyValue mode |
| [ListFixedQuery](interfaces/ListFixedQuery.md) | Fixed query of a list (passed in by the detail page relation tab); structure matches the query builder's rule group |
| [ListReorderState](interfaces/ListReorderState.md) | List state used when deciding whether the list can be reordered by dragging |
| [ListViewField](interfaces/ListViewField.md) | Configurable data field with query capability. |
| [ListViewSettingsControllerOptions](interfaces/ListViewSettingsControllerOptions.md) | Field order and reorder callbacks used by the list settings interaction controller. |
| [ListViewState](interfaces/ListViewState.md) | Field config, query ordering, and single-field grouping of the entity list. |
| [ModelI18n](interfaces/ModelI18n.md) | Translation runtime consumed by components. |
| [ModelInfo](interfaces/ModelInfo.md) | Model info interface |
| [MultiSelectOption](interfaces/MultiSelectOption.md) | Multi-select option: id + display name + optional color dot / disabled |
| [NumberEditorOptions](interfaces/NumberEditorOptions.md) | Optional behavior config of the number editor |
| [OperatorDefinition](interfaces/OperatorDefinition.md) | Operator definition — contains operator metadata and constraints |
| [OperatorRegistryOptions](interfaces/OperatorRegistryOptions.md) | Operator registry options |
| [PendingWrite](interfaces/PendingWrite.md) | Pending operation for clipboard/batch writes |
| [PropertyColumnConfig](interfaces/PropertyColumnConfig.md) | Config required to build a property column |
| [QueryBuilderConfig](interfaces/QueryBuilderConfig.md) | Query builder config |
| [QueryBuilderControllerOptions](interfaces/QueryBuilderControllerOptions.md) | Options for creating the query state machine. |
| [QueryBuilderRuleGroup](interfaces/QueryBuilderRuleGroup.md) | Rule group (reuses the RxDB RuleGroup type + UI metadata) |
| [QueryBuilderServiceOptions](interfaces/QueryBuilderServiceOptions.md) | QueryBuilderService options |
| [QueryBuilderSnapshot](interfaces/QueryBuilderSnapshot.md) | Query builder snapshot. |
| [QueryBuilderState](interfaces/QueryBuilderState.md) | Query builder state (simplified version, only the necessary fields) |
| [QueryConverterOptions](interfaces/QueryConverterOptions.md) | Conversion options |
| [QueryExample](interfaces/QueryExample.md) | Query example interface |
| [QueryTableControllerOptions](interfaces/QueryTableControllerOptions.md) | Initial list state and data source actions of the query table. |
| [QueryTableSnapshot](interfaces/QueryTableSnapshot.md) | Render-free snapshot of the query table reusing the list state. |
| [RelatedEntityItem](interfaces/RelatedEntityItem.md) | Related entity item |
| [RelatedEntityProvider](interfaces/RelatedEntityProvider.md) | Related entity data provider |
| [RowDeleteEvent](interfaces/RowDeleteEvent.md) | Row delete event |
| [RowMoveCommitHooks](interfaces/RowMoveCommitHooks.md) | Hooks that interact with the UI when a row drag-drop is persisted |
| [RowMoveEvent](interfaces/RowMoveEvent.md) | Result of a single row drag-drop: the dragged row and its neighbors around the drop point |
| [RowReorderEvent](interfaces/RowReorderEvent.md) | Row reorder event |
| [SchemaInfo](interfaces/SchemaInfo.md) | Schema info |
| [SchemaParserOptions](interfaces/SchemaParserOptions.md) | Parser config options |
| [UIRule](interfaces/UIRule.md) | UI rule (loose type, used internally by the query builder components) |
| [ValidationContext](interfaces/ValidationContext.md) | Validation context |
| [ValidationError](interfaces/ValidationError.md) | Validation error item |
| [ValidationResult](interfaces/ValidationResult.md) | Validation result |
| [ValidationRule](interfaces/ValidationRule.md) | Validation rule |
| [ValidationServiceOptions](interfaces/ValidationServiceOptions.md) | Validation service options |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ClipboardContent](type-aliases/ClipboardContent.md) | Clipboard content: row-major 2D array `[rowOffset][colOffset]` |
| [DetailTab](type-aliases/DetailTab.md) | Detail page tab config |
| [DetailTabType](type-aliases/DetailTabType.md) | Detail page tab type |
| [EntityFieldType](type-aliases/EntityFieldType.md) | Entity field type |
| [EntityFormEvent](type-aliases/EntityFormEvent.md) | Reason for a form state change. |
| [EntityFormSubmitResult](type-aliases/EntityFormSubmitResult.md) | Form submission result. |
| [EntityFormValidationEvent](type-aliases/EntityFormValidationEvent.md) | Event for validation completion (including a passed validation). |
| [EntityInstance](type-aliases/EntityInstance.md) | RxDB entity instance (used for CRUD operations). |
| [EntityListEvent](type-aliases/EntityListEvent.md) | Event emitted when a list action happens or the data source advances state. |
| [EntityListInput](type-aliases/EntityListInput.md) | Inputs the list can update with the host, synced via `syncInput`; `load` and the write callbacks are read only at construction. |
| [FilterQuery](type-aliases/FilterQuery.md) | Filter query structure (AND-merged with the user's filter criteria). |
| [FormMode](type-aliases/FormMode.md) | Form mode |
| [IconData](type-aliases/IconData.md) | Lucide icon data — array of [tagName, attributes] tuples |
| [ManualOrderListMetadata](type-aliases/ManualOrderListMetadata.md) | Entity metadata needed to decide list ordering |
| [OperatorName](type-aliases/OperatorName.md) | All operators |
| [PropertyType](type-aliases/PropertyType.md) | Property type |
| [PropertyTypeString](type-aliases/PropertyTypeString.md) | String literal of entity property types — one-to-one with the `PropertyType` enum values of `@aiao/rxdb`, plus relation types and computed properties |
| [QueryBuilderEvent](type-aliases/QueryBuilderEvent.md) | Event for changes to query state, field metadata, or validation results. |
| [QueryBuilderOperator](type-aliases/QueryBuilderOperator.md) | Operator type (reuses the RxDB definition directly) |
| [QueryBuilderRule](type-aliases/QueryBuilderRule.md) | Query rule (reuses the RxDB Rule type + UI metadata) |
| [QueryTableHandle](type-aliases/QueryTableHandle.md) | Command surface of the query table: members are the same as [EntityTableHandle](interfaces/EntityTableHandle.md), all delegated to the inner entity table. |
| [RecordDeletePredicate](type-aliases/RecordDeletePredicate.md) | Decides whether a row can be deleted; called per row by `actionsColumn` |
| [RelatedItemsProviderFactory](type-aliases/RelatedItemsProviderFactory.md) | Factory for related-entity candidate providers: returns a provider function from the foreign key field and related entity name |
| [Rule](type-aliases/Rule.md) | Query rule |
| [RuleGroup](type-aliases/RuleGroup.md) | Query rule group (auto-computed type) |
| [SwitchDisableCallback](type-aliases/SwitchDisableCallback.md) | Switch disabled state predicate callback |
| [TagsMode](type-aliases/TagsMode.md) | Tags editor mode: 'string' string tags / 'number' number tags |
| [ValidationGroupInput](type-aliases/ValidationGroupInput.md) | Validation rule group input (loose recursive structure) |

## Variables

| Variable | Description |
| ------ | ------ |
| [BUILTIN\_VALIDATION\_RULES](variables/BUILTIN_VALIDATION_RULES.md) | Built-in validation rules |
| [createEntityDetailHeadless](variables/createEntityDetailHeadless.md) | Headless alias of the detail controller factory. |
| [createEntityDialogHeadless](variables/createEntityDialogHeadless.md) | Headless alias of the dialog controller factory. |
| [createEntityFormHeadless](variables/createEntityFormHeadless.md) | Factory alias aligned with the other framework bindings. |
| [createEntityListHeadless](variables/createEntityListHeadless.md) | Headless alias of the entity list controller factory. |
| [createQueryBuilderHeadless](variables/createQueryBuilderHeadless.md) | Headless alias of the query builder controller factory. |
| [createQueryTableHeadless](variables/createQueryTableHeadless.md) | Headless alias of the query table controller factory. |
| [DAISY\_COLORS](variables/DAISY_COLORS.md) | daisyUI v5 theme color references (CSS variables, theme-adaptive) |
| [DEFAULT\_COLUMN\_SIZES](variables/DEFAULT_COLUMN_SIZES.md) | Default column width and min/max width per property type |
| [DEFAULT\_OPERATORS](variables/DEFAULT_OPERATORS.md) | Default operator definition list |
| [defaultModelI18n](variables/defaultModelI18n.md) | Static Chinese catalog used when no runtime is provided. |
| [DELETE\_COLOR](variables/DELETE_COLOR.md) | Default color of the delete icon |
| [disabledEditorForReadonly](variables/disabledEditorForReadonly.md) | Non-editable rows: disable the editor |
| [DISPLAY\_ONLY\_FIELDS](variables/DISPLAY_ONLY_FIELDS.md) | Display-only (non-editable) system fields |
| [modelEnMessages](variables/modelEnMessages.md) | Built-in English catalog of the components. |
| [modelMessages](variables/modelMessages.md) | Component catalog distributed with the package; applications can override key by key. |
| [modelZhHansMessages](variables/modelZhHansMessages.md) | Built-in Chinese catalog of the components, preserving the existing default text. |
| [ROW\_SERIES\_COL\_OFFSET](variables/ROW_SERIES_COL_OFFSET.md) | The VTable rowSeriesNumber column occupies col=0; data columns start at col=1. Subtract this offset when mapping VTable column indexes to the columns array index. |
| [SKIP\_FIELDS](variables/SKIP_FIELDS.md) | System fields skipped (not shown as separate columns) |
| [switchDisabledForReadonly](variables/switchDisabledForReadonly.md) | Disable the switch: read-only rows cannot be operated on |
| [UUID\_RE](variables/UUID_RE.md) | Regular expression validating the UUID string format (case-insensitive) |

## Functions

| Function | Description |
| ------ | ------ |
| [\_resetEditorRegistry](functions/resetEditorRegistry.md) | Resets the editor registration state (test use only) |
| [actionsColumn](functions/actionsColumn.md) | Actions column: optionally includes view and delete buttons |
| [applyClipboard](functions/applyClipboard.md) | Collects pending write operations from the internal clipboard (matched by column position, Excel-like behavior). cellType must match; when rows/columns are insufficient, reuse cyclically. Skips read-only rows, new rows, and non-writable columns (column-level read-only, system / selection / actions columns); if the target column defines menuList, values outside the enum range are skipped. |
| [applyListViewColumns](functions/applyListViewColumns.md) | Applies field order and visibility, pinning the positions of the selection and actions columns. |
| [applyPopoverPosition](functions/applyPopoverPosition.md) | Applies the result of calcPopoverPosition directly to the popover DOM element. |
| [applySystemText](functions/applySystemText.md) | Collects pending write operations from system clipboard text (TSV). Boolean columns automatically convert text to booleans (true/1/yes/是 → true, false/0/no/否/empty → false); unrecognized values are skipped; enum columns skip values not in menuList; when rows/columns are insufficient, reuse cyclically. Skips read-only rows, new rows, and non-writable columns (column-level read-only, system / selection / actions columns). |
| [buildDetailTabs](functions/buildDetailTabs.md) | Builds the detail page tab list from entity metadata |
| [buildEditableColumns](functions/buildEditableColumns.md) | Builds editable VTable column definitions from EntityMetadata |
| [buildFieldTree](functions/buildFieldTree.md) | Converts a flat field list into a tree structure |
| [buildFormFields](functions/buildFormFields.md) | Builds the form field list from entity metadata and the form mode |
| [buildListViewOrderBy](functions/buildListViewOrderBy.md) | Constructs the database cursor ordering; grouped fields take priority, and the unique key guarantees stable pagination. |
| [buildListViewRecords](functions/buildListViewRecords.md) | Normalizes unfilled grouping fields to null, preventing VTable from dropping undefined grouped records. |
| [buildListViewTableOptions](functions/buildListViewTableOptions.md) | Constructs collapsible grouping and loaded record counts without passing the current page count off as the full count. |
| [buildPropertyColumn](functions/buildPropertyColumn.md) | Builds a VTable ColumnDefine from the property type config |
| [buildTableOptions](functions/buildTableOptions.md) | Builds ListTable initialization options |
| [calcPopoverPosition](functions/calcPopoverPosition.md) | Calculates the popover position relative to the trigger element, preferring to show below and flipping upward when space is insufficient. |
| [canReorderEntityList](functions/canReorderEntityList.md) | Whether the entity list currently allows drag reordering |
| [changeCellValue](functions/changeCellValue.md) | Writes back a cell value (without triggering edit events) |
| [cloneStructured](functions/cloneStructured.md) | Deep-clones structured values in model state, preserving dates, byte sequences, and circular references. |
| [cn](functions/cn.md) | Concatenates CSS class names (a thin wrapper over clsx). |
| [collectDeleteWrites](functions/collectDeleteWrites.md) | Collects the write list of cells that Delete/Backspace must clear from the selection. Skips read-only rows, new rows, and non-writable columns (column-level read-only, system / selection / actions columns); non-writable boolean columns also stay out of boolCells, so a switch is not flipped off without an actual write. |
| [collectReorderedIds](functions/collectReorderedIds.md) | Collects the IDs of non-read-only rows after drag reordering |
| [commitRowMove](functions/commitRowMove.md) | Coordinates persisting a single row drag-drop |
| [completeTableEdit](functions/completeTableEdit.md) | Completes the current cell edit |
| [computeTooltipPosition](functions/computeTooltipPosition.md) | Computes the absolute position of the tooltip on the page |
| [createDefaultFormData](functions/createDefaultFormData.md) | Creates default form data from the field config |
| [createEntityDetailController](functions/createEntityDetailController.md) | Creates a controller for the shared form draft and detail lifecycle. |
| [createEntityDialogController](functions/createEntityDialogController.md) | Creates a lifecycle controller independent of a specific popup implementation. |
| [createEntityFormController](functions/createEntityFormController.md) | Factory entry for creating the form state machine. |
| [createEntityListController](functions/createEntityListController.md) | Creates an entity list controller with no presentation-layer dependency. |
| [createFieldNodeMap](functions/createFieldNodeMap.md) | Creates the field-name-to-node mapping |
| [createListTable](functions/createListTable.md) | Creates a VTable ListTable instance |
| [createListViewState](functions/createListViewState.md) | Creates an independent initial list view state. |
| [createOperatorRegistry](functions/createOperatorRegistry.md) | Factory function that creates an OperatorRegistry instance |
| [createQueryBuilderController](functions/createQueryBuilderController.md) | Creates a headless controller reusing an existing query service. |
| [createQueryBuilderService](functions/createQueryBuilderService.md) | Factory function that creates a QueryBuilderService instance |
| [createQueryConverter](functions/createQueryConverter.md) | Factory function that creates a QueryConverter instance |
| [createQueryTableController](functions/createQueryTableController.md) | Creates a query table controller without assembling VTable. |
| [createSchemaFromEntities](functions/createSchemaFromEntities.md) | Creates field metadata in bulk from multiple EntityMetadata |
| [createSchemaFromEntity](functions/createSchemaFromEntity.md) | Creates field metadata from EntityMetadata |
| [createSchemaParser](functions/createSchemaParser.md) | Factory function that creates a SchemaParser instance |
| [createTheme](functions/createTheme.md) | Builds a VTable theme from daisyUI CSS variables |
| [createValidationService](functions/createValidationService.md) | Factory function that creates a ValidationService instance |
| [defaultListOrderBy](functions/defaultListOrderBy.md) | Cursor ordering used when the list is not sorted by a column |
| [deriveEntityCapabilities](functions/deriveEntityCapabilities.md) | Derives UI capabilities from entity metadata |
| [describeHistoryBarrier](functions/describeHistoryBarrier.md) | Description shown when the undo / redo buttons are disabled. |
| [ensureBaseEditorRegistered](functions/ensureBaseEditorRegistered.md) | Registers the VTable base editors (global singleton; repeated calls register only once) |
| [entityToFormData](functions/entityToFormData.md) | Converts an entity object into form data |
| [extractEntityFields](functions/extractEntityFields.md) | Extracts all business field configs from entity metadata |
| [extractFieldsFromMetadata](functions/extractFieldsFromMetadata.md) | Extracts fields from EntityMetadata (supports recursive relations) |
| [extractKeyValueFields](functions/extractKeyValueFields.md) | Extracts the sub-field list from the properties of a keyValue property |
| [extractRelationTargetFields](functions/extractRelationTargetFields.md) | Extracts fields of the relation target entity (used by EXISTS subqueries) |
| [extractSystemFields](functions/extractSystemFields.md) | Extracts system field configs from entity metadata |
| [filterVisibleFields](functions/filterVisibleFields.md) | Filters out fields marked as hidden |
| [findNodeByValue](functions/findNodeByValue.md) | Finds a node in the tree |
| [findOptionLabel](functions/findOptionLabel.md) | Finds the matching item's label in the popover option list. |
| [flattenFieldTree](functions/flattenFieldTree.md) | Flattens the field tree into an option list |
| [formatAsTsv](functions/formatAsTsv.md) | Serializes ClipboardContent into a TSV string |
| [formatDateToYmd](functions/formatDateToYmd.md) | Formats a date as a YYYY-MM-DD string. |
| [formatDateValue](functions/formatDateValue.md) | Formats a date value as a localized string |
| [formatEntityFieldValue](functions/formatEntityFieldValue.md) | Formats a field value into a display string |
| [formDataToEntityChanges](functions/formDataToEntityChanges.md) | Computes the change set of form data relative to the original entity object |
| [generateId](functions/generateId.md) | Generates a unique ID for identifying QueryBuilder rules and rule groups |
| [getCellRecord](functions/getCellRecord.md) | Safely obtains the current row record via VTable callback arguments |
| [getCSSVariables](functions/getCSSVariables.md) | Reads daisyUI theme colors from CSS custom properties |
| [getCSSVariableValue](functions/getCSSVariableValue.md) | Reads a single CSS variable value, falling back to the default when empty |
| [getDefaultColors](functions/getDefaultColors.md) | Returns the default color set |
| [getDefaultOperatorRegistry](functions/getDefaultOperatorRegistry.md) | Gets the default operator registry |
| [getDefaultValueForType](functions/getDefaultValueForType.md) | Returns the default value for the given input control type. |
| [getDisplayNamePath](functions/getDisplayNamePath.md) | Gets the full displayName path |
| [getDocumentRootStyle](functions/getDocumentRootStyle.md) | Gets the computed style of the document root element |
| [getInputType](functions/getInputType.md) | Determines the input control type for the query condition value from the field type and operator. |
| [getListViewFields](functions/getListViewFields.md) | Extracts configurable fields from table columns, excluding the actions and selection columns. |
| [getOperatorsForType](functions/getOperatorsForType.md) | Gets the applicable operators for a field type |
| [getOptionGroupChildren](functions/getOptionGroupChildren.md) | Gets the optionGroupChildren config of CascadeSelect |
| [getRelationIgnoreKeys](functions/getRelationIgnoreKeys.md) | Gets the keys a relation must ignore (to avoid circular references) |
| [getTableContainer](functions/getTableContainer.md) | Gets the table DOM container element |
| [handleTableKeydown](functions/handleTableKeydown.md) | Keydown event handling of the table container — clipboard shortcuts + boolean toggle + delete. Clipboard shortcuts and the delete key are not intercepted while editing. |
| [isDocumentDarkMode](functions/isDocumentDarkMode.md) | Checks whether the current document is in dark mode |
| [isReadonly](functions/isReadonly.md) | Checks whether a record is a read-only row |
| [isReadonlyOrAddRow](functions/isReadonlyOrAddRow.md) | Checks whether a record is a read-only row or a new template row |
| [isRowDragEnabled](functions/isRowDragEnabled.md) | Whether the table currently allows row dragging |
| [isRule](functions/isRule.md) | Type guard: checks whether something is a rule |
| [isRuleGroup](functions/isRuleGroup.md) | Type guard: checks whether something is a rule group |
| [isTableEditing](functions/isTableEditing.md) | Checks whether the table is currently editing |
| [localizeEntityFormFields](functions/localizeEntityFormFields.md) | Updates the display labels in an open form, preserving the field config and the caller's data state. |
| [localizeEntityMetadata](functions/localizeEntityMetadata.md) | Clones the display metadata and resolves entity, property, and relation text; the original entity declarations and storage contract stay unchanged. |
| [lucideToSvgElement](functions/lucideToSvgElement.md) | Converts `LucideIconData` into an inline SVG element (constructed via DOM APIs, immune to markup injection) |
| [makeDeleteIcons](functions/makeDeleteIcons.md) | Generates icon options for the delete button (SVG icon + text label) |
| [makeEditorForReadonly](functions/makeEditorForReadonly.md) | Builds an editor function: non-read-only rows use the given editor name, read-only rows return undefined |
| [makeViewIcons](functions/makeViewIcons.md) | Generates icon options for the view button (SVG only, to avoid text stretching the remaining width) |
| [mapPropertyType](functions/mapPropertyType.md) | Maps PropertyType to the FieldMetadata type |
| [modelText](functions/modelText.md) | Reads the component catalog; the configured catalog takes priority. |
| [moveListViewItem](functions/moveListViewItem.md) | Moves a field or ordering rule, preserving the original order when crossing boundaries. |
| [normalizeKVSchemaEntryType](functions/normalizeKVSchemaEntryType.md) | Normalizes an entity property type to a keyValue Schema value type |
| [observeDocumentTheme](functions/observeDocumentTheme.md) | Observes document theme changes: the root node's `data-theme`, the inline `style` (runtime overrides for the primary color / border radius are written here), and system light/dark changes when there is no explicit `data-theme`. |
| [organizeFields](functions/organizeFields.md) | Groups and orders fields |
| [parseCommaSeparatedInput](functions/parseCommaSeparatedInput.md) | Parses a comma-separated string into an array. Returns a number array when fieldType is 'number', otherwise a string array. |
| [parseEntityFieldValue](functions/parseEntityFieldValue.md) | Parses a raw value into the target value of the given field type |
| [parseEntityFieldValueStrict](functions/parseEntityFieldValueStrict.md) | Strictly parses form input; returns a structured reason on failure, and the caller must not overwrite the original input. |
| [parsePropertyColumnValue](functions/parsePropertyColumnValue.md) | Parses the string value entered by the input-editor back to the property's original type |
| [parseYmdToLocalDate](functions/parseYmdToLocalDate.md) | Parses a YYYY-MM-DD string into a Date in the local timezone. |
| [patchDragIconForReadonlyRows](functions/patchDragIconForReadonlyRows.md) | HACK: VTable provides no API to disable dragging for specific rows, so internal properties are monkey-patched |
| [pinsSingleOrderDomain](functions/pinsSingleOrderDomain.md) | Whether the pinned query pins exactly one complete ordering domain |
| [positionOverlayPanel](functions/positionOverlayPanel.md) | Positions the overlay panel below the cell (flips above when space is insufficient) |
| [readRowMove](functions/readRowMove.md) | Reads the dragged row and drop-point neighbors from a single row drag-drop |
| [refocusTable](functions/refocusTable.md) | Returns focus to the VTable root element after editing ends (the .vtable div with tabindex=0 = ctx.container = table.getElement()), so arrow-key navigation keeps working |
| [refreshFormValidationResult](functions/refreshFormValidationResult.md) | Replays displayed validation errors with the current field labels and language, preserving the original input on parse failures. |
| [registerEditor](functions/registerEditor.md) | Registers a custom editor |
| [restoreTableRecords](functions/restoreTableRecords.md) | Restores table rows to the order of the most recent commit |
| [scheduleEditorSetup](functions/scheduleEditorSetup.md) | Defers editor initialization (registers outside-click listener + focus) to avoid VTable event interference |
| [setCellSwitchState](functions/setCellSwitchState.md) | Sets the visual state of a switch/checkbox/radio cell |
| [setRowDragEnabled](functions/setRowDragEnabled.md) | Toggles the table's row drag handle at runtime |
| [setTableI18n](functions/setTableI18n.md) | Binds the component runtime to a table instance; editors read it from their owning table. |
| [snapshotSelection](functions/snapshotSelection.md) | Snapshots the current VTable selection as clipboard content. |
| [sortFormFields](functions/sortFormFields.md) | Sorts fields by their order in ascending order |
| [structuralEqual](functions/structuralEqual.md) | Structured deep comparison, replacing JSON.stringify comparison. Recursively compares objects and arrays without depending on key serialization order. Supports circular reference detection to avoid infinite recursion. |
| [syncHeaderSortIcon](functions/syncHeaderSortIcon.md) | Syncs the column header sort icon without performing client-side sorting |
| [updateTableRecords](functions/updateTableRecords.md) | Updates table data and restores column widths (matched by field name, tolerating column additions/removals) |
| [validateEntityFieldValue](functions/validateEntityFieldValue.md) | Validates whether a single field value satisfies the field config constraints |
| [validateField](functions/validateField.md) | Validates a single form field value |
| [validateForm](functions/validateForm.md) | Validates the whole form data |
