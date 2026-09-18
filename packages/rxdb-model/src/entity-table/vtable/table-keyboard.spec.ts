// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { KeyboardHandlerContext } from './table-keyboard.js';
import { handleTableKeydown } from './table-keyboard.js';

function makeCtx(overrides: Partial<KeyboardHandlerContext> = {}): KeyboardHandlerContext {
  return {
    getTable: vi.fn().mockReturnValue({
      editorManager: { editingEditor: null },
      getRecordByCell: vi.fn(),
      setCellSwitchState: vi.fn()
    }),
    getSelectedCell: vi.fn().mockReturnValue(null),
    getColDef: vi.fn().mockReturnValue(undefined),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onDelete: vi.fn(),
    onCellChange: vi.fn(),
    ...overrides
  };
}

function makeKeyEvent(key: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  vi.spyOn(e, 'preventDefault');
  vi.spyOn(e, 'stopPropagation');
  return e;
}

// ── Ctrl+C ─────────────────────────────────────────────────────────────────

describe('handleTableKeydown — Ctrl+C', () => {
  it('calls onCopy and preventDefault', () => {
    const ctx = makeCtx();
    const e = makeKeyEvent('c', { ctrlKey: true });
    handleTableKeydown(ctx, e);
    expect(ctx.onCopy).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('does not copy when editing', () => {
    const ctx = makeCtx({
      getTable: vi.fn().mockReturnValue({ editorManager: { editingEditor: {} } })
    });
    const e = makeKeyEvent('c', { ctrlKey: true });
    handleTableKeydown(ctx, e);
    expect(ctx.onCopy).not.toHaveBeenCalled();
  });

  it('responds to metaKey (macOS)', () => {
    const ctx = makeCtx();
    const e = makeKeyEvent('c', { metaKey: true });
    handleTableKeydown(ctx, e);
    expect(ctx.onCopy).toHaveBeenCalledOnce();
  });
});

// ── Ctrl+V ─────────────────────────────────────────────────────────────────

describe('handleTableKeydown — Ctrl+V', () => {
  it('calls onPaste and preventDefault', () => {
    const ctx = makeCtx();
    const e = makeKeyEvent('v', { ctrlKey: true });
    handleTableKeydown(ctx, e);
    expect(ctx.onPaste).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('does not paste when editing', () => {
    const ctx = makeCtx({
      getTable: vi.fn().mockReturnValue({ editorManager: { editingEditor: {} } })
    });
    const e = makeKeyEvent('v', { ctrlKey: true });
    handleTableKeydown(ctx, e);
    expect(ctx.onPaste).not.toHaveBeenCalled();
  });
});

// ── Delete / Backspace ──────────────────────────────────────────────────────

describe('handleTableKeydown — Delete/Backspace', () => {
  it('calls onDelete for Delete key', () => {
    const ctx = makeCtx();
    const e = makeKeyEvent('Delete');
    handleTableKeydown(ctx, e);
    expect(ctx.onDelete).toHaveBeenCalledOnce();
    expect(e.stopPropagation).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('calls onDelete for Backspace key', () => {
    const ctx = makeCtx();
    const e = makeKeyEvent('Backspace');
    handleTableKeydown(ctx, e);
    expect(ctx.onDelete).toHaveBeenCalledOnce();
  });

  it('does not delete when editing', () => {
    const ctx = makeCtx({
      getTable: vi.fn().mockReturnValue({ editorManager: { editingEditor: {} } })
    });
    const e = makeKeyEvent('Delete');
    handleTableKeydown(ctx, e);
    expect(ctx.onDelete).not.toHaveBeenCalled();
  });
});

// ── Toggle (Enter / Space) ─────────────────────────────────────────────────

describe('handleTableKeydown — toggle cell', () => {
  it('toggles switch cell on Enter', () => {
    const setCellSwitchState = vi.fn();
    const ctx = makeCtx({
      getTable: vi.fn().mockReturnValue({
        editorManager: { editingEditor: null },
        getRecordByCell: vi.fn().mockReturnValue({ _readonly: false, active: true }),
        setCellSwitchState
      }),
      getSelectedCell: vi.fn().mockReturnValue({ col: 1, row: 1 }),
      getColDef: vi.fn().mockReturnValue({ cellType: 'switch', field: 'active' })
    });
    const e = makeKeyEvent('Enter');
    handleTableKeydown(ctx, e);
    expect(setCellSwitchState).toHaveBeenCalledWith(1, 1, false);
    expect(ctx.onCellChange).toHaveBeenCalledWith(1, 1, false);
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('toggles checkbox cell on Space', () => {
    const setCellSwitchState = vi.fn();
    const ctx = makeCtx({
      getTable: vi.fn().mockReturnValue({
        editorManager: { editingEditor: null },
        getRecordByCell: vi.fn().mockReturnValue({ checked: false }),
        setCellSwitchState
      }),
      getSelectedCell: vi.fn().mockReturnValue({ col: 2, row: 3 }),
      getColDef: vi.fn().mockReturnValue({ cellType: 'checkbox', field: 'checked' })
    });
    const e = makeKeyEvent(' ');
    handleTableKeydown(ctx, e);
    expect(setCellSwitchState).toHaveBeenCalledWith(2, 3, true);
    expect(ctx.onCellChange).toHaveBeenCalledWith(2, 3, true);
  });

  it('does not toggle readonly record', () => {
    const ctx = makeCtx({
      getTable: vi.fn().mockReturnValue({
        editorManager: { editingEditor: null },
        getRecordByCell: vi.fn().mockReturnValue({ _readonly: true, active: false }),
        setCellSwitchState: vi.fn()
      }),
      getSelectedCell: vi.fn().mockReturnValue({ col: 1, row: 1 }),
      getColDef: vi.fn().mockReturnValue({ cellType: 'switch', field: 'active' })
    });
    const e = makeKeyEvent('Enter');
    handleTableKeydown(ctx, e);
    expect(ctx.onCellChange).not.toHaveBeenCalled();
  });

  it('ignores non-toggle cell types', () => {
    const ctx = makeCtx({
      getSelectedCell: vi.fn().mockReturnValue({ col: 1, row: 1 }),
      getColDef: vi.fn().mockReturnValue({ cellType: 'text', field: 'name' })
    });
    const e = makeKeyEvent('Enter');
    handleTableKeydown(ctx, e);
    expect(ctx.onCellChange).not.toHaveBeenCalled();
  });

  it('ignores when no cell is selected', () => {
    const ctx = makeCtx();
    const e = makeKeyEvent('Enter');
    handleTableKeydown(ctx, e);
    expect(ctx.onCellChange).not.toHaveBeenCalled();
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('handleTableKeydown — edge cases', () => {
  it('does nothing when table is null', () => {
    const ctx = makeCtx({ getTable: vi.fn().mockReturnValue(null) });
    const e = makeKeyEvent('c', { ctrlKey: true });
    handleTableKeydown(ctx, e);
    expect(ctx.onCopy).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    const ctx = makeCtx();
    const e = makeKeyEvent('a');
    handleTableKeydown(ctx, e);
    expect(ctx.onCopy).not.toHaveBeenCalled();
    expect(ctx.onPaste).not.toHaveBeenCalled();
    expect(ctx.onDelete).not.toHaveBeenCalled();
    expect(ctx.onCellChange).not.toHaveBeenCalled();
  });
});
