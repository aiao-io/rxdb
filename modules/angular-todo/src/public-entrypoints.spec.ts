import { describe, expect, it } from 'vitest';
import TodoCursorPage from '../todo-cursor-page';
import TodoPage from '../todo-page';

describe('angular-todo entrypoints', () => {
  it('compiles both public page entrypoints', () => {
    expect(TodoPage).toBeDefined();
    expect(TodoCursorPage).toBeDefined();
  });
});
