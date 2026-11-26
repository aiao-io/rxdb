# BoardViewComponent

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:191](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L191)

Board view component (board v2, GitHub Projects style): header + filter bar + columns / cards + overlay detail sidebar +
root-level menu / picker + modal dialogs + action notices with undo.

## Remarks

Actions move into context menus, in-place edits save immediately (each change is one undoable transaction), and one picker with one filter syntax covers everything.
All three frameworks only collect pointer / keyboard events; drop targets, keyboard targets, filtering, and popover positioning all call the same pure functions of the core package;
all write entry points go through the domain actions of [useBoard](../functions/useBoard.md) (the write gate during restore and validation are re-checked in the service layer, not by hiding buttons).
Styles come from `@aiao/rxdb-plugin-board/board.css`, delivered through this package's `./board-view.css` subpath (same name as the React / Vue bindings),
which the host includes in its global styles (such as `styles` in `angular.json`).

## Implements

- `OnInit`
- `OnDestroy`

## Constructors

### Constructor

```ts
new BoardViewComponent(): BoardViewComponent;
```

#### Returns

`BoardViewComponent`

## Properties

### activeSuggestion \{#activesuggestion\}

```ts
protected readonly activeSuggestion: WritableSignal<number>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L271)

---

### activeSuggestionId \{#activesuggestionid\}

```ts
protected readonly activeSuggestionId: Signal<string | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:344](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L344)

---

### addColumnTitle \{#addcolumntitle\}

```ts
protected readonly addColumnTitle: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L252)

---

### addingColumn \{#addingcolumn\}

```ts
protected readonly addingColumn: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:251](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L251)

---

### addTaskColumnId \{#addtaskcolumnid\}

```ts
protected readonly addTaskColumnId: WritableSignal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L248)

---

### addTaskTitle \{#addtasktitle\}

```ts
protected readonly addTaskTitle: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L249)

---

### board \{#board\}

```ts
protected readonly board: WritableSignal<UseBoardReturn | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L215)

---

### boardArea \{#boardarea\}

```ts
protected readonly boardArea: Signal<ElementRef<HTMLElement> | undefined>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L216)

---

### boardComposerTitle \{#boardcomposertitle\}

```ts
protected readonly boardComposerTitle: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L253)

---

### boardDescriptionDraft \{#boarddescriptiondraft\}

```ts
protected readonly boardDescriptionDraft: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:243](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L243)

---

### boardTitleDraft \{#boardtitledraft\}

```ts
protected readonly boardTitleDraft: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:241](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L241)

---

### canCreateLabelFromPicker \{#cancreatelabelfrompicker\}

```ts
protected readonly canCreateLabelFromPicker: Signal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:379](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L379)

---

### columnTitleDraft \{#columntitledraft\}

```ts
protected readonly columnTitleDraft: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L245)

---

### creatingTask \{#creatingtask\}

```ts
protected readonly creatingTask: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L250)

---

### detailBase \{#detailbase\}

```ts
protected readonly detailBase: WritableSignal<TaskDraftSnapshot | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L259)

---

### detailDescription \{#detaildescription\}

```ts
protected readonly detailDescription: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L261)

---

### detailDescriptionId \{#detaildescriptionid\}

```ts
protected readonly detailDescriptionId: string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L225)

---

### detailDueId \{#detaildueid\}

```ts
protected readonly detailDueId: string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L226)

---

### detailLabels \{#detaillabels\}

```ts
protected readonly detailLabels: Signal<BoardLabel[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:357](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L357)

---

### detailStatus \{#detailstatus\}

```ts
protected readonly detailStatus: WritableSignal<string | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:262](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L262)

---

### detailTaskId \{#detailtaskid\}

```ts
protected readonly detailTaskId: WritableSignal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L258)

---

### detailTitle \{#detailtitle\}

```ts
protected readonly detailTitle: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L260)

---

### dialog \{#dialog\}

```ts
protected readonly dialog: WritableSignal<DialogState | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L221)

---

### dialogTitleId \{#dialogtitleid\}

```ts
protected readonly dialogTitleId: string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L224)

---

### dragging \{#dragging\}

