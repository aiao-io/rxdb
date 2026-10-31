import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nPipe } from '../pipes/i18n.pipe';
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
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon, I18nPipe],
  template: `
    <ul class="menu bg-base-200 rounded-box w-full p-1">
      @for (item of menus; track $index) {
        @if (item.type === 'divider') {
          <li class="menu-title">
            <span class="rxdb-menu-item">{{ item.title | i18n }}</span>
          </li>
        } @else if (item.type === 'group') {
          <!-- 分组（details 原生折叠）：Tree Menu / File Manager 等重复命名收进折叠组 -->
          <li [class.rail-hidden]="!app.$sidebarPinned()">
            <details open>
              <summary>
                <svg [lucideIcon]="item.icon!" size="16"></svg>
                <span class="rxdb-menu-item">{{ item.title | i18n }}</span>
              </summary>
              <ul>
                @for (child of item.children; track child.path) {
                  <li>
                    <a [routerLink]="child.path" routerLinkActive="menu-active">
                      <span class="rxdb-menu-item">{{ child.title | i18n }}</span>
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
              <span class="rxdb-menu-item">{{ item.title | i18n }}</span>
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
      title: 'nav.home',
      path: '/home',
      icon: House
    },
    {
      type: 'divider',
      title: 'nav.section.examples'
    },
    {
      type: 'link',
      title: 'nav.todo.findAll',
      path: '/todo',
      icon: ListTodo
    },
    {
      type: 'link',
      title: 'nav.todo.cursor',
      path: '/todo-cursor',
      icon: ListTodo
    },
    {
      type: 'divider',
      title: 'nav.section.components'
    },
    {
      type: 'group',
      title: 'nav.treeMenu',
      icon: ListTree,
      children: [
        { title: 'nav.simple', path: '/menu-simple' },
        { title: 'nav.virtualScroll', path: '/menu-virtual' },
        { title: 'nav.lazyLoad', path: '/menu-lazy' }
      ]
    },
    {
      type: 'group',
      title: 'nav.fileManager',
      icon: FolderTree,
      children: [
        { title: 'nav.simple', path: '/file-manager-simple' },
        { title: 'nav.virtualScroll', path: '/file-manager-virtual' },
        { title: 'nav.lazyLoad', path: '/file-manager-lazy' }
      ]
    },
    {
      type: 'link',
      title: 'nav.agGrid',
      path: '/ag-grid',
      icon: Grid3x3
    },
    {
      type: 'divider',
      title: 'nav.section.entityModel'
    },
    {
      type: 'link',
      title: 'nav.entities',
      path: '/entities',
      icon: ListTodo
    },
    {
      type: 'link',
      title: 'nav.codeEditor',
      path: '/code-editor',
      icon: Code
    },
    {
      type: 'link',
      title: 'nav.generator',
      path: '/generator',
      icon: Factory
    },
    {
      type: 'divider',
      title: 'nav.section.search'
    },
    {
      type: 'link',
      title: 'nav.globalSearch',
      path: '/search',
      icon: Search
    },
    {
      type: 'divider',
      title: 'nav.section.storage'
    },
    {
      type: 'link',
      title: 'nav.opfsManager',
      path: '/opfs',
      icon: FolderOpen
    },
    {
      type: 'link',
      title: 'nav.storage',
      path: '/storage',
      icon: Database
    },
    {
      type: 'link',
      title: 'nav.remoteCache',
      path: '/remote-cache',
      icon: Cloud
    },
    {
      type: 'divider',
      title: 'nav.section.workspace'
    },
    {
      type: 'link',
      title: 'nav.draftRecovery',
      path: '/workspace',
      icon: Layers
    },
    {
      type: 'link',
      title: 'nav.workingTree',
      path: '/working-tree',
      icon: GitMerge
    },
    {
      type: 'link',
      title: 'nav.failureArchive',
      path: '/failure-archive',
      icon: ArchiveRestore
    },
    {
      type: 'link',
      title: 'nav.replay',
      path: '/replay',
      icon: Video
    },
    {
      type: 'divider',
      title: 'nav.section.internationalization'
    },
    {
      type: 'link',
      title: 'nav.i18nDemo',
      path: '/i18n',
      icon: Search
    },
    {
      type: 'divider',
      title: 'nav.section.security'
    },
    {
      type: 'link',
      title: 'nav.encrypted',
      path: '/encrypted',
      icon: Lock
    }
  ];
}
