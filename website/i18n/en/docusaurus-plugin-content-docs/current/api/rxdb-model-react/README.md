# rxdb-model-react

## Headless bindings

Use `useEntityForm`, `useQueryBuilder`, `useEntityList`, `useEntityDetail`, `useEntityDialog`, and `useQueryTable` from `@aiao/rxdb-model-react/headless`. These hooks return `{ controller, snapshot }` backed by a stable external snapshot cache; the controller is kept in component state, so the same instance survives StrictMode replay, `<Activity>` hiding, and Fast Refresh teardown/re-creation of effects, and is reclaimed with the component on unmount. Updates to fields, mode, and relation candidates preserve the uncommitted draft; only a changed `data` / `entity` resets the inputs. Using only this entry point requires neither VTable nor Tailwind.

After the list switches query, ordering, or page, call `refresh()` to execute the data source; stale requests never write back. Batch deletion may partially succeed and reports failed items via `AggregateError.errors`; detail save rejects duplicate calls, and late results after cancel/close or an input switch never overwrite the new session. The default QueryBuilder, list, and detail do not yet fully reuse the new controllers; headless history/manual ordering and complete standalone UI examples remain to be done.

React component layer for [`@aiao/rxdb-model`](../rxdb-model/README.md): metadata-driven entity list, detail, form, dialog, editable table, and query builder.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-react @aiao/rxdb-model @aiao/rxdb-model-react @aiao/rxdb-plugin-history react rxjs @visactor/vtable lucide-react
```

## Usage

```tsx
import { EntityList } from '@aiao/rxdb-model-react';