```ts
protected readonly dragging: WritableSignal<
  | {
  id: string;
  kind: "column" | "task";
}
  | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L231)

---

### dropTarget \{#droptarget\}

```ts
protected readonly dropTarget: WritableSignal<
  | {
  columnId: `${string}-${string}-${string}-${string}-${string}`;
  kind: "task";
  mode: "before" | "after";
  taskId: `${string}-${string}-${string}-${string}-${string}`;
}
  | {
  columnId: `${string}-${string}-${string}-${string}-${string}`;
  kind: "task-end";
}
  | {
  columnId: `${string}-${string}-${string}-${string}-${string}`;
  kind: "column";
  mode: "before" | "after";
}
  | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L232)

---

### editingBoardDescription \{#editingboarddescription\}

```ts
protected readonly editingBoardDescription: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L242)

---

### editingBoardTitle \{#editingboardtitle\}

```ts
protected readonly editingBoardTitle: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L240)

---

### editingColumnId \{#editingcolumnid\}

```ts
protected readonly editingColumnId: WritableSignal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:244](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L244)

---

### editingTaskId \{#editingtaskid\}

```ts
protected readonly editingTaskId: WritableSignal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L246)

---

### exportBackup \{#exportbackup\}

```ts
readonly exportBackup: InputSignal<(() => void | Promise<void>) | undefined>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:398](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L398)

Backup export callback (the US-537 orchestration is wired by the host; a placeholder notice shows when absent).
It is the same callback as React / Vue's `onExportBackup`: the name follows each framework's property-binding convention (a binding-layer difference allowed by the US-539 tech note).

---

### filter \{#filter\}

```ts
protected readonly filter: Signal<BoardFilter>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:298](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L298)

---

### filterActive \{#filteractive\}

```ts
protected readonly filterActive: Signal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L299)

---

### filterFocused \{#filterfocused\}

```ts
protected readonly filterFocused: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L270)

---

### filterQuery \{#filterquery\}

```ts
protected readonly filterQuery: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L269)

---

### focusedTaskId \{#focusedtaskid\}

```ts
protected readonly focusedTaskId: WritableSignal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L274)

---

### labelColors \{#labelcolors\}

```ts
protected readonly labelColors: readonly object[] = BOARD_LABEL_COLORS;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L227)

---

### labelEditor \{#labeleditor\}

```ts
protected readonly labelEditor: WritableSignal<LabelEditorState | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L254)

---

### notice \{#notice\}

```ts
protected readonly notice: WritableSignal<string | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L218)

---

### pickerActive \{#pickeractive\}

```ts
protected readonly pickerActive: WritableSignal<number>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L266)

---

### pickerOptions \{#pickeroptions\}

```ts
protected readonly pickerOptions: Signal<readonly PickerOption[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:364](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L364)

---

### pickerQuery \{#pickerquery\}

```ts
protected readonly pickerQuery: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:265](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L265)

---

### popover \{#popover\}

```ts
protected readonly popover: WritableSignal<PopoverState | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L220)

---

### rovingTaskId \{#rovingtaskid\}

```ts
protected readonly rovingTaskId: Signal<`${string}-${string}-${string}-${string}-${string}`>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:351](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L351)

Roving tabindex: the last focused visible card, otherwise the first visible card.

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: InputSignal<RxDB>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:393](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L393)

Connected board RxDB instance (entities include the five entities of the board namespace, requiring the history plugin).

---

### searchErrorText \{#searcherrortext\}

```ts
protected readonly searchErrorText: WritableSignal<string | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L281)

---

### searchHasMore \{#searchhasmore\}

```ts
protected readonly searchHasMore: WritableSignal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L280)

---

### searchHighlightId \{#searchhighlightid\}

```ts
protected readonly searchHighlightId: WritableSignal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:282](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L282)

---

### searchQuery \{#searchquery\}

```ts
protected readonly searchQuery: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:277](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L277)

---

### searchResults \{#searchresults\}

```ts
protected readonly searchResults: WritableSignal<readonly SearchResult[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:279](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L279)

---

### searchState \{#searchstate\}

```ts
protected readonly searchState: WritableSignal<"error" | "loading" | "idle" | "success" | "empty">;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:278](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L278)

---

### shortcutGroups \{#shortcutgroups\}

