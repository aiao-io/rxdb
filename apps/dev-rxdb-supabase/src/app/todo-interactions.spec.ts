import { describe, expect, it, vi } from 'vitest';
import { createTodoBatchTitles, persistCompleted, persistCompletedBatch } from './todo-interactions';

describe('todo interactions', () => {
  it('creates deterministic unique titles for one batch', () => {
    expect(createTodoBatchTitles(3, 'batch-a')).toEqual(['test-batch-a-0', 'test-batch-a-1', 'test-batch-a-2']);
  });

  it('rejects invalid batch sizes', () => {
    expect(() => createTodoBatchTitles(-1, 'batch-a')).toThrow('non-negative integer');
    expect(() => createTodoBatchTitles(1.5, 'batch-a')).toThrow('non-negative integer');
  });

  it('keeps the completed value after a successful save', async () => {
    const todo = { completed: false, save: vi.fn().mockResolvedValue(undefined) };

    await persistCompleted(todo, true);

    expect(todo.completed).toBe(true);
    expect(todo.save).toHaveBeenCalledOnce();
  });

  it('rolls the completed value back when save fails', async () => {
    const failure = new Error('save failed');
    const todo = { completed: false, save: vi.fn().mockRejectedValue(failure) };

    await expect(persistCompleted(todo, true)).rejects.toBe(failure);

    expect(todo.completed).toBe(false);
  });

  it('rolls every item back when a batch save fails', async () => {
    const failure = new Error('batch failed');
    const todos = [{ completed: false }, { completed: true }];
    const saveMany = vi.fn().mockRejectedValue(failure);

    await expect(persistCompletedBatch(todos, false, saveMany)).rejects.toBe(failure);

    expect(todos).toEqual([{ completed: false }, { completed: true }]);
  });
});
