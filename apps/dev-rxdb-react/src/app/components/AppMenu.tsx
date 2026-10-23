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
  type: 'divider';
  title: string;
}

interface GroupMenuItem {
  type: 'group';
  title: string;
  icon?: React.ComponentType<{ size?: number }>;
  children: Array<{ title: string; path: string }>;
}

type MenuItem = LinkMenuItem | DividerMenuItem | GroupMenuItem;

function isGroupMenuItem(item: MenuItem): item is GroupMenuItem {
  return item.type === 'group';
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
    icon: LayersIcon
  },
  {
    type: 'link',
    title: 'Working Tree',
    path: '/working-tree',
    icon: GitMerge
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
        : isGroupMenuItem(item) ?
          /* 分组（details 原生折叠）：Tree Menu / File Manager 等重复命名收进折叠组 */
          <li key={index} className='menu-group'>
            <details open>
              <summary>
                {item.icon && <item.icon size={16} />}
                <span className='rxdb-menu-item'>{item.title}</span>
              </summary>
              <ul>
                {item.children.map(child => (
                  <li key={child.path}>
                    <NavLink to={child.path} className={({ isActive }) => (isActive ? 'menu-active' : '')}>
                      <span className='rxdb-menu-item'>{child.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        : <li key={index}>
            <NavLink to={item.path} className={({ isActive }) => (isActive ? 'menu-active' : '')}>
              {item.icon && <item.icon size={16} />}
              <span className='rxdb-menu-item'>{item.title}</span>
            </NavLink>
          </li>
      )}
    </ul>
  );
}