```ts
protected readonly shortcutGroups: readonly [{
  items: readonly [{
     keys: readonly ["↑", "↓", "←", "→"];
     label: "Move between cards";
   }, {
     keys: readonly ["Home", "End"];
     label: "First / last in this column";
   }, {
     keys: readonly ["/"];
     label: "Focus filter";
   }, {
     keys: readonly ["⌘/Ctrl", "K"];
     label: "Search tasks";
   }, {
     keys: readonly ["?"];
     label: "Show shortcuts";
  }];
  title: "Navigation";
}, {
  items: readonly [{
     keys: readonly ["Enter"];
     label: "Open detail";
   }, {
     keys: readonly ["F2"];
     label: "Edit title";
   }, {
     keys: readonly ["⌥", "↑", "↓"];
     label: "Move up / down";
   }, {
     keys: readonly ["⌥", "←", "→"];
     label: "Move to adjacent column";
   }, {
     keys: readonly ["Del"];
     label: "Delete";
   }, {
     keys: readonly ["⇧", "F10"];
     label: "More actions";
  }];
  title: "Cards";
}, {
  items: readonly [{
     keys: readonly ["⌘/Ctrl", "Z"];
     label: "Undo";
   }, {
     keys: readonly ["⇧", "⌘/Ctrl", "Z"];
     label: "Redo";
   }, {
     keys: readonly ["Esc"];
     label: "Close menu / dialog / detail";
  }];
  title: "Edit";
}] = SHORTCUT_GROUPS;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L228)

---

### sortingColumnId \{#sortingcolumnid\}

```ts
protected readonly sortingColumnId: WritableSignal<`${string}-${string}-${string}-${string}-${string}` | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:255](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L255)

---

### suggestionListId \{#suggestionlistid\}

```ts
protected readonly suggestionListId: string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L223)

---

### suggestions \{#suggestions\}

```ts
protected readonly suggestions: Signal<BoardFilterSuggestion[]>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:331](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L331)

---

### suggestionsOpen \{#suggestionsopen\}

```ts
protected readonly suggestionsOpen: Signal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L340)

---

### taskMap \{#taskmap\}

```ts
protected readonly taskMap: Signal<Map<`${string}-${string}-${string}-${string}-${string}`, Task[]>>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L289)

---

### taskTitleDraft \{#tasktitledraft\}

```ts
protected readonly taskTitleDraft: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L247)

---

### toast \{#toast\}

```ts
protected readonly toast: WritableSignal<
  | {
  message: string;
  undoable: boolean;
}
  | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L219)

---

### today \{#today\}

```ts
protected readonly today: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L217)

---

### visibleCount \{#visiblecount\}

```ts
protected readonly visibleCount: Signal<number>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:327](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L327)

---

### visibleTaskMap \{#visibletaskmap\}

```ts
protected readonly visibleTaskMap: Signal<Map<`${string}-${string}-${string}-${string}-${string}`, readonly Task[]>>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L301)

---

### writeLocked \{#writelocked\}

```ts
protected readonly writeLocked: Signal<boolean>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:284](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L284)

## Accessors

### boardRef \{#boardref\}

#### Get Signature

```ts
get protected boardRef(): UseBoardReturn;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:386](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L386)

##### Returns

[`UseBoardReturn`](../interfaces/UseBoardReturn.md)

## Methods

### applySuggestion() \{#applysuggestion\}

```ts
protected applySuggestion(query): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:685](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L685)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `query`   | `string` |

#### Returns

`void`

---

### cancelAddColumn() \{#canceladdcolumn\}

```ts
protected cancelAddColumn(event?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:780](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L780)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event?`  | `Event` |

#### Returns

`void`

---

### cancelAddTask() \{#canceladdtask\}

```ts
protected cancelAddTask(event?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:792](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L792)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event?`  | `Event` |

#### Returns

`void`

---

### cancelBoardTitle() \{#cancelboardtitle\}

```ts
protected cancelBoardTitle(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:579](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L579)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### cancelColumnTitle() \{#cancelcolumntitle\}

```ts
protected cancelColumnTitle(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:723](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L723)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### cancelLabelEditor() \{#cancellabeleditor\}

