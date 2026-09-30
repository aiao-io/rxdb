import { describe, expect, it, vi } from 'vitest';
import { CellTooltipManager, computeTooltipPosition } from '../../../entity-table/vtable/table-tooltip.js';

function makeContainer(left: number, top: number): HTMLElement {
  return {
    getBoundingClientRect: () => ({ left, top, right: left + 400, bottom: top + 300, width: 400, height: 300 })
  } as unknown as HTMLElement;
}

describe('computeTooltipPosition', () => {
  it('returns null when container is null', () => {
    expect(computeTooltipPosition(null, { x: 10, y: 20, height: 24 })).toBeNull();
  });

  it('returns null when rect is null', () => {
    expect(computeTooltipPosition(makeContainer(0, 0), null)).toBeNull();
  });

  it('returns null when rect lacks x and left', () => {
    expect(computeTooltipPosition(makeContainer(0, 0), { y: 10, height: 24 })).toBeNull();
  });

  it('calculates absolute position using x/y properties', () => {
    const container = makeContainer(100, 50);
    const result = computeTooltipPosition(container, { x: 10, y: 20, height: 24 });
    expect(result).not.toBeNull();
    // x = containerLeft + rect.x = 100 + 10 = 110
    expect(result!.x).toBe(110);
    // y = containerTop + rect.y + height + 4 = 50 + 20 + 24 + 4 = 98
    expect(result!.y).toBe(98);
  });

  it('falls back to left/top properties', () => {
    const container = makeContainer(100, 50);
    const result = computeTooltipPosition(container, { left: 10, top: 20, height: 24 });
    expect(result).not.toBeNull();
    expect(result!.x).toBe(110);
    expect(result!.y).toBe(98);
  });

  it('calculates height from bottom when height is absent', () => {
    const container = makeContainer(0, 0);
    const result = computeTooltipPosition(container, { x: 0, y: 10, bottom: 34 });
    // height = bottom - y = 34 - 10 = 24, y_result = 0 + 10 + 24 + 4 = 38
    expect(result!.y).toBe(38);
  });

  it('uses default height 20 when height and bottom are absent', () => {
    const container = makeContainer(0, 0);
    const result = computeTooltipPosition(container, { x: 0, y: 10 });
    // height = 20, y_result = 0 + 10 + 20 + 4 = 34
    expect(result!.y).toBe(34);
  });
});

// ── CellTooltipManager ──────────────────────────────────────────────────────

type MockTable = {
  getCellRect: ReturnType<typeof vi.fn>;
  getContainer: ReturnType<typeof vi.fn>;
};

function makeTable(): MockTable {
  return {
    getCellRect: vi.fn().mockReturnValue({ x: 10, y: 20, height: 24 }),
    getContainer: vi.fn().mockReturnValue({
      getBoundingClientRect: () => ({ left: 0, top: 0 })
    })
  };
}

describe('CellTooltipManager', () => {
  it('showError sets tooltip after 800ms delay', () => {
    vi.useFakeTimers();
    const mgr = new CellTooltipManager();
    const table = makeTable();
    const setTooltip = vi.fn();

    mgr.showError(table as never, 1, 2, 'error msg', setTooltip);
    expect(setTooltip).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);
    expect(setTooltip).toHaveBeenCalledOnce();
    expect(setTooltip).toHaveBeenCalledWith(expect.objectContaining({ content: 'error msg' }));
    vi.useRealTimers();
    mgr.cleanup();
  });

  it('showError respects custom delay', () => {
    vi.useFakeTimers();
    const mgr = new CellTooltipManager();
    const table = makeTable();
    const setTooltip = vi.fn();

    mgr.showError(table as never, 1, 2, 'error msg', setTooltip, 400);
    vi.advanceTimersByTime(400);
    expect(setTooltip).toHaveBeenCalledOnce();
    vi.useRealTimers();
    mgr.cleanup();
  });

  it('showError does not fire if cell changed before timeout', () => {
    vi.useFakeTimers();
    const mgr = new CellTooltipManager();
    const table = makeTable();
    const setTooltip = vi.fn();

    mgr.showError(table as never, 1, 2, 'error', setTooltip);
    mgr.showError(table as never, 3, 4, 'other', setTooltip);
    vi.advanceTimersByTime(800);
    // only the second call's content should fire
    expect(setTooltip).toHaveBeenCalledWith(expect.objectContaining({ content: 'other' }));
    vi.useRealTimers();
    mgr.cleanup();
  });

  it('hide clears tooltip', () => {
    vi.useFakeTimers();
    const mgr = new CellTooltipManager();
    const table = makeTable();
    const setTooltip = vi.fn();

    mgr.showError(table as never, 1, 2, 'error', vi.fn());
    vi.advanceTimersByTime(800);

    mgr.hide(setTooltip);
    expect(setTooltip).toHaveBeenCalledWith(null);
    vi.useRealTimers();
    mgr.cleanup();
  });

  it('hide resets tooltip without prior show', () => {
    const mgr = new CellTooltipManager();
    const setTooltip = vi.fn();
    mgr.hide(setTooltip);
    expect(setTooltip).toHaveBeenCalledWith(null);
  });

  it('cleanup stops pending timers', () => {
    vi.useFakeTimers();
    const mgr = new CellTooltipManager();
    const table = makeTable();
    const setTooltip = vi.fn();

    mgr.showError(table as never, 1, 2, 'error', setTooltip);
    mgr.cleanup();
    vi.advanceTimersByTime(1000);
    expect(setTooltip).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('showError falls back to x:0,y:0 when getContainer is absent', () => {
    vi.useFakeTimers();
    const mgr = new CellTooltipManager();
    const table = {
      getCellRect: vi.fn().mockReturnValue({ x: 10 })
    } as unknown as MockTable;
    const setTooltip = vi.fn();

    mgr.showError(table as never, 1, 2, 'msg', setTooltip);
    vi.advanceTimersByTime(800);
    expect(setTooltip).toHaveBeenCalledWith({ x: 0, y: 0, content: 'msg' });
    vi.useRealTimers();
    mgr.cleanup();
  });
});
