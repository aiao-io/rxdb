# Collaboration

Collaboration builds on a stable local data path. This chapter covers versioning, synchronization, and recoverability — not a real-time collaborative document system.

**Status**: MVP verified — branches, undo/redo, filtered sync, and cross-tab sync all run out of the box.

## Capabilities

| Capability                                                              | What it is for                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Branches](/collaboration/branch.md)                                    | Isolate changes, organize workflows, handle parallel edits                            |
| [Working tree and commits](/plugins/rxdb-plugin-working-tree/README.md) | Capture uncommitted changes, `status` / `diff` / `commit` / `discard`, commit history |
| [Sync](/collaboration/sync.md)                                          | How data moves between local and remote                                               |
| [Undo/redo](/collaboration/undo-redo.md)                                | Make user operations reversible and recoverable                                       |

## Out of scope

- Fine-grained permissions
- A hosted cloud service

## When to read this chapter

- You already understand entity models and basic queries
- Your app is starting to need offline editing, multi-device collaboration, or conflict handling
- You don't want collaboration logic scattered across UI layers and API calls

## Read first

- [Model definition](/model-definition/README.md)
- [Model mutation](/model-mutation/README.md)
- [Database adapters](/adapters/README.md)