```ts
protected cancelLabelEditor(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1072](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1072)

#### Returns

`void`

---

### cancelTaskTitle() \{#canceltasktitle\}

```ts
protected cancelTaskTitle(event?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:835](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L835)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event?`  | `Event` |

#### Returns

`void`

---

### canMoveTask() \{#canmovetask\}

```ts
protected canMoveTask(task, direction): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:535](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L535)

#### Parameters

| Parameter   | Type                                                                               |
| ----------- | ---------------------------------------------------------------------------------- |
| `task`      | [`Task`](../interfaces/Task.md)                                                    |
| `direction` | [`BoardMoveDirection`](../../rxdb-plugin-board/type-aliases/BoardMoveDirection.md) |

#### Returns

`boolean`

---

### choosePickerOption() \{#choosepickeroption\}

```ts
protected choosePickerOption(optionId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:966](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L966)

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `optionId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;`void`&gt;

---

### clearDragFeedback() \{#cleardragfeedback\}

```ts
protected clearDragFeedback(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1158)

#### Returns

`void`

---

### clearFilter() \{#clearfilter\}

```ts
protected clearFilter(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:690](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L690)

#### Returns

`void`

---

### closeDetail() \{#closedetail\}

```ts
protected closeDetail(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:884](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L884)

#### Returns

`void`

---

### closeDialog() \{#closedialog\}

```ts
protected closeDialog(restoreFocus?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1007](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1007)

#### Parameters

| Parameter       | Type      | Default value |
| --------------- | --------- | ------------- |
| `restoreFocus?` | `boolean` | `true`        |

#### Returns

`void`

---

### closePopover() \{#closepopover\}

```ts
protected closePopover(restoreFocus?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1267)

#### Parameters

| Parameter       | Type      | Default value |
| --------------- | --------- | ------------- |
| `restoreFocus?` | `boolean` | `true`        |

#### Returns

`void`

---

### columnById() \{#columnbyid\}

```ts
protected columnById(columnId): Column | undefined;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:482](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L482)

#### Parameters

| Parameter  | Type                                                                |
| ---------- | ------------------------------------------------------------------- |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` \| `null` |

#### Returns

[`Column`](../interfaces/Column.md) \| `undefined`

---

### columnTitleOf() \{#columntitleof\}

```ts
protected columnTitleOf(columnId): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:494](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L494)

#### Parameters

| Parameter  | Type                                                                |
| ---------- | ------------------------------------------------------------------- |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` \| `null` |

#### Returns

`string`

---

### commitAddColumn() \{#commitaddcolumn\}

```ts
protected commitAddColumn(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:771](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L771)

#### Returns

`Promise`&lt;`void`&gt;

---

### commitAddTask() \{#commitaddtask\}

```ts
protected commitAddTask(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:800](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L800)

Create a task at the bottom of a column (same as GitHub): Enter creates it, and the input stays open for continuous entry.

#### Returns

`Promise`&lt;`void`&gt;

---

### commitBoardDescription() \{#commitboarddescription\}

```ts
protected commitBoardDescription(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:590](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L590)

#### Returns

`Promise`&lt;`void`&gt;

---

### commitBoardTitle() \{#commitboardtitle\}

```ts
protected commitBoardTitle(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:569](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L569)

#### Returns

`Promise`&lt;`void`&gt;

---

### commitColumnTitle() \{#commitcolumntitle\}

```ts
protected commitColumnTitle(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:713](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L713)

#### Returns

`Promise`&lt;`void`&gt;

---

### commitDetailDescription() \{#commitdetaildescription\}

```ts
protected commitDetailDescription(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:903](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L903)

#### Returns

`Promise`&lt;`void`&gt;

---

### commitDetailDue() \{#commitdetaildue\}

```ts
protected commitDetailDue(value): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:917](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L917)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### commitDetailTitle() \{#commitdetailtitle\}

```ts
protected commitDetailTitle(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:893](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L893)

#### Returns

`Promise`&lt;`void`&gt;

---

### commitTaskTitle() \{#committasktitle\}

```ts
protected commitTaskTitle(task): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:827](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L827)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`Promise`&lt;`void`&gt;

---

### confirmBoardDelete() \{#confirmboarddelete\}

