import { describe, expect, it, vi } from 'vitest';
import { handleKeydown, handleKeyup, type KeyboardContext, type SpaceHoldState } from '../designer-keyboard';

function createEvent(overrides: Partial<KeyboardEvent> & { key?: string; code?: string }): KeyboardEvent {
  const target = overrides.target ?? document.createElement('div');
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    target,
    ...overrides
  } as unknown as KeyboardEvent;
}

function createCtx(overrides?: Partial<KeyboardContext>): KeyboardContext {
  return {
    interactionMode: vi.fn(() => 'select' as const),
    setInteractionMode: vi.fn(),
    viewMode: vi.fn(() => 'canvas' as const),
    undoCount: vi.fn(() => 1),
    redoCount: vi.fn(() => 1),
    selectedEntityIds: vi.fn(() => new Set<string>()),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onEntitiesDeleted: vi.fn(),
    ...overrides
  };
}

function createState(overrides?: Partial<SpaceHoldState>): SpaceHoldState {
  return { isSpacePressed: false, ...overrides };
}

describe('handleKeydown', () => {
  it('Space 在 select 模式下切换到 move', () => {
    const ctx = createCtx();
    const state = createState();
    const e = createEvent({ code: 'Space' });

    handleKeydown(e, ctx, state);

    expect(state.isSpacePressed).toBe(true);
    expect(state.tempModeBeforeSpace).toBe('select');
    expect(ctx.setInteractionMode).toHaveBeenCalledWith('move');
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Space 在 move 模式下不切换', () => {
    const ctx = createCtx({ interactionMode: vi.fn(() => 'move' as const) });
    const state = createState();
    const e = createEvent({ code: 'Space' });

    handleKeydown(e, ctx, state);

    expect(state.isSpacePressed).toBe(true);
    expect(state.tempModeBeforeSpace).toBe('move');
    expect(ctx.setInteractionMode).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('Space 已按下时不重复触发', () => {
    const ctx = createCtx();
    const state = createState({ isSpacePressed: true, tempModeBeforeSpace: 'select' });
    const e = createEvent({ code: 'Space' });

    handleKeydown(e, ctx, state);

    expect(ctx.setInteractionMode).not.toHaveBeenCalled();
  });

  it('Space 在输入框中不触发', () => {
    const ctx = createCtx();
    const state = createState();
    const input = document.createElement('input');
    const e = createEvent({ code: 'Space', target: input });

    handleKeydown(e, ctx, state);

    expect(state.isSpacePressed).toBe(false);
    expect(ctx.setInteractionMode).not.toHaveBeenCalled();
  });

  it('Cmd+Z 触发 undo', () => {
    const ctx = createCtx();
    const state = createState();
    const e = createEvent({ key: 'z', metaKey: true });

    handleKeydown(e, ctx, state);

    expect(ctx.onUndo).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Ctrl+Z 触发 undo', () => {
    const ctx = createCtx();
    const state = createState();
    const e = createEvent({ key: 'z', ctrlKey: true });

    handleKeydown(e, ctx, state);

    expect(ctx.onUndo).toHaveBeenCalled();
  });

  it('Cmd+Z undoCount 为 0 时不触发但仍然 preventDefault', () => {
    const ctx = createCtx({ undoCount: vi.fn(() => 0) });
    const state = createState();
    const e = createEvent({ key: 'z', metaKey: true });

    handleKeydown(e, ctx, state);

    expect(ctx.onUndo).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Cmd+Shift+Z 触发 redo', () => {
    const ctx = createCtx();
    const state = createState();
    const e = createEvent({ key: 'z', metaKey: true, shiftKey: true });

    handleKeydown(e, ctx, state);

    expect(ctx.onRedo).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Cmd+Y 触发 redo', () => {
    const ctx = createCtx();
    const state = createState();
    const e = createEvent({ key: 'y', metaKey: true });

    handleKeydown(e, ctx, state);

    expect(ctx.onRedo).toHaveBeenCalled();
  });

  it('Cmd+Shift+Z redoCount 为 0 时不触发但仍然 preventDefault', () => {
    const ctx = createCtx({ redoCount: vi.fn(() => 0) });
    const state = createState();
    const e = createEvent({ key: 'z', metaKey: true, shiftKey: true });

    handleKeydown(e, ctx, state);

    expect(ctx.onRedo).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Delete 在 canvas 模式下删除选中实体', () => {
    const ctx = createCtx({ selectedEntityIds: vi.fn(() => new Set(['e1', 'e2'])) });
    const state = createState();
    const e = createEvent({ key: 'Delete' });

    handleKeydown(e, ctx, state);

    expect(ctx.onEntitiesDeleted).toHaveBeenCalledWith(['e1', 'e2']);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Backspace 在 canvas 模式下删除选中实体', () => {
    const ctx = createCtx({ selectedEntityIds: vi.fn(() => new Set(['e1'])) });
    const state = createState();
    const e = createEvent({ key: 'Backspace' });

    handleKeydown(e, ctx, state);

    expect(ctx.onEntitiesDeleted).toHaveBeenCalledWith(['e1']);
  });

  it('Delete 无选中实体时不触发', () => {
    const ctx = createCtx();
    const state = createState();
    const e = createEvent({ key: 'Delete' });

    handleKeydown(e, ctx, state);

    expect(ctx.onEntitiesDeleted).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('Delete 在 table 模式下不触发删除', () => {
    const ctx = createCtx({
      viewMode: vi.fn(() => 'table' as const),
      selectedEntityIds: vi.fn(() => new Set(['e1']))
    });
    const state = createState();
    const e = createEvent({ key: 'Delete' });

    handleKeydown(e, ctx, state);

    expect(ctx.onEntitiesDeleted).not.toHaveBeenCalled();
  });

  it('Delete 在输入框中不触发删除', () => {
    const ctx = createCtx({ selectedEntityIds: vi.fn(() => new Set(['e1'])) });
    const state = createState();
    const textarea = document.createElement('textarea');
    const e = createEvent({ key: 'Delete', target: textarea });

    handleKeydown(e, ctx, state);

    expect(ctx.onEntitiesDeleted).not.toHaveBeenCalled();
  });

  it('Delete 在 contenteditable 元素中不触发删除', () => {
    const ctx = createCtx({ selectedEntityIds: vi.fn(() => new Set(['e1'])) });
    const state = createState();
    const div = document.createElement('div');
    div.contentEditable = 'true';
    const e = createEvent({ key: 'Delete', target: div });

    handleKeydown(e, ctx, state);

    expect(ctx.onEntitiesDeleted).not.toHaveBeenCalled();
  });
});

describe('handleKeyup', () => {
  it('释放 Space 恢复 select 模式', () => {
    const ctx = createCtx();
    const state = createState({ isSpacePressed: true, tempModeBeforeSpace: 'select' });
    const e = createEvent({ code: 'Space' });

    handleKeyup(e, ctx, state);

    expect(state.isSpacePressed).toBe(false);
    expect(state.tempModeBeforeSpace).toBeUndefined();
    expect(ctx.setInteractionMode).toHaveBeenCalledWith('select');
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('释放 Space 从 move 模式不恢复', () => {
    const ctx = createCtx();
    const state = createState({ isSpacePressed: true, tempModeBeforeSpace: 'move' });
    const e = createEvent({ code: 'Space' });

    handleKeyup(e, ctx, state);

    expect(state.isSpacePressed).toBe(false);
    expect(ctx.setInteractionMode).not.toHaveBeenCalled();
  });

  it('Space 未按下时 keyup 不处理', () => {
    const ctx = createCtx();
    const state = createState({ isSpacePressed: false });
    const e = createEvent({ code: 'Space' });

    handleKeyup(e, ctx, state);

    expect(ctx.setInteractionMode).not.toHaveBeenCalled();
  });

  it('非 Space 键的 keyup 不处理', () => {
    const ctx = createCtx();
    const state = createState({ isSpacePressed: true, tempModeBeforeSpace: 'select' });
    const e = createEvent({ code: 'KeyA' });

    handleKeyup(e, ctx, state);

    expect(state.isSpacePressed).toBe(true);
    expect(ctx.setInteractionMode).not.toHaveBeenCalled();
  });
});
