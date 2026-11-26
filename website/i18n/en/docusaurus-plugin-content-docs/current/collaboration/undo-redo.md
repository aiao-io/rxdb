# Undo/Redo design

## Overview

Undo/Redo builds on the `RxDBChange` change log: the `inversePatch` and `patch` fields record the inverse and forward operations of every change, which powers undo and redo.

:::info Plugin dependency
Undo/Redo comes from [@aiao/rxdb-plugin-history](../plugins/rxdb-plugin-history/README.md), not core — without it, `rxdb.versionManager` does not exist. See the plugin manual for installation and usage.
:::

:::info Development status
The core logic is implemented in `VersionManager` and `HistoryManager`.
:::

## Core principles

This section describes the three core design principles of Undo/Redo, which ensure correctness, consistency, and predictability.

### 1. Time boundary

**Only data changes made after RxDB initialization can be undone.**

- Historical data from before RxDB initialization has no change records, so it cannot be tracked or restored
- The system records the RxDB initialization time as the starting boundary for undo/redo
- This guarantees every undoable operation has a complete change log behind it

### 2. Transaction integrity

**All operations in a transaction must undo/redo as a whole.**

- The `transactionId` field identifies multiple changes belonging to the same transaction
- Undo: all changes in the transaction must be undone together, keeping data consistent
- Redo: all changes must be restored in their original order, avoiding state corruption

### 3. State markers

**The `revertChangeId` and `revertChangedAt` fields track a change's undo state.**

Combined, the two fields distinguish three states:

#### State matrix

| `revertChangeId` | `revertChangedAt` | State                           | Effective   |
| ---------------- | ----------------- | ------------------------------- | ----------- |
| `null`           | `null`            | Normal, never undone            | ✅ active   |
| **non-null**     | **non-null**      | **Undone, currently inactive**  | ❌ inactive |
| **null**         | **non-null**      | **Restored, was undone before** | ✅ active   |

#### Field roles

**`revertChangeId` (undo marker)**

- `null`: the change is currently active
- non-`null`: the change is undone, inactive
- On undo: set to `current sequence value + 1` (a reserved sequence number)
- On redo: cleared to `null` (active again)

**`revertChangedAt` (audit timestamp)**

- `null`: never undone
- non-`null`: the time it was first undone
- Set on undo, **kept** on redo (audit history)
- Lets you query all changes that have ever been undone