```ts
protected confirmBoardDelete(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:629](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L629)

#### Returns

`Promise`&lt;`void`&gt;

---

### confirmColumnDelete() \{#confirmcolumndelete\}

```ts
protected confirmColumnDelete(column): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:759](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L759)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`Promise`&lt;`void`&gt;

---

### confirmTaskDelete() \{#confirmtaskdelete\}

```ts
protected confirmTaskDelete(task): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:855](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L855)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`Promise`&lt;`void`&gt;

---

### countLabel() \{#countlabel\}

```ts
protected countLabel(column): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:465](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L465)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`string`

---

### createLabelFromPicker() \{#createlabelfrompicker\}

```ts
protected createLabelFromPicker(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:981](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L981)

#### Returns

`Promise`&lt;`void`&gt;

---

### deleteDetailTask() \{#deletedetailtask\}

```ts
protected deleteDetailTask(event): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:938](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L938)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`Promise`&lt;`void`&gt;

---

### deleteLabel() \{#deletelabel\}

```ts
protected deleteLabel(label): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1083](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1083)

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `label`   | [`BoardLabel`](../interfaces/BoardLabel.md) |

#### Returns

`Promise`&lt;`void`&gt;

---

### dueStatusOf() \{#duestatusof\}

```ts
protected dueStatusOf(dueDate): DueStatus | null;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:474](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L474)

#### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `dueDate` | `string` \| `null` |

#### Returns

[`DueStatus`](../../rxdb-plugin-board/type-aliases/DueStatus.md) \| `null`

---

### dueText() \{#duetext\}

```ts
protected dueText(dueDate): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:478](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L478)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `dueDate` | `string` |

#### Returns

`string`

---

### executeConfirmedDelete() \{#executeconfirmeddelete\}

```ts
protected executeConfirmedDelete(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1022](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1022)

#### Returns

`Promise`&lt;`void`&gt;

---

### inputValue() \{#inputvalue\}

```ts
protected inputValue(event): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:444](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L444)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`string`

---

### isColumnDropAfter() \{#iscolumndropafter\}

```ts
protected isColumnDropAfter(column): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1188)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`boolean`

---

### isColumnDropBefore() \{#iscolumndropbefore\}

```ts
protected isColumnDropBefore(column): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1183)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`boolean`

---

### isDraggingColumn() \{#isdraggingcolumn\}

```ts
protected isDraggingColumn(column): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1197)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`boolean`

---

### isDraggingTask() \{#isdraggingtask\}

```ts
protected isDraggingTask(task): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1193)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`boolean`

---

### isDropAfter() \{#isdropafter\}

```ts
protected isDropAfter(task): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1168)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`boolean`

---

### isDropBefore() \{#isdropbefore\}

```ts
protected isDropBefore(task): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1163)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`boolean`

---

### isDropColumn() \{#isdropcolumn\}

```ts
protected isDropColumn(column): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1178)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`boolean`

---

### isDropEnd() \{#isdropend\}

```ts
protected isDropEnd(column): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1173)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`boolean`

---

### isFirstColumn() \{#isfirstcolumn\}

```ts
protected isFirstColumn(column): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:498](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L498)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`boolean`

---

### isLabelFiltered() \{#islabelfiltered\}

```ts
protected isLabelFiltered(name): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:511](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L511)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`boolean`

---

### isLastColumn() \{#islastcolumn\}

```ts
protected isLastColumn(column): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:502](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L502)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`boolean`

---

### isPopoverFor() \{#ispopoverfor\}

```ts
protected isPopoverFor(kind, targetId): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:506](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L506)

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `kind`     | `BoardPopoverKind`                                        |
| `targetId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`boolean`

---

### isValidColor() \{#isvalidcolor\}

```ts
protected isValidColor(color): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:526](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L526)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `color`   | `string` |

#### Returns

`boolean`

---

### labelsOf() \{#labelsof\}

```ts
protected labelsOf(taskId): readonly BoardLabel[];
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:453](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L453)

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `taskId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

readonly [`BoardLabel`](../interfaces/BoardLabel.md)[]

---

### labelTextColor() \{#labeltextcolor\}

```ts
protected labelTextColor(color): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:449](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L449)

