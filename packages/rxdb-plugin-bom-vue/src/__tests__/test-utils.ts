import type { BomViewCommands, BomViewHandle, BomViewNode, BomViewState, ExplosionResult } from '@aiao/rxdb-plugin-bom';
import { BehaviorSubject } from 'rxjs';
import { vi, type Mock } from 'vitest';

export const context = { bomType: 'ebom' as const, orgId: 'org-vue', asOfDate: new Date('2099-01-01T00:00:00Z') };
export const input = { context, target: { parentItemId: 'root' }, plannedQty: { value: '1', uom: 'pcs' } };

export const node = (path: string[], overrides: Partial<BomViewNode> = {}): BomViewNode => ({
  key: JSON.stringify(path),
  path,
  depth: path.length,
  itemId: path.at(-1) ?? 'root',
  revisionId: 'revision',
  occurrenceId: path.at(-1) ?? null,
  qty: path.length === 0 ? null : '2',
  lineNo: path.length === 0 ? null : 10,
  effectiveFrom: null,
  effectiveTo: null,
  itemNo: path.at(-1) ?? 'ROOT',
  description: null,
  quantity: { value: '2', uom: 'pcs' },
  hasChildren: false,
  expanded: false,
  ...overrides
});

export const state = (overrides: Partial<BomViewState> = {}): BomViewState => ({
  phase: 'success',
  nodes: [node([], { hasChildren: true, expanded: true }), node(['assembly'], { hasChildren: true })],
  unresolved: [],
  truncated: null,
  quantityError: null,
  error: null,
  refreshing: false,
  editor: { phase: 'idle', value: null, saving: false, error: null },
  ...overrides
});

export const explosion = (): ExplosionResult => ({
  requirementLines: [],
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null,
  manifest: {
    context,
    parentItemId: 'root',
    parentRevisionId: 'revision',
    headerIds: [],
    occurrenceIds: [],
    conversions: [],
    formulaGrammarVersion: '1',
    algorithmVersion: '1',
    unresolved: []
  }
});

type MockCommands = { [K in keyof BomViewCommands]: Mock<BomViewCommands[K]> };

export const commands = (): MockCommands => ({
  setInput: vi.fn<BomViewCommands['setInput']>(),
  refresh: vi.fn<BomViewCommands['refresh']>(),
  toggle: vi.fn<BomViewCommands['toggle']>(),
  loadOccurrence: vi.fn<BomViewCommands['loadOccurrence']>().mockResolvedValue(undefined),
  saveOccurrence: vi.fn<BomViewCommands['saveOccurrence']>().mockResolvedValue(undefined),
  calculate: vi.fn<BomViewCommands['calculate']>().mockResolvedValue(explosion())
});

export const handle = (): MockCommands & {
  state$: BehaviorSubject<BomViewState>;
  destroy: Mock<BomViewHandle['destroy']>;
} => ({ ...commands(), state$: new BehaviorSubject(state()), destroy: vi.fn<BomViewHandle['destroy']>() });

export const editableState = (): BomViewState =>
  state({
    editor: {
      phase: 'success',
      saving: false,
      error: null,
      value: {
        occurrenceId: 'draft',
        qty: '2',
        componentScrap: '0',
        operationSeq: 10,
        effectiveFrom: context.asOfDate,
        effectiveTo: null,
        editable: true,
        readOnlyReason: null
      }
    }
  });
