import { Database, PanelLeftClose, PanelLeftDashed } from 'lucide-react';
import { useAppService } from '../hooks/useAppService';
import { AppBranchManager } from './AppBranchManager';
import { AppMenu } from './AppMenu';
import { AppThemeBtn } from './AppThemeBtn';

export function AppSidebar() {
  const { sidebarPinned, toggleSidebar } = useAppService();

  return (
    <aside
      className='flex shrink-0 flex-col overflow-hidden transition-all duration-300 ease-in-out'
      style={{
        width: sidebarPinned ? '240px' : '48px',
        borderRight:
          sidebarPinned ? 'none' : '1px solid color-mix(in oklch, var(--color-base-content), transparent 90%)'
      }}
    >
      {/* Logo 区域 */}
      <div className='bg-base-300 flex items-center justify-between p-1'>
        <div id='logo'>
          <button
            className='btn btn-ghost btn-sm hover:border-transparent hover:bg-transparent'
            onClick={toggleSidebar}
            aria-label='sidebar toggle'
          >
            <Database size={16} />
            {sidebarPinned && <span id='logo-name'>RxDB</span>}
          </button>
        </div>
        <button className='btn btn-ghost btn-sm' onClick={toggleSidebar} aria-label='sidebar toggle'>
          {sidebarPinned ?
            <PanelLeftClose size={16} />
          : <PanelLeftDashed size={16} />}
        </button>
      </div>

      {/* 菜单区域 */}
      <div className={`bg-base-200 flex-1 overflow-y-auto ${!sidebarPinned ? 'hide-scrollbar' : ''}`}>
        <AppMenu />
      </div>

      {/* 底部按钮区域 */}
      <div className='bg-base-300 flex flex-col p-1'>
        <div className='flex flex-row'>
          {sidebarPinned && <AppBranchManager />}
          <div className='ml-auto flex gap-1'>
            <AppThemeBtn />
          </div>
        </div>
      </div>
    </aside>
  );
}
