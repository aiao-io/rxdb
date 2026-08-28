import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
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
  LucideSearch as Search
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
export class AppMenu {
  menus = [
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
      title: 'Workspace'
    },
    {
      type: 'link',
      title: 'Draft Recovery',
      path: '/workspace',
      icon: Layers
    },
    {
      type: 'divider',
      title: 'Tree Menu'
    },
    {
      type: 'link',
      title: 'Simple',
      path: '/menu-simple',
      icon: ListTree
    },
    {
      type: 'link',
      title: 'Virtual Scroll',
      path: '/menu-virtual',
      icon: ListTree
    },
    {
      type: 'link',
      title: 'Lazy Load',
      path: '/menu-lazy',
      icon: ListTree
    },
    {
      type: 'divider',
      title: 'File Manager'
    },
    {
      type: 'link',
      title: 'Simple',
      path: '/file-manager-simple',
      icon: FolderTree
    },
    {
      type: 'link',
      title: 'Virtual Scroll',
      path: '/file-manager-virtual',
      icon: FolderTree
    },
    {
      type: 'link',
      title: 'Lazy Load',
      path: '/file-manager-lazy',
      icon: FolderTree
    },
    {
      type: 'divider',
      title: 'Entity query'
    },
    {
      type: 'link',
      title: 'Global Search',
      path: '/search',
      icon: Search
    },
    {
      type: 'divider',
      title: 'Branch'
    },
    {
      type: 'link',
      title: 'Branch Manager',
      path: '/branch-manager',
      icon: GitMerge
    },
    {
      type: 'divider',
      title: 'Advanced'
    },
    {
      type: 'link',
      title: 'AG Grid',
      path: '/ag-grid',
      icon: Grid3x3
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
