import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideHouse as House, LucideListTodo as ListTodo, LucideDynamicIcon, LucideIcon } from '@lucide/angular';

/**
 * 可点击的菜单项：一定有 `path` 与 `icon`。
 *
 * `icon` 是 `LucideIcon`（带静态 `icon` 成员的组件类）而不是 `LucideIconData`——
 * `LucideHouse` 等具名导出是组件类本身，图标数据挂在它的 `static readonly icon` 上。
 * 标成 `LucideIconData` 会在 AOT 模板检查阶段报 TS2741（缺 `node` 属性）。
 */
interface MenuLink {
  type: 'link';
  title: string;
  path: string;
  icon: LucideIcon;
}

/** 分组标题：只有文字，没有 `path`/`icon`。 */
interface MenuDivider {
  type: 'divider';
  title: string;
}

/**
 * ELEC-19：菜单项建模为判别式联合。
 *
 * 早先是一个字面量数组，`icon` 被推断成可选，模板里只能靠
 * `[lucideIcon]="item.icon!"` 的非空断言压下去 —— 而 `@if (item.type === 'divider')`
 * 分支恰恰是那个 `icon` 真的不存在的分支。断言把「哪个分支有 icon」这件事
 * 从编译器手里拿走了；判别式联合让 `@else` 分支里的 `item` 自动收窄为 `MenuLink`。
 */
type MenuItem = MenuLink | MenuDivider;

/** 侧边栏导航菜单，渲染 {@link MenuItem} 列表。 */
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
  menus: readonly MenuItem[] = [
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
  ];
}
