import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideHouse as House, LucideListTodo as ListTodo, LucideDynamicIcon, type LucideIcon } from '@lucide/angular';

interface LinkMenuItem {
  type: 'link';
  title: string;
  path: string;
  icon: LucideIcon;
}

interface DividerMenuItem {
  type: 'divider';
  title: string;
}

type MenuItem = LinkMenuItem | DividerMenuItem;

@Component({
  selector: 'app-menu',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  template: `
    <ul class="menu bg-base-200 rounded-box w-full p-1">
      @for (item of menus; track item.type === 'link' ? item.path : item.title) {
        @if (item.type === 'divider') {
          <li class="menu-title">
            <span class="rxdb-menu-item">{{ item.title }}</span>
          </li>
        } @else {
          <li>
            <a [routerLink]="item.path" routerLinkActive="menu-active">
              <svg [lucideIcon]="item.icon" size="16"></svg>
              <span class="rxdb-menu-item">{{ item.title }}</span>
            </a>
          </li>
        }
      }
    </ul>
  `,
  styles: [
    `
      .menu-title {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.3s ease-in-out;
        overflow: hidden;
        > * {
          overflow: hidden;
        }
      }
      .rxdb-menu-item {
        opacity: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        transition: opacity 0.3s ease-in-out;
      }
      :has(.left-menu-pinned) :host {
        .menu-title {
          grid-template-rows: 1fr;
        }
        .rxdb-menu-item {
          opacity: 1;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppMenu {
  readonly menus = [
    {
      type: 'link',
      title: 'Home',
      path: '/home',
      icon: House
    },
    {
      type: 'divider',
      title: 'Todo Examples'
    },
    {
      type: 'link',
      title: 'Todo (findAll)',
      path: '/todo',
      icon: ListTodo
    },
    {
      type: 'link',
      title: 'Todo (cursor)',
      path: '/todo-cursor',
      icon: ListTodo
    }
  ] satisfies readonly MenuItem[];
}
