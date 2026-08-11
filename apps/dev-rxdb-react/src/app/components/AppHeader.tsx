import { Menu } from 'lucide-react';
import { useAppService } from '../hooks/useAppService';

export function AppHeader() {
  const { toggleSidebar } = useAppService();

  return (
    <div
      className='flex items-center justify-between p-1'
      id='layout-topbar'
      aria-label='Navbar'
      role='navigation'
      style={{ pointerEvents: 'none' }}
    >
      <div className='inline-flex items-center gap-3'>
        <button
          className='btn btn-ghost btn-sm pointer-events-auto md:hidden'
          onClick={toggleSidebar}
          aria-label='Toggle menu'
        >
          <Menu size={20} />
        </button>
      </div>
      <div className='hidden items-center gap-1 2xl:inline-flex'></div>
    </div>
  );
}
