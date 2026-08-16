import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideFolderOpen as FolderOpen,
  LucideHouse as House,
  LucideListTodo as ListTodo,
  LucideDynamicIcon,
  LucideMousePointerClick as MousePointerClick
} from '@lucide/angular';

@Component({
  selector: 'app-menu',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  template: `
    <ul class="menu bg-base-200 rounded-box w-full p-1">
      @for (item of menus; track $index) {
        @if (item.type === 'divider') {
          <li class="menu-title">
            <span class="rxdb-menu-item">{{ item.title }}</span>
          </li>
        } @else {
          <li>
            <a [routerLink]="item.path" routerLinkActive="menu-active">
              <svg [lucideIcon]="item.icon!" size="16"></svg>
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
/** 侧边栏导航菜单：每条 `link` 对应 `app.routes.ts` 里的一条路由。 */
export class AppMenu {
  /**
   * 菜单项。
   *
   * @remarks
   * 必须与 `appRoutes` 保持一一对应：Tauri 窗口默认**没有地址栏**，
   * 有路由而无菜单入口的页面在桌面端等于不存在（`/todo-cursor` 曾如此）。
   */
  menus = [
    {
      type: 'link',
      title: 'Home',
      path: '/home',
      icon: House
    },
    {
      type: 'link',
      title: 'Storage',
      path: '/storage',
      icon: FolderOpen
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
      icon: MousePointerClick
    }
  ];
}