<EntityList namespace="public" name="Todo" />;
```

When custom controls are needed, use `useEntityForm` / `useEntityFormHeadless` from `@aiao/rxdb-model-react/headless`. The hook returns a shared `controller` and `snapshot`, and consumers render the DOM themselves; subscriptions are released automatically on unmount, so Tailwind, daisyUI, or VTable are not required. For equivalent usage across the three frameworks, see Headless entity capabilities.

## Styling

Component styles (dialog / table / drag indicators, etc.) are bundled in `dist/index.css`; import once:

```ts
import '@aiao/rxdb-model-react/index.css';
```

Templates use daisyUI utility classes (`btn` / `tabs` / `menu` / `fieldset`, etc.),
and consumers import this library's scanning registration file from their Tailwind entry:

```css
@import '@aiao/rxdb-model-react/tailwind.css';
```

RxDB Model React - RxDB entity component library for the React platform
Provides React components for entity detail, dialog, form, list, table, and more

## Classes

| Class | Description |
| ------ | ------ |
| [CellTooltipManager](classes/CellTooltipManager.md) | Lifecycle management for cell error tooltips |
| [DateEditor](classes/DateEditor.md) | Date-time picker editor |
| [EntityDetailController](classes/EntityDetailController.md) | Tab, draft, save, and cancel state for the detail page. |
| [EntityDialogController](classes/EntityDialogController.md) | Open, close, and result state connecting to the consumer's dialog shell. |
| [EntityFormController](classes/EntityFormController.md) | Shared state and actions for the form. |
| [EntityListController](classes/EntityListController.md) | Shared controller for list filtering, pagination, selection, and data state. |
| [EnumEditor](classes/EnumEditor.md) | Enum dropdown select editor |
| [GlobalOverlayEditor](classes/GlobalOverlayEditor.md) | Abstract base class for global overlay list editors |
| [~~IconListEditor~~](classes/IconListEditor.md) | Single-select list editor supporting icon + text |
| [JsonEditor](classes/JsonEditor.md) | JSON / KeyValue editor |
| [KeyValueEditor](classes/KeyValueEditor.md) | KeyValue (`Record<string, unknown>`) editor — Schema mode only |
| [ListViewSettingsController](classes/ListViewSettingsController.md) | Positioning of the list-settings popover, pointer dragging, and keyboard reordering shared across the three frameworks. |
| [ModelEditorI18n](classes/ModelEditorI18n.md) | Manages translations and subscriptions for open DOM editors. |
| [MultiSelectEditor](classes/MultiSelectEditor.md) | VTable custom multi-select editor |
| [NumberEditor](classes/NumberEditor.md) | Numeric input editor |
| [OperatorRegistry](classes/OperatorRegistry.md) | Operator registry service. Manages available operators and their metadata |
| [QueryBuilderController](classes/QueryBuilderController.md) | UI-free facade wrapping the existing QueryBuilderService. |
| [QueryBuilderService](classes/QueryBuilderService.md) | QueryBuilder core service. RxJS-based reactive state management |
| [QueryConverter](classes/QueryConverter.md) | Query conversion service. Bidirectional conversion between QueryBuilder state and RxDB queries |
| [QueryDragDropHandler](classes/QueryDragDropHandler.md) | Drag state manager (same class as the Angular side; signal → subscription model, consumed on the React side via useSyncExternalStore). |
| [QueryTableController](classes/QueryTableController.md) | Query, pagination, ordering, and selection state for QueryTable; rendering can be fully taken over by the consumer. |
| [RelationEditor](classes/RelationEditor.md) | Search dropdown editor for relation fields (oneToOne / manyToOne) |
| [SafeListEditor](classes/SafeListEditor.md) | Workaround for VTable `ListEditor` bug: `onEnd` throws TypeError when `element.parentNode` is null during keyboard-triggered cell navigation. |
| [SchemaParser](classes/SchemaParser.md) | Schema parsing service. Converts RxDB EntityMetadata into field metadata usable by QueryBuilder |
| [TableClipboardManager](classes/TableClipboardManager.md) | Internal clipboard manager — wraps system clipboard API interaction + internal backup |
| [TagsEditor](classes/TagsEditor.md) | Tag (array) input editor |
| [TreeItemDirective](classes/TreeItemDirective.md) | Tree node highlight directive (the React equivalent of the Angular side's `TreeItemDirective`). |
| [ValidationService](classes/ValidationService.md) | Validation service. Validates QueryBuilder rules and values |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [BatchChangeItem](interfaces/BatchChangeItem.md) | Batch change item |
| [BuildEditableColumnsOptions](interfaces/BuildEditableColumnsOptions.md) | Options for building editable columns |
| [CellChangeEvent](interfaces/CellChangeEvent.md) | Cell change event |
| [ClipboardCell](interfaces/ClipboardCell.md) | Clipboard snapshot of a single cell |
| [CSSVariables](interfaces/CSSVariables.md) | daisyUI theme CSS variable collection |
| [DetailFormTab](interfaces/DetailFormTab.md) | Form tab configuration (displays the entity's basic information form) |
| [DetailTabBase](interfaces/DetailTabBase.md) | Base configuration for detail page tabs |
| [DetailTableTab](interfaces/DetailTableTab.md) | Table tab configuration (displays relation data of related entities) |
| [EntityCapabilities](interfaces/EntityCapabilities.md) | UI operations allowed on the entity's public write entry points |
| [EntityCapabilityContext](interfaces/EntityCapabilityContext.md) | Instance-side context for [deriveEntityCapabilities](variables/deriveEntityCapabilities.md). |
| [EntityDetailControllerOptions](interfaces/EntityDetailControllerOptions.md) | Detail form input plus initial tab and open state. |
| [EntityDetailDialogData](interfaces/EntityDetailDialogData.md) | Data structure passed into CDK Dialog (on the React side = EntityDetail's props). |
| [EntityDetailProps](interfaces/EntityDetailProps.md) | Props of [EntityDetail](functions/EntityDetail.md) (dialog data + route input + event callbacks). |
| [EntityDetailSnapshot](interfaces/EntityDetailSnapshot.md) | Snapshot of detail page mode, tab, form draft, and save lifecycle. |
| [EntityDialogControllerOptions](interfaces/EntityDialogControllerOptions.md) | Dialog initial data and open state. |
| [EntityDialogProps](interfaces/EntityDialogProps.md) | Props of [EntityDialog](functions/EntityDialog.md). |
| [EntityDialogSnapshot](interfaces/EntityDialogSnapshot.md) | Dialog lifecycle state with no dependency on a popup implementation. |
| [EntityFieldConfig](interfaces/EntityFieldConfig.md) | Entity field configuration |
| [EntityFormControllerOptions](interfaces/EntityFormControllerOptions.md) | Inputs required to create a headless form. |
| [EntityFormData](interfaces/EntityFormData.md) | Form data (mapping from field names to field values) |
| [EntityFormFieldSnapshot](interfaces/EntityFormFieldSnapshot.md) | Configuration, current value, errors, and display state of a single field. |
| [EntityFormProps](interfaces/EntityFormProps.md) | Props of [EntityForm](functions/EntityForm.md). |
| [EntityFormSnapshot](interfaces/EntityFormSnapshot.md) | Form state snapshot that consumers can map directly onto their own controls. |
| [EntityListControllerOptions](interfaces/EntityListControllerOptions.md) | List initial state, query data source, and persistence actions. |
| [EntityListLoadContext](interfaces/EntityListLoadContext.md) | Request context received by the query data source. |
| [EntityListLoadResult](interfaces/EntityListLoadResult.md) | List query result. |
| [EntityListProps](interfaces/EntityListProps.md) | Props of [EntityList](functions/EntityList.md). |
| [EntityListSnapshot](interfaces/EntityListSnapshot.md) | List snapshot of current query, pagination, selection, records, and capability constraints. |
| [EntityTableConfig](interfaces/EntityTableConfig.md) | Table configuration |
| [EntityTableHandle](interfaces/EntityTableHandle.md) | Command surface of the entity table: the same set of commands exposed by the `EntityTable` component in all three frameworks. |
| [EntityTableProps](interfaces/EntityTableProps.md) | Props of [EntityTable](variables/EntityTable.md). |
| [EntityTableRecord](interfaces/EntityTableRecord.md) | Base interface for generic entity table records |
| [EnumItem](interfaces/EnumItem.md) | Enum option configuration |
| [FieldExtractorConfig](interfaces/FieldExtractorConfig.md) | Field extractor configuration |
| [FieldMetadata](interfaces/FieldMetadata.md) | Field metadata |
| [FieldSelectorProps](interfaces/FieldSelectorProps.md) | Props of [FieldSelector](functions/FieldSelector.md). |
| [FieldTreeNode](interfaces/FieldTreeNode.md) | Field tree node (used by CascadeSelect) |
| [FieldValidationError](interfaces/FieldValidationError.md) | Field validation error |
| [FormFieldChangeEvent](interfaces/FormFieldChangeEvent.md) | Form field value change event |
| [FormFieldConfig](interfaces/FormFieldConfig.md) | Form field configuration |
| [FormFieldValidationError](interfaces/FormFieldValidationError.md) | Form field validation error |
| [FormValidationResult](interfaces/FormValidationResult.md) | Form validation result |
| [HeaderPositionChange](interfaces/HeaderPositionChange.md) | The parts of VTable's `change_header_position` event parameters used by this module |
| [HeaderSortClick](interfaces/HeaderSortClick.md) | State handed over by VTable when a header sort click occurs |
| [~~IconLabeledItem~~](interfaces/IconLabeledItem.md) | List item with an icon |
| [KeyboardHandlerContext](interfaces/KeyboardHandlerContext.md) | Keyboard handling context — callbacks provided by the component |
| [KeyValueSchemaEntry](interfaces/KeyValueSchemaEntry.md) | Schema configuration of a single key in a key-value type field |
| [KVSchemaEntry](interfaces/KVSchemaEntry.md) | Property description of a single key in keyValue mode |
| [ListFixedQuery](interfaces/ListFixedQuery.md) | Fixed query for a list (passed in by the detail page's relation tab); same structure as the query builder's rule group |
| [ListReorderState](interfaces/ListReorderState.md) | List state used to determine whether drag reordering is allowed |
| [ListViewField](interfaces/ListViewField.md) | Configurable data field and its query capabilities. |
| [ListViewSettingsControllerOptions](interfaces/ListViewSettingsControllerOptions.md) | Field ordering and reorder callback used by the list settings interaction controller. |
| [ListViewState](interfaces/ListViewState.md) | Field configuration, query ordering, and single-field grouping of an entity list. |
| [ModelI18n](interfaces/ModelI18n.md) | Translation runtime consumed by components. |
| [ModelInfo](interfaces/ModelInfo.md) | Model info interface |
| [MultiSelectOption](interfaces/MultiSelectOption.md) | Multi-select option: id + display name + optional color dot / disabled |
| [NumberEditorOptions](interfaces/NumberEditorOptions.md) | Optional behavior configuration for the number editor |
| [OperatorDefinition](interfaces/OperatorDefinition.md) | Operator definition including operator metadata and constraints |
| [OperatorRegistryOptions](interfaces/OperatorRegistryOptions.md) | Operator registry options |
| [OperatorSelectorProps](interfaces/OperatorSelectorProps.md) | Props of [OperatorSelector](functions/OperatorSelector.md). |
| [PendingWrite](interfaces/PendingWrite.md) | Pending operation for clipboard/batch writes |
| [PopoverSelectOption](interfaces/PopoverSelectOption.md) | Options of [PopoverSelect](functions/PopoverSelect.md). |
| [PopoverSelectProps](interfaces/PopoverSelectProps.md) | Props of [PopoverSelect](functions/PopoverSelect.md). |
| [PropertyColumnConfig](interfaces/PropertyColumnConfig.md) | Configuration required to build a property column |
| [QueryBuilderConfig](interfaces/QueryBuilderConfig.md) | Query builder configuration |
| [QueryBuilderControllerOptions](interfaces/QueryBuilderControllerOptions.md) | Options for creating the query state machine. |
| [QueryBuilderProps](interfaces/QueryBuilderProps.md) | Props of [QueryBuilder](functions/QueryBuilder.md). |
| [QueryBuilderRuleGroup](interfaces/QueryBuilderRuleGroup.md) | Rule group (reuses the RxDB RuleGroup type + UI metadata) |
| [QueryBuilderServiceOptions](interfaces/QueryBuilderServiceOptions.md) | QueryBuilderService options |
| [QueryBuilderSnapshot](interfaces/QueryBuilderSnapshot.md) | Query builder snapshot. |
| [QueryBuilderState](interfaces/QueryBuilderState.md) | Query builder state (simplified version containing only the necessary fields) |
| [QueryBuilderTheme](interfaces/QueryBuilderTheme.md) | QueryBuilder theme interface: defines component types for each UI slot, allowing replacement with a different UI library implementation. |
| [QueryBuilderThemeProviderProps](interfaces/QueryBuilderThemeProviderProps.md) | Props of [QueryBuilderThemeProvider](functions/QueryBuilderThemeProvider.md). |
| [QueryConverterOptions](interfaces/QueryConverterOptions.md) | Conversion options |
| [QueryDragDropState](interfaces/QueryDragDropState.md) | Drag state snapshot. |
| [QueryExample](interfaces/QueryExample.md) | Query example interface |
| [QueryGroupProps](interfaces/QueryGroupProps.md) | Props of [QueryGroup](functions/QueryGroup.md). |
| [QueryRuleProps](interfaces/QueryRuleProps.md) | Props of [QueryRule](functions/QueryRule.md). |
| [QueryTableControllerOptions](interfaces/QueryTableControllerOptions.md) | Initial list state and data source actions for the query table. |
| [QueryTableProps](interfaces/QueryTableProps.md) | Props of [QueryTable](variables/QueryTable.md). |
| [QueryTableSnapshot](interfaces/QueryTableSnapshot.md) | Render-free snapshot of the query table reusing list state. |
| [RelatedEntityItem](interfaces/RelatedEntityItem.md) | Related entity item |
| [RelatedEntityProvider](interfaces/RelatedEntityProvider.md) | Related entity data provider |
| [RowDeleteEvent](interfaces/RowDeleteEvent.md) | Row delete event |
| [RowMoveCommitHooks](interfaces/RowMoveCommitHooks.md) | Hooks for UI interaction when a row drag-drop is committed |
| [RowMoveEvent](interfaces/RowMoveEvent.md) | Result of a single row drag-drop: the dragged row and the neighbors before/after its drop position |
| [RowReorderEvent](interfaces/RowReorderEvent.md) | Row reorder event |
| [RxDBQueryOutput](interfaces/RxDBQueryOutput.md) | RxDB query output format. |
| [SchemaInfo](interfaces/SchemaInfo.md) | Schema info |
| [SchemaParserOptions](interfaces/SchemaParserOptions.md) | Parser configuration options |
| [SubqueryBuilderProps](interfaces/SubqueryBuilderProps.md) | Props of [SubqueryBuilder](functions/SubqueryBuilder.md). |
| [TreeSelectProps](interfaces/TreeSelectProps.md) | Props of [TreeSelect](functions/TreeSelect.md). |
| [UIRule](interfaces/UIRule.md) | UI rule (loose type used inside query builder components) |
| [UIRuleGroup](interfaces/UIRuleGroup.md) | UI rule group (loose type). |
| [UseEntityDetailResult](interfaces/UseEntityDetailResult.md) | Controller and reactive snapshot of UseEntityDetailResult. |
| [UseEntityDialogResult](interfaces/UseEntityDialogResult.md) | Controller and reactive snapshot of UseEntityDialogResult. |
| [UseEntityFormResult](interfaces/UseEntityFormResult.md) | React headless form return value. |
| [UseEntityListResult](interfaces/UseEntityListResult.md) | Controller and reactive snapshot of UseEntityListResult. |
| [UseQueryBuilderResult](interfaces/UseQueryBuilderResult.md) | Controller and reactive snapshot of UseQueryBuilderResult. |
| [UseQueryTableResult](interfaces/UseQueryTableResult.md) | Controller and reactive snapshot of UseQueryTableResult. |
| [ValidationContext](interfaces/ValidationContext.md) | Validation context |
| [ValidationError](interfaces/ValidationError.md) | Validation error item |
| [ValidationResult](interfaces/ValidationResult.md) | Validation result |
| [ValidationRule](interfaces/ValidationRule.md) | Validation rule |
| [ValidationServiceOptions](interfaces/ValidationServiceOptions.md) | Validation service options |
| [ValueInputProps](interfaces/ValueInputProps.md) | Props of [ValueInput](functions/ValueInput.md). |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ClipboardContent](type-aliases/ClipboardContent.md) | Clipboard content: row-major 2D array `[rowOffset][colOffset]` |
| [DetailTab](type-aliases/DetailTab.md) | Detail page tab configuration |
| [DetailTabType](type-aliases/DetailTabType.md) | Detail page tab type |
| [EntityFieldType](type-aliases/EntityFieldType.md) | Entity field type |
| [EntityFormEvent](type-aliases/EntityFormEvent.md) | Reason for a form state change. |
| [EntityFormSubmitResult](type-aliases/EntityFormSubmitResult.md) | Form submission result. |
| [EntityFormValidationEvent](type-aliases/EntityFormValidationEvent.md) | Event fired when validation completes (including when it passes). |
| [EntityInstance](type-aliases/EntityInstance.md) | RxDB entity instance (used for CRUD operations). |
| [EntityListEvent](type-aliases/EntityListEvent.md) | Event emitted when a list action or the data source advances state. |
| [EntityListInput](type-aliases/EntityListInput.md) | List inputs that can be updated by the host, synced via `syncInput`; `load` and write callbacks are read only at construction. |
| [FilterQuery](type-aliases/FilterQuery.md) | Filter query structure (AND-combined with the user's filter conditions). |
| [FormMode](type-aliases/FormMode.md) | Form mode |
| [IconData](type-aliases/IconData.md) | Lucide icon data — an array of [tagName, attributes] tuples |
| [ManualOrderListMetadata](type-aliases/ManualOrderListMetadata.md) | Entity metadata needed for list ordering decisions |
| [OperatorName](type-aliases/OperatorName.md) | All operators |
| [PropertyType](type-aliases/PropertyType.md) | Property type |
| [PropertyTypeString](type-aliases/PropertyTypeString.md) | Entity property type string literals. One-to-one with the `PropertyType` enum values of `@aiao/rxdb`, extended with relation types and computed properties |
| [QueryBuilderEvent](type-aliases/QueryBuilderEvent.md) | Change event for query state, field metadata, or validation results. |
| [QueryBuilderOperator](type-aliases/QueryBuilderOperator.md) | Operator type (reuses the RxDB definition directly) |
| [QueryBuilderRule](type-aliases/QueryBuilderRule.md) | Query rule (reuses the RxDB Rule type + UI metadata) |
| [QueryDropMode](type-aliases/QueryDropMode.md) | Drag-drop mode. |
| [QueryTableHandle](type-aliases/QueryTableHandle.md) | Command surface of the query table: members are the same as [EntityTableHandle](interfaces/EntityTableHandle.md), all delegated to the internal entity table. |
| [RecordDeletePredicate](type-aliases/RecordDeletePredicate.md) | Determines whether a row can be deleted; called per row by `actionsColumn` |
| [RelatedItemsProviderFactory](type-aliases/RelatedItemsProviderFactory.md) | Related entity candidate provider factory: returns a provider function based on the foreign key field and related entity name |
| [Rule](type-aliases/Rule.md) | Query rule |
| [RuleGroup](type-aliases/RuleGroup.md) | Query rule group (auto-computed type) |
| [SwitchDisableCallback](type-aliases/SwitchDisableCallback.md) | Callback for determining switch disabled state |
| [TagsMode](type-aliases/TagsMode.md) | Tag editor mode: 'string' string tags / 'number' numeric tags |
| [UIRuleWithWhere](type-aliases/UIRuleWithWhere.md) | Rule type with a where subquery. |
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
| [DEFAULT\_QUERY\_BUILDER\_THEME](variables/DEFAULT_QUERY_BUILDER_THEME.md) | Default theme (native HTML implementation). |
| [defaultModelI18n](variables/defaultModelI18n.md) | Static Chinese catalog used when no runtime is provided. |
| [DELETE\_COLOR](variables/DELETE_COLOR.md) | Default color of the delete icon |
| [deriveEntityCapabilities](variables/deriveEntityCapabilities.md) | Derives UI capabilities from entity metadata |
| [disabledEditorForReadonly](variables/disabledEditorForReadonly.md) | Non-editable rows: disable the editor |
| [DISPLAY\_ONLY\_FIELDS](variables/DISPLAY_ONLY_FIELDS.md) | System fields that are display-only (not editable) |
| [ENTITY\_TABLE\_CONFIG](variables/ENTITY_TABLE_CONFIG.md) | Entity table configuration context. |
| [EntityTable](variables/EntityTable.md) | VTable table host component. |
| [getCellRecord](variables/getCellRecord.md) | Safely gets the current row record from VTable callback arguments |
| [isReadonly](variables/isReadonly.md) | Checks whether the record is a readonly row |
| [isReadonlyOrAddRow](variables/isReadonlyOrAddRow.md) | Checks whether the record is a readonly row or a new-row template |
| [modelEnMessages](variables/modelEnMessages.md) | Built-in English catalog of the components. |
| [modelMessages](variables/modelMessages.md) | Component catalog shipped with the package; applications can override it item by item. |
| [modelZhHansMessages](variables/modelZhHansMessages.md) | Built-in Chinese catalog of the components, preserving existing default copy. |
| [QUERY\_BUILDER\_THEME](variables/QUERY_BUILDER_THEME.md) | QueryBuilder theme context (the React equivalent of the Angular side's `QUERY_BUILDER_THEME` InjectionToken). |
| [QueryTable](variables/QueryTable.md) | Query table component: filter bar slot + filter status bar + EntityTable. |
| [ROW\_SERIES\_COL\_OFFSET](variables/ROW_SERIES_COL_OFFSET.md) | VTable's rowSeriesNumber column occupies col=0 and data columns start at col=1. Subtract this offset when mapping VTable column indices to indices in the columns array. |
| [SKIP\_FIELDS](variables/SKIP_FIELDS.md) | System fields that are skipped (not shown as separate columns) |
| [switchDisabledForReadonly](variables/switchDisabledForReadonly.md) | Disables the switch: readonly rows cannot be operated on |
| [useEntityDetailHeadless](variables/useEntityDetailHeadless.md) | Equivalent named alias of useEntityDetailHeadless. |
| [useEntityDialogHeadless](variables/useEntityDialogHeadless.md) | Equivalent named alias of useEntityDialogHeadless. |
| [useEntityFormHeadless](variables/useEntityFormHeadless.md) | Named alias for convenience with composition-style APIs. |
| [useEntityListHeadless](variables/useEntityListHeadless.md) | Equivalent named alias of useEntityListHeadless. |
| [useQueryBuilderHeadless](variables/useQueryBuilderHeadless.md) | Equivalent named alias of useQueryBuilderHeadless. |
| [useQueryTableHeadless](variables/useQueryTableHeadless.md) | Equivalent named alias of useQueryTableHeadless. |
| [UUID\_RE](variables/UUID_RE.md) | Regular expression for validating UUID string format (case-insensitive) |

## Functions

| Function | Description |
| ------ | ------ |
| [\_resetEditorRegistry](functions/resetEditorRegistry.md) | Resets the editor registration state (for tests only) |
| [actionsColumn](functions/actionsColumn.md) | Actions column: optionally includes view and delete buttons |
| [applyClipboard](functions/applyClipboard.md) | Collects pending write operations from the internal clipboard (matched by column position, Excel-like behavior). cellType must match; rows/columns cycle when there are not enough. Skips readonly rows, new rows, and non-writable columns (column-level readonly, system / selection / actions columns); if the target column defines a menuList, values outside the enum range are skipped. |
| [applyListViewColumns](functions/applyListViewColumns.md) | Applies field order and visibility, fixing the positions of the selection and actions columns. |
| [applyPopoverPosition](functions/applyPopoverPosition.md) | Applies the result of calcPopoverPosition directly to the popover DOM element. |
| [applySystemText](functions/applySystemText.md) | Collects pending write operations from system clipboard text (TSV). Boolean columns convert text to booleans automatically (true/1/yes → true, false/0/no/empty → false); unrecognized values are skipped; enum columns skip values not in menuList; rows/columns cycle when there are not enough. Skips readonly rows, new rows, and non-writable columns (column-level readonly, system / selection / actions columns). |
| [buildDetailTabs](functions/buildDetailTabs.md) | Builds the detail page tab list from entity metadata |
| [buildEditableColumns](functions/buildEditableColumns.md) | Builds editable VTable column definitions from EntityMetadata |
| [buildFieldTree](functions/buildFieldTree.md) | Converts a flat field list into a tree structure |
| [buildFormFields](functions/buildFormFields.md) | Builds the form field list from entity metadata and form mode |
| [buildListViewOrderBy](functions/buildListViewOrderBy.md) | Builds database cursor ordering with grouping fields first; a unique key provides stable pagination. |
| [buildListViewRecords](functions/buildListViewRecords.md) | Normalizes unfilled grouping fields to null so VTable does not drop undefined grouping records. |
| [buildListViewTableOptions](functions/buildListViewTableOptions.md) | Builds collapsible grouping and loaded-record counts without passing off the current page count as full statistics. |
| [buildPropertyColumn](functions/buildPropertyColumn.md) | Builds a VTable ColumnDefine from a property type configuration |
| [buildTableOptions](functions/buildTableOptions.md) | Builds ListTable initialization options |
| [calcPopoverPosition](functions/calcPopoverPosition.md) | Calculates the popover position relative to the trigger element, preferring to display below and flipping above when there is not enough space. |
| [calculateDropMode](functions/calculateDropMode.md) | Calculates the drop mode from clientY and the target rectangle (group mode supports into). |
| [canReorderEntityList](functions/canReorderEntityList.md) | Whether the entity list currently allows drag reordering |
| [changeCellValue](functions/changeCellValue.md) | Writes a cell value back (without triggering edit events) |
| [cloneStructured](functions/cloneStructured.md) | Deep-copies structured values in model state, preserving dates, byte sequences, and circular references. |
| [cn](functions/cn.md) | Joins CSS class names (a thin wrapper around clsx). |
| [collectDeleteWrites](functions/collectDeleteWrites.md) | Collects the list of cell writes that Delete/Backspace needs to clear from the selection. Skips readonly rows, new rows, and non-writable columns (column-level readonly, system / selection / actions columns); non-writable boolean columns also stay out of boolCells so the switch is not flipped off without an actual write. |
| [collectReorderedIds](functions/collectReorderedIds.md) | Collects the IDs of non-readonly rows after drag reordering |
| [commitRowMove](functions/commitRowMove.md) | Coordinates committing a row drag-drop |
| [completeTableEdit](functions/completeTableEdit.md) | Completes editing of the current cell |
| [computeTooltipPosition](functions/computeTooltipPosition.md) | Computes the absolute position of the tooltip on the page |
| [createDefaultFormData](functions/createDefaultFormData.md) | Creates default form data from field configuration |
| [createEntityDetailController](functions/createEntityDetailController.md) | Creates a controller with a shared form draft and detail lifecycle. |
| [createEntityDialogController](functions/createEntityDialogController.md) | Creates a lifecycle controller independent of a specific popup implementation. |
| [createEntityFormController](functions/createEntityFormController.md) | Factory entry point for creating the form state machine. |
| [createEntityListController](functions/createEntityListController.md) | Creates an entity list controller independent of the presentation layer. |
| [createFieldNodeMap](functions/createFieldNodeMap.md) | Creates a mapping from field names to nodes |
| [createListTable](functions/createListTable.md) | Creates a VTable ListTable instance |
| [createListViewState](functions/createListViewState.md) | Creates independent initial state for the list view. |
| [createOperatorRegistry](functions/createOperatorRegistry.md) | Factory function for creating an OperatorRegistry instance |
| [createQueryBuilderController](functions/createQueryBuilderController.md) | Creates a headless controller reusing the existing query service. |
| [createQueryBuilderService](functions/createQueryBuilderService.md) | Factory function for creating a QueryBuilderService instance |
| [createQueryConverter](functions/createQueryConverter.md) | Factory function for creating a QueryConverter instance |
| [createQueryTableController](functions/createQueryTableController.md) | Creates a query table controller without wiring up VTable. |
| [createSchemaFromEntities](functions/createSchemaFromEntities.md) | Creates field metadata in bulk from multiple EntityMetadata |
| [createSchemaFromEntity](functions/createSchemaFromEntity.md) | Creates field metadata from EntityMetadata |
| [createSchemaParser](functions/createSchemaParser.md) | Factory function for creating a SchemaParser instance |
| [createTheme](functions/createTheme.md) | Builds a VTable theme from daisyUI CSS variables |
| [createValidationService](functions/createValidationService.md) | Factory function for creating a ValidationService instance |
| [defaultListOrderBy](functions/defaultListOrderBy.md) | Cursor ordering used when the list is not sorted by a column |
| [describeHistoryBarrier](functions/describeHistoryBarrier.md) | Explanation shown when the undo / redo buttons are disabled. |
| [ensureBaseEditorRegistered](functions/ensureBaseEditorRegistered.md) | Registers VTable base editors (global singleton, registered only once on repeated calls) |
| [EntityDetail](functions/EntityDetail.md) | Tabbed entity detail component: basic form tab + relation table tabs. |
| [EntityDialog](functions/EntityDialog.md) | Dialog shell component: title bar (drag / fullscreen / close) + eight-direction resize + content projection. |
| [EntityForm](functions/EntityForm.md) | Metadata-driven form component: renders the corresponding input control per field type, supporting create / edit / view modes. |
| [EntityList](functions/EntityList.md) | Entity list component: infinite-scroll table + inline editing + undo/redo + filter popover + cascading create + M2M selection mode. |
| [EntityTableConfigProvider](functions/EntityTableConfigProvider.md) | Entity table configuration Provider component (equivalent to using ENTITY\_TABLE\_CONFIG.Provider directly). |
| [entityToFormData](functions/entityToFormData.md) | Converts an entity object into form data |
| [extractEntityFields](functions/extractEntityFields.md) | Extracts all business field configurations from entity metadata |
| [extractFieldsFromMetadata](functions/extractFieldsFromMetadata.md) | Extracts fields from EntityMetadata (supports recursive relations) |
| [extractKeyValueFields](functions/extractKeyValueFields.md) | Extracts the sub-field list from a keyValue property's properties |
| [extractRelationTargetFields](functions/extractRelationTargetFields.md) | Extracts fields of the relation target entity (for EXISTS subqueries) |
| [extractSystemFields](functions/extractSystemFields.md) | Extracts system field configurations from entity metadata |
| [FieldSelector](functions/FieldSelector.md) | Field selector component: tree field structure + filtering + relation field expand/collapse. |
| [filterVisibleFields](functions/filterVisibleFields.md) | Filters out fields marked as hidden |
| [findNodeByValue](functions/findNodeByValue.md) | Finds a node in the tree |
| [findOptionLabel](functions/findOptionLabel.md) | Finds the label of the matching item in the popover option list. |
| [flattenFieldTree](functions/flattenFieldTree.md) | Flattens the field tree into an option list |
| [formatAsTsv](functions/formatAsTsv.md) | Serializes ClipboardContent into a TSV string |
| [formatDateToYmd](functions/formatDateToYmd.md) | Formats a date as a YYYY-MM-DD string. |
| [formatDateValue](functions/formatDateValue.md) | Formats a date value as a localized string |
| [formatEntityFieldValue](functions/formatEntityFieldValue.md) | Formats a field value as a display string |
| [formDataToEntityChanges](functions/formDataToEntityChanges.md) | Computes the change set of form data relative to the original entity object |
| [generateId](functions/generateId.md) | Generates a unique ID for identifying QueryBuilder rules and rule groups |
| [getCSSVariables](functions/getCSSVariables.md) | Reads daisyUI theme colors from CSS custom properties |
| [getCSSVariableValue](functions/getCSSVariableValue.md) | Reads a single CSS variable value, falling back to the default when empty |
| [getDefaultColors](functions/getDefaultColors.md) | Returns the default color set |
| [getDefaultOperatorRegistry](functions/getDefaultOperatorRegistry.md) | Gets the default operator registry |
| [getDefaultValueForType](functions/getDefaultValueForType.md) | Returns the default value for the given input control type. |
| [getDisplayNamePath](functions/getDisplayNamePath.md) | Gets the full displayName path |
| [getDocumentRootStyle](functions/getDocumentRootStyle.md) | Gets the computed style of the document root element |
| [getInputType](functions/getInputType.md) | Determines the input control type for a query condition value based on the field type and operator. |
| [getListViewFields](functions/getListViewFields.md) | Extracts configurable fields from table columns, excluding actions and selection columns. |
| [getOperatorsForType](functions/getOperatorsForType.md) | Gets the applicable operators for a field type |
| [getOptionGroupChildren](functions/getOptionGroupChildren.md) | Gets the optionGroupChildren configuration for CascadeSelect |
| [getRelationIgnoreKeys](functions/getRelationIgnoreKeys.md) | Gets the keys a relation must ignore (to avoid circular references) |
| [getTableContainer](functions/getTableContainer.md) | Gets the table DOM container element |
| [handleTableKeydown](functions/handleTableKeydown.md) | Table container keydown event handling — clipboard shortcuts + boolean toggle + delete. Clipboard shortcuts and the delete key are not intercepted while editing. |
| [isDocumentDarkMode](functions/isDocumentDarkMode.md) | Determines whether the current document is in dark mode |
| [isRowDragEnabled](functions/isRowDragEnabled.md) | Whether the table currently allows row dragging |
| [isRule](functions/isRule.md) | Type guard: determines whether something is a rule |
| [isRuleGroup](functions/isRuleGroup.md) | Type guard: determines whether something is a rule group |
| [isTableEditing](functions/isTableEditing.md) | Checks whether the table is currently editing |
| [localizeEntityFormFields](functions/localizeEntityFormFields.md) | Updates the display labels in an open form, preserving field configuration and the caller's data state. |
| [localizeEntityMetadata](functions/localizeEntityMetadata.md) | Clones the display metadata and resolves entity, property, and relation labels; the original entity declaration and storage contract remain unchanged. |
| [lucideToSvgElement](functions/lucideToSvgElement.md) | Converts `LucideIconData` into an inline SVG element (built via DOM APIs, immune to markup injection) |
| [makeDeleteIcons](functions/makeDeleteIcons.md) | Generates the icon options for delete buttons (SVG icon + text label) |
| [makeEditorForReadonly](functions/makeEditorForReadonly.md) | Builds an editor function: non-readonly rows use the given editor name, readonly rows return undefined |
| [makeViewIcons](functions/makeViewIcons.md) | Generates the icon options for view buttons (SVG only, to avoid text stretching the remaining width) |
| [mapPropertyType](functions/mapPropertyType.md) | Maps PropertyType to a FieldMetadata type |
| [modelText](functions/modelText.md) | Reads the component catalog, preferring the configured catalog. |
| [moveListViewItem](functions/moveListViewItem.md) | Moves a field or ordering rule, preserving the original order when crossing boundaries. |
| [normalizeKVSchemaEntryType](functions/normalizeKVSchemaEntryType.md) | Normalizes an entity property type into a keyValue Schema value type |
| [observeDocumentTheme](functions/observeDocumentTheme.md) | Observes document theme changes: the root node's `data-theme`, inline `style` (runtime overrides for primary color / border radius are written here), and system light/dark changes when there is no explicit `data-theme`. |
| [OperatorSelector](functions/OperatorSelector.md) | Operator selector component: derives selectable options from the operator registry by field metadata / type. |
| [organizeFields](functions/organizeFields.md) | Groups and sorts fields |
| [parseCommaSeparatedInput](functions/parseCommaSeparatedInput.md) | Parses a comma-separated string into an array. Returns an array of numbers when fieldType is 'number', otherwise an array of strings. |
| [parseEntityFieldValue](functions/parseEntityFieldValue.md) | Parses a raw value into the target value for the given field type |
| [parseEntityFieldValueStrict](functions/parseEntityFieldValueStrict.md) | Strictly parses form input; on failure returns a structured reason, and callers must not overwrite the original input. |
| [parsePropertyColumnValue](functions/parsePropertyColumnValue.md) | Parses the string value entered via input-editor back into the property's original type |
| [parseYmdToLocalDate](functions/parseYmdToLocalDate.md) | Parses a YYYY-MM-DD string into a Date in the local timezone. |
| [patchDragIconForReadonlyRows](functions/patchDragIconForReadonlyRows.md) | HACK: VTable provides no API to disable dragging for specific rows, implemented by monkey-patching internal properties |
| [pinsSingleOrderDomain](functions/pinsSingleOrderDomain.md) | Whether the fixed query pins exactly one complete ordering domain |
| [PopoverSelect](functions/PopoverSelect.md) | Dropdown select component based on the Popover API. |
| [positionOverlayPanel](functions/positionOverlayPanel.md) | Positions the overlay panel below the cell (flips above when there is not enough space) |
| [QueryBuilder](functions/QueryBuilder.md) | @aiao/rxdb-model-react |
| [QueryBuilderThemeProvider](functions/QueryBuilderThemeProvider.md) | Provides a custom theme (the React equivalent of the Angular side's `provideQueryBuilderTheme`). |
| [QueryGroup](functions/QueryGroup.md) | Query rule group component (recursive). |
| [QueryRule](functions/QueryRule.md) | Single query rule component: field / operator / value inputs + delete button; supports subqueries for exists. |
| [readRowMove](functions/readRowMove.md) | Reads the dragged row and drop neighbors from a row drag-drop |
| [refocusTable](functions/refocusTable.md) | Returns focus to the VTable root element after editing ends (the tabindex=0 .vtable div = ctx.container = table.getElement()), so arrow-key navigation keeps working |
| [refreshFormValidationResult](functions/refreshFormValidationResult.md) | Replays the displayed validation errors with the current field labels and language, preserving the original input when parsing failed. |
| [registerEditor](functions/registerEditor.md) | Registers a custom editor |
| [restoreTableRecords](functions/restoreTableRecords.md) | Restores the table rows to the order of the most recent commit |
| [scheduleEditorSetup](functions/scheduleEditorSetup.md) | Defers editor setup (registering outside-click listeners + focusing) to avoid interference from VTable events |
| [setCellSwitchState](functions/setCellSwitchState.md) | Sets the visual state of switch/checkbox/radio cells |
| [setRowDragEnabled](functions/setRowDragEnabled.md) | Toggles the table's row drag handle at runtime |
| [setTableI18n](functions/setTableI18n.md) | Binds the component runtime to a table instance; editors read it via their owning table. |
| [snapshotSelection](functions/snapshotSelection.md) | Snapshots the current VTable selection as clipboard content. |
| [sortFormFields](functions/sortFormFields.md) | Sorts fields by their order in ascending order |
| [structuralEqual](functions/structuralEqual.md) | Structural deep comparison replacing JSON.stringify comparison. Recursively compares objects and arrays without depending on key serialization order. Supports circular reference detection to avoid infinite recursion. |
| [SubqueryBuilder](functions/SubqueryBuilder.md) | Subquery builder component: nested query conditions for EXISTS / NOT EXISTS. |
| [syncHeaderSortIcon](functions/syncHeaderSortIcon.md) | Synchronizes the header sort icon without performing client-side sorting |
| [TreeSelect](functions/TreeSelect.md) | Tree dropdown select component: Popover API + filtering + expand/collapse + keyboard navigation. |
| [updateTableRecords](functions/updateTableRecords.md) | Updates table data and restores column widths (matched by field name, tolerating column additions/removals) |
| [useEntityDetail](functions/useEntityDetail.md) | React entity detail binding; field/mode changes do not reset the uncommitted draft. |
| [useEntityDialog](functions/useEntityDialog.md) | React dialog lifecycle binding. |
| [useEntityForm](functions/useEntityForm.md) | Binds the shared form state to the React lifecycle. |
| [useEntityList](functions/useEntityList.md) | React entity list binding; query, ordering, pagination, records, and capability inputs sync only the items that actually changed. |
| [useQueryBuilder](functions/useQueryBuilder.md) | React query builder binding; the controller is kept in component state and reclaimed with the component on unmount. |
| [useQueryTable](functions/useQueryTable.md) | React query table state binding; input sync rules are the same as `useEntityList`. |
| [validateEntityFieldValue](functions/validateEntityFieldValue.md) | Validates whether a single field value satisfies the field configuration constraints |
| [validateField](functions/validateField.md) | Validates a single form field value |
| [validateForm](functions/validateForm.md) | Validates the entire form data |
| [ValueInput](functions/ValueInput.md) | Value input component: derives the input form from the field type + operator. |
