import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideArchiveRestore as ArchiveRestore,
  LucideCloud as Cloud,
  LucideCode as Code,
  LucideDatabase as Database,
  LucideFactory as Factory,
  LucideFolderOpen as FolderOpen,
  LucideFolderTree as FolderTree,
  LucideGitMerge as GitMerge,
  LucideGrid3x3 as Grid3x3,
  LucideHouse as House,
  LucideLayers as Layers,
  LucideListTodo as ListTodo,
  LucideListTree as ListTree,
  LucideLock as Lock,
  LucideDynamicIcon,
  LucideSearch as Search,
  LucideVideo as Video,
  type LucideIconInput
} from '@lucide/angular';
import { AppService } from '../app.service';

interface MenuChild {
  title: string;
  path: string;
}

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
        } @else if (item.type === 'group') {
          <!-- 分组（details 原生折叠）：Tree Menu / File Manager 等重复命名收进折叠组 -->
          <li [class.rail-hidden]="!app.$sidebarPinned()">
            <details open>
              <summary>
                <svg [lucideIcon]="item.icon!" size="16"></svg>
                <span class="rxdb-menu-item">{{ item.title }}</span>
              </summary>
              <ul>
                @for (child of item.children; track child.path) {
                  <li>
                    <a [routerLink]="child.path" routerLinkActive="menu-active">
                      <span class="rxdb-menu-item">{{ child.title }}</span>
                    </a>
                  </li>
                }
              </ul>
            </details>
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
      /* 折叠轨（48px）里分组子项没有图标，整组收起避免空白行 */
      .rail-hidden details > ul {
        display: none;
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
  readonly app = inject(AppService);

  menus: Array<
    | { type: 'divider'; title: string }
    | { type: 'group'; title: string; icon: LucideIconInput; children: MenuChild[] }
    | { type: 'link'; title: string; path: string; icon: LucideIconInput }
  > = [
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
    },
    {
      type: 'divider',
      title: 'Components'
    },
    {
      type: 'group',
      title: 'Tree Menu',
      icon: ListTree,
      children: [
        { title: 'Simple', path: '/menu-simple' },
        { title: 'Virtual Scroll', path: '/menu-virtual' },
        { title: 'Lazy Load', path: '/menu-lazy' }
      ]
    },
    {
      type: 'group',
      title: 'File Manager',
      icon: FolderTree,
      children: [
        { title: 'Simple', path: '/file-manager-simple' },
        { title: 'Virtual Scroll', path: '/file-manager-virtual' },
        { title: 'Lazy Load', path: '/file-manager-lazy' }
      ]
    },
    {
      type: 'link',
      title: 'AG Grid',
      path: '/ag-grid',
      icon: Grid3x3
    },
    {
      type: 'divider',
      title: 'Entity Model'
    },
    {
      type: 'link',
      title: 'Entities',
      path: '/entities',
      icon: ListTodo
    },
    {
      type: 'link',
      title: 'BOM 编辑与展开',
      path: '/bom-view',
      icon: ListTree
    },
    {
      type: 'link',
      title: 'Code Editor',
      path: '/code-editor',
      icon: Code
    },
    {
      type: 'link',
      title: 'Generator',
      path: '/generator',
      icon: Factory
    },
    {
      type: 'divider',
      title: 'Search'
    },
    {
      type: 'link',
      title: 'Global Search',
      path: '/search',
      icon: Search
    },
    {
      type: 'divider',
      title: 'Storage'
    },
    {
      type: 'link',
      title: 'OPFS Manager',
      path: '/opfs',
      icon: FolderOpen
    },
    {
      type: 'link',
      title: 'Storage',
      path: '/storage',
      icon: Database
    },
    {
      type: 'link',
      title: 'Remote Cache',
      path: '/remote-cache',
      icon: Cloud
    },
    {
      type: 'divider',
      title: 'Workspace'
    },
    {
      type: 'link',
      title: 'Draft Recovery',
      path: '/workspace',
      icon: Layers
    },
    {
      type: 'link',
      title: 'Working Tree',
      path: '/working-tree',
      icon: GitMerge
    },
    {
      type: 'link',
      title: '失败归档导入',
      path: '/failure-archive',
      icon: ArchiveRestore
    },
    {
      type: 'link',
      title: '录制回放',
      path: '/replay',
      icon: Video
    },
    {
      type: 'divider',
      title: '安全'
    },
    {
      type: 'link',
      title: '字段加密',
      path: '/encrypted',
      icon: Lock
    }
  ];
}