Label text color (contrast, US-539 AC#6).

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `color`   | `string` |

#### Returns

`string`

---

### moveColumnBy() \{#movecolumnby\}

```ts
protected moveColumnBy(columnId, direction): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:745](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L745)

#### Parameters

| Parameter   | Type                                                      |
| ----------- | --------------------------------------------------------- |
| `columnId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `direction` | `-1` \| `1`                                               |

#### Returns

`Promise`&lt;`void`&gt;

---

### moveTaskBy() \{#movetaskby\}

```ts
protected moveTaskBy(task, direction): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:848](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L848)

#### Parameters

| Parameter   | Type                                                                               |
| ----------- | ---------------------------------------------------------------------------------- |
| `task`      | [`Task`](../interfaces/Task.md)                                                    |
| `direction` | [`BoardMoveDirection`](../../rxdb-plugin-board/type-aliases/BoardMoveDirection.md) |

#### Returns

`Promise`&lt;`void`&gt;

---

### ngOnDestroy() \{#ngondestroy\}

```ts
ngOnDestroy(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:428](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L428)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

---

### ngOnInit() \{#ngoninit\}

```ts
ngOnInit(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:400](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L400)

A callback method that is invoked immediately after the
default change detector has checked the directive's
data-bound properties for the first time,
and before any of the view or content children have been checked.
It is invoked only once when the directive is instantiated.

#### Returns

`void`

#### Implementation of

`OnInit.ngOnInit`

---

### onBackdropMousedown() \{#onbackdropmousedown\}

```ts
protected onBackdropMousedown(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1018](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1018)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |

#### Returns

`void`

---

### onBoardDescriptionKeydown() \{#onboarddescriptionkeydown\}

```ts
protected onBoardDescriptionKeydown(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:599](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L599)

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `KeyboardEvent` |

#### Returns

`void`

---

### onBoardSelectionChange() \{#onboardselectionchange\}

```ts
protected onBoardSelectionChange(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:541](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L541)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### onCardKeydown() \{#oncardkeydown\}

```ts
protected onCardKeydown(event, task): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:861](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L861)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `event`   | `KeyboardEvent`                 |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`void`

---

### onColumnDragOver() \{#oncolumndragover\}

```ts
protected onColumnDragOver(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1123)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |

#### Returns

`void`

---

### onColumnDragStart() \{#oncolumndragstart\}

```ts
protected onColumnDragStart(event, column): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1117)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `event`   | `DragEvent`                         |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`void`

---

### onColumnDrop() \{#oncolumndrop\}

```ts
protected onColumnDrop(event): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1148)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |

#### Returns

`Promise`&lt;`void`&gt;

---

### onDetailDescriptionKeydown() \{#ondetaildescriptionkeydown\}

```ts
protected onDetailDescriptionKeydown(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:910](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L910)

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `KeyboardEvent` |

#### Returns

`void`

---

### onExportBackup() \{#onexportbackup\}

```ts
protected onExportBackup(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:616](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L616)

#### Returns

`Promise`&lt;`void`&gt;

---

### onFilterInput() \{#onfilterinput\}

```ts
protected onFilterInput(value): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:653](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L653)

Filters as you type; the first completion item is highlighted by default, and Enter accepts it directly (same as the GitHub filter bar).

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

---

### onFilterKeydown() \{#onfilterkeydown\}

```ts
protected onFilterKeydown(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:659](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L659)

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `KeyboardEvent` |

#### Returns

`void`

---

### onPickerInput() \{#onpickerinput\}

```ts
protected onPickerInput(value): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:946](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L946)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

---

### onPickerKeydown() \{#onpickerkeydown\}

```ts
protected onPickerKeydown(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:951](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L951)

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `KeyboardEvent` |

#### Returns

`void`

---

### onPopoverKeydown() \{#onpopoverkeydown\}

```ts
protected onPopoverKeydown(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:990](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L990)

#### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `KeyboardEvent` |

#### Returns

`void`

---

### onSearchInput() \{#onsearchinput\}

```ts
protected onSearchInput(value): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1204)

Input changes: an empty query destroys the handle and exits the search state; otherwise the same handle is reused.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

---

### onSearchMore() \{#onsearchmore\}

```ts
protected onSearchMore(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1228)

#### Returns

`void`

---

### onSearchResultClick() \{#onsearchresultclick\}

```ts
protected onSearchResultClick(result): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1234)

