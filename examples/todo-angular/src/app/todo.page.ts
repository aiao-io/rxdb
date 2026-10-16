import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import type { EntityStaticType } from '@aiao/rxdb';
import { useFindAll, useRxDB } from '@aiao/rxdb-angular';
import { FormsModule } from '@angular/forms';
import { Todo } from './todo';

type Filter = 'all' | 'active' | 'completed';

@Component({
  selector: 'ao-todo-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './todo.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TodoPage {
  readonly rxdb = useRxDB();
  readonly filters: Filter[] = ['all', 'active', 'completed'];
  readonly title = signal('');
  readonly filter = signal<Filter>('all');

  readonly options = computed<EntityStaticType<typeof Todo, 'findAllOptions'>>(() => ({
    where: {
      combinator: 'and',
      rules:
        this.filter() === 'all'
          ? []
          : [{ field: 'completed', operator: '=', value: this.filter() === 'completed' }]
    },
    orderBy: [
      { field: 'completed', sort: 'asc' },
      { field: 'createdAt', sort: 'desc' }
    ]
  }));

  readonly todos = useFindAll(Todo, this.options);

  readonly remaining = computed(() => this.todos.value().filter(todo => !todo.completed).length);
  readonly completedTodos = computed(() => this.todos.value().filter(todo => todo.completed));
  readonly allCompleted = computed(
    () => this.todos.value().length > 0 && this.todos.value().every(todo => todo.completed)
  );

  async add(event: Event) {
    event.preventDefault();
    const text = this.title().trim();
    if (!text) return;
    await new Todo({ title: text }).save();
    this.title.set('');
  }

  async toggle(todo: Todo) {
    todo.completed = !todo.completed;
    await todo.save();
  }

  async remove(todo: Todo) {
    await todo.remove();
  }

  async toggleAll() {
    const done = this.allCompleted();
    const targets = this.todos.value().filter(todo => todo.completed === done);
    for (const todo of targets) todo.completed = !done;
    await this.rxdb.entityManager.saveMany(targets);
  }

  async clearCompleted() {
    await this.rxdb.entityManager.removeMany(this.completedTodos());
  }

  setFilter(filter: Filter) {
    this.filter.set(filter);
  }
}
