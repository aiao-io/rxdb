import { Todo } from '@aiao/rxdb-test/entities';

/**
 * 生成测试用的 Todo 实体数组
 *
 * @param count - 要生成的数量
 * @param prefix - 标题前缀
 */
export function generateTodos(count: number, prefix = 'todo'): Todo[] {
  return Array.from({ length: count }, (_, i) => {
    const todo = new Todo();
    todo.title = `${prefix}-${i}`;
    todo.completed = i % 3 === 0;
    return todo;
  });
}

/**
 * 生成用于搜索的随机词项（基于索引循环选择）
 */
export function randomSearchTerm(index: number): string {
  const terms = ['todo', 'task', 'item', 'work', 'test'];
  return terms[index % terms.length];
}
