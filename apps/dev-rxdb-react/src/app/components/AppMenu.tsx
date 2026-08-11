import {
  Cloud,
  Code,
  Database,
  Factory,
  FolderOpen,
  FolderTree,
  GitMerge,
  Grid3x3,
  House,
  LayersIcon,
  ListTodo,
  ListTree,
  Lock,
  Search
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface LinkMenuItem {
  type: 'link';
  title: string;
  path: string;
  icon?: React.ComponentType<{ size?: number }>;
}

interface DividerMenuItem {
  type: 'link' | 'divider';
  title: string;
}

type MenuItem = LinkMenuItem | DividerMenuItem;

function isLinkMenuItem(item: MenuItem): item is LinkMenuItem {
  return item.type === 'link';
}

const menus: MenuItem[] = [
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
    icon: LayersIcon
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

export function AppMenu() {
  return (
    <ul className='menu bg-base-200 rounded-box w-full p-1'>
      {menus.map((item, index) =>
        item.type === 'divider' ?
          <li key={index} className='menu-title'>
            <span className='rxdb-menu-item'>{item.title}</span>
          </li>
        : isLinkMenuItem(item) && (
            <li key={index}>
              <NavLink to={item.path} className={({ isActive }) => (isActive ? 'menu-active' : '')}>
                {item.icon && <item.icon size={16} />}
                <span className='rxdb-menu-item'>{item.title}</span>
              </NavLink>
            </li>
          )
      )}
    </ul>
  );
}
