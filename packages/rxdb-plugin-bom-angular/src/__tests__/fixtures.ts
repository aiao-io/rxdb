import { initialBomViewState, type BomViewCommands, type BomViewNode, type BomViewState } from '@aiao/rxdb-plugin-bom';
import { vi } from 'vitest';

export const viewState = (overrides: Partial<BomViewState> = {}): BomViewState => ({
  ...initialBomViewState(),
  phase: 'loading',
  ...overrides
});

export const viewNode = (path: string[], overrides: Partial<BomViewNode> = {}): BomViewNode => ({
  key: JSON.stringify(path),
  path,
  depth: path.length,
  itemId: 'part',
  revisionId: 'revision',
  occurrenceId: path.at(-1) ?? null,
  qty: path.length === 0 ? null : '2',
  lineNo: path.length === 0 ? null : 10,
  effectiveFrom: path.length === 0 ? null : new Date('2026-01-01T00:00:00Z'),
  effectiveTo: null,
  itemNo: path.length === 0 ? 'BOM-ROOT' : 'BOM-PART',
  description: null,
  quantity: { value: '2', uom: 'pcs' },
  hasChildren: path.length === 0,
  expanded: path.length === 0,
  ...overrides
});

export const viewCommands = (): BomViewCommands => ({
  setInput: vi.fn(),
  refresh: vi.fn(),
  toggle: vi.fn(),
  loadOccurrence: vi.fn(async () => undefined),
  saveOccurrence: vi.fn(async () => undefined),
  calculate: vi.fn(async () => {
    throw new Error('测试未提供完整数量结果');
  })
});

export const editorState = (editable = true): BomViewState =>
  viewState({
    phase: 'success',
    editor: {
      phase: 'success',
      saving: false,
      error: null,
      value: {
        occurrenceId: 'occurrence-1',
        qty: '2',
        componentScrap: '0',
        operationSeq: null,
        effectiveFrom: new Date('2099-01-01T00:00:00Z'),
        effectiveTo: null,
        editable,
        readOnlyReason: editable ? null : '已发布发生项只读，请通过 ECN 创建新发生项'
      }
    }
  });
