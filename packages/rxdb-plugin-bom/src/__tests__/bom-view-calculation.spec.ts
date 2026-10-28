import { RxDB, SyncType } from '@aiao/rxdb';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rxDBPluginBom } from '../plugin.js';
import { BomQuantityError } from '../types.js';
import { loadViewOccurrence, saveViewOccurrence } from '../view-editor.js';
import { createBomView } from '../view-state.js';
import type { BomLineEditorValue, BomViewInput, BomViewSnapshot, BomViewState } from '../view-types.js';
import { readBomViewSnapshot } from '../view.js';

vi.mock('../view-editor.js', () => ({ loadViewOccurrence: vi.fn(), saveViewOccurrence: vi.fn() }));
vi.mock('../view.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../view.js')>()),
  readBomViewSnapshot: vi.fn()
}));

const input: BomViewInput = {
  context: { bomType: 'ebom', orgId: 'test', asOfDate: new Date('2026-01-01') },
  target: { parentItemId: 'root' },
  plannedQty: { value: '1', uom: 'pcs' }
};
const value: BomLineEditorValue = {
  occurrenceId: 'line',
  qty: '1',
  componentScrap: '0',
  operationSeq: null,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  editable: true,
  readOnlyReason: null
};
const snapshot: BomViewSnapshot = {
  expansion: {
    context: input.context,
    truncated: null,
    nodes: [
      {
        path: [],
        depth: 0,
        itemId: 'root',
        revisionId: 'rev',
        occurrenceId: null,
        qty: null,
        lineNo: null,
        effectiveFrom: null,
        effectiveTo: null
      }
    ]
  },
  explosion: null,
  quantityError: null,
  items: [{ id: 'root', itemNo: 'ROOT', description: null }],
  refreshing: false
};
const db = new RxDB({ dbName: 'view-calculation', entities: [], sync: { type: SyncType.None } });
db.use(rxDBPluginBom);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadViewOccurrence).mockResolvedValue(value);
});

describe('BOM 计算与错误状态', () => {
  it('计算等保存落定后才读取快照', async () => {
    let finish!: (saved: BomLineEditorValue) => void;
    vi.mocked(saveViewOccurrence).mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const failure = new BomQuantityError('受控数量错误');
    vi.mocked(readBomViewSnapshot).mockResolvedValue({ ...snapshot, quantityError: failure });
    const view = createBomView(db, input);
    try {
      await view.loadOccurrence('line');
      const saving = view.saveOccurrence({ qty: '2' });
      const calculation = view.calculate();
      const rejected = expect(calculation).rejects.toBe(failure);
      await Promise.resolve();
      expect(readBomViewSnapshot).not.toHaveBeenCalled();
      finish({ ...value, qty: '2' });
      await saving;
      await rejected;
      expect(readBomViewSnapshot).toHaveBeenCalledOnce();
    } finally {
      view.destroy();
    }
  });

  it('根级数量错误保留根节点，不标为空数据', () => {
    const source = new BehaviorSubject({ ...snapshot, quantityError: new BomQuantityError('缺少单位换算') });
    const watch = vi.spyOn(db.bom, 'watchView').mockReturnValue(source);
    const view = createBomView(db, input);
    const states: BomViewState[] = [];
    const subscription = view.state$.subscribe(state => states.push(state));
    try {
      expect(states.at(-1)).toMatchObject({ phase: 'success', quantityError: source.value.quantityError });
      expect(states.at(-1)?.nodes).toHaveLength(1);
    } finally {
      subscription.unsubscribe();
      view.destroy();
      watch.mockRestore();
    }
  });
});