Clicking a result: closes the dialog, scrolls to the target card, focuses and briefly highlights it (not clickable while updating).

#### Parameters

| Parameter | Type                                                                 |
| --------- | -------------------------------------------------------------------- |
| `result`  | [`SearchResult`](../../rxdb-plugin-board/interfaces/SearchResult.md) |

#### Returns

`void`

---

### onTaskDragOver() \{#ontaskdragover\}

```ts
protected onTaskDragOver(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1096](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1096)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |

#### Returns

`void`

---

### onTaskDragStart() \{#ontaskdragstart\}

```ts
protected onTaskDragStart(event, task): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1090](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1090)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `event`   | `DragEvent`                     |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`void`

---

### onTaskDrop() \{#ontaskdrop\}

```ts
protected onTaskDrop(event): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1135)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `event`   | `DragEvent` |

#### Returns

`Promise`&lt;`void`&gt;

---

### openAddColumn() \{#openaddcolumn\}

```ts
protected openAddColumn(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:765](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L765)

#### Returns

`void`

---

### openAddTask() \{#openaddtask\}

```ts
protected openAddTask(columnId): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:785](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L785)

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`void`

---

### openBoardComposer() \{#openboardcomposer\}

```ts
protected openBoardComposer(event?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:547](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L547)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event?`  | `Event` |

#### Returns

`void`

---

### openBoardMenu() \{#openboardmenu\}

```ts
protected openBoardMenu(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:607](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L607)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### openColumnMenu() \{#opencolumnmenu\}

```ts
protected openColumnMenu(event, column): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:702](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L702)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `event`   | `Event`                             |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`void`

---

### openDetail() \{#opendetail\}

```ts
protected openDetail(taskId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:869](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L869)

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `taskId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;`void`&gt;

---

### openDetailColumnPicker() \{#opendetailcolumnpicker\}

```ts
protected openDetailColumnPicker(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:924](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L924)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### openDetailLabelPicker() \{#opendetaillabelpicker\}

```ts
protected openDetailLabelPicker(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:930](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L930)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### openLabels() \{#openlabels\}

```ts
protected openLabels(event?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:998](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L998)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event?`  | `Event` |

#### Returns

`void`

---

### openMovePicker() \{#openmovepicker\}

```ts
protected openMovePicker(task): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:842](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L842)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`void`

---

### openSearch() \{#opensearch\}

```ts
protected openSearch(event?): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1003](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1003)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event?`  | `Event` |

#### Returns

`void`

---

### openShortcuts() \{#openshortcuts\}

```ts
protected openShortcuts(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:611](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L611)

#### Returns

`void`

---

### openTaskMenu() \{#opentaskmenu\}

```ts
protected openTaskMenu(event, task): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:816](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L816)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `event`   | `Event`                         |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`void`

---

### overdueCount() \{#overduecount\}

```ts
protected overdueCount(column): number;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:470](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L470)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

`number`

---

### popoverLabel() \{#popoverlabel\}

```ts
protected popoverLabel(pop): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:515](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L515)

#### Parameters

| Parameter | Type           |
| --------- | -------------- |
| `pop`     | `PopoverState` |

#### Returns

`string`

---

### previewColor() \{#previewcolor\}

```ts
protected previewColor(color): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:531](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L531)

Preview color: keeps gray while the input is incomplete, so an invalid color is never handed to the contrast calculation.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `color`   | `string` |

#### Returns

`string`

---

### redo() \{#redo\}

```ts
protected redo(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:641](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L641)

#### Returns

`Promise`&lt;`void`&gt;

---

### revertDetailTitle() \{#revertdetailtitle\}

```ts
protected revertDetailTitle(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:899](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L899)

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `event`   | `Event` |

#### Returns

`void`

---

### sameColor() \{#samecolor\}

```ts
protected sameColor(a, b): boolean;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:522](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L522)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `a`       | `string` |
| `b`       | `string` |

#### Returns

`boolean`

---

### saveLabelEditor() \{#savelabeleditor\}

```ts
protected saveLabelEditor(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1076](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1076)

#### Returns

`Promise`&lt;`void`&gt;

---

### searchColumnTitle() \{#searchcolumntitle\}

```ts
protected searchColumnTitle(result): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1248)

