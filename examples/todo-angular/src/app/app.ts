import { Component } from '@angular/core';
import { TodoPage } from './todo.page';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TodoPage],
  template: '<ao-todo-page />'
})
export class App {}