#### Parameters

| Parameter | Type                                                                 |
| --------- | -------------------------------------------------------------------- |
| `result`  | [`SearchResult`](../../rxdb-plugin-board/interfaces/SearchResult.md) |

#### Returns

`string`

---

### searchResultTitle() \{#searchresulttitle\}

```ts
protected searchResultTitle(result): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1252)

#### Parameters

| Parameter | Type                                                                 |
| --------- | -------------------------------------------------------------------- |
| `result`  | [`SearchResult`](../../rxdb-plugin-board/interfaces/SearchResult.md) |

#### Returns

`string`

---

### searchUnavailableText() \{#searchunavailabletext\}

```ts
protected searchUnavailableText(reason): string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1256)

#### Parameters

| Parameter | Type                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- |
| `reason`  | \| [`BoardSearchUnavailableReason`](../type-aliases/BoardSearchUnavailableReason.md) \| `null` |

#### Returns

`string`

---

### sortColumnBy() \{#sortcolumnby\}

```ts
protected sortColumnBy(columnId, mode): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:728](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L728)

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `mode`     | `"dueDate"` \| `"title"`                                  |

#### Returns

`Promise`&lt;`void`&gt;

---

### startBoardDescription() \{#startboarddescription\}

```ts
protected startBoardDescription(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:584](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L584)

#### Returns

`void`

---

### startBoardTitle() \{#startboardtitle\}

```ts
protected startBoardTitle(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:563](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L563)

#### Returns

`void`

---

### startColumnTitle() \{#startcolumntitle\}

```ts
protected startColumnTitle(columnId): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:706](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L706)

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`void`

---

### startCreateLabel() \{#startcreatelabel\}

```ts
protected startCreateLabel(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1057](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1057)

#### Returns

`void`

---

### startEditLabel() \{#starteditlabel\}

```ts
protected startEditLabel(label): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1062](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1062)

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `label`   | [`BoardLabel`](../interfaces/BoardLabel.md) |

#### Returns

`void`

---

### startTaskTitle() \{#starttasktitle\}

```ts
protected startTaskTitle(task): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:820](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L820)

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `task`    | [`Task`](../interfaces/Task.md) |

#### Returns

`void`

---

### submitBoardComposer() \{#submitboardcomposer\}

```ts
protected submitBoardComposer(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:553](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L553)

Switches to the new board after creating it; if the user already switched boards themselves while the board creation was persisting, their choice is respected.

#### Returns

`Promise`&lt;`void`&gt;

---

### taskById() \{#taskbyid\}

```ts
protected taskById(taskId): Task | undefined;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:488](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L488)

#### Parameters

| Parameter | Type                                                                |
| --------- | ------------------------------------------------------------------- |
| `taskId`  | `` `${string}-${string}-${string}-${string}-${string}` `` \| `null` |

#### Returns

[`Task`](../interfaces/Task.md) \| `undefined`

---

### tasksOf() \{#tasksof\}

```ts
protected tasksOf(column): readonly Task[];
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:457](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L457)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

readonly [`Task`](../interfaces/Task.md)[]

---

### toggleLabelFilter() \{#togglelabelfilter\}

```ts
protected toggleLabelFilter(name): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:695](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L695)

Clicking a label on a card filters by it (clicking again cancels).

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`void`

---

### undo() \{#undo\}

```ts
protected undo(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:637](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L637)

#### Returns

`Promise`&lt;`void`&gt;

---

### undoFromToast() \{#undofromtoast\}

```ts
protected undoFromToast(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:645](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L645)

#### Returns

`Promise`&lt;`void`&gt;

---

### updateLabelEditor() \{#updatelabeleditor\}

```ts
protected updateLabelEditor(patch): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:1067](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L1067)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `patch`   | `Partial`&lt;`LabelEditorState`&gt; |

#### Returns

`void`

---

### visibleTasksOf() \{#visibletasksof\}

```ts
protected visibleTasksOf(column): readonly Task[];
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-view.ts:461](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-view.ts#L461)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `column`  | [`Column`](../interfaces/Column.md) |

#### Returns

readonly [`Task`](../interfaces/Task.md)[]
