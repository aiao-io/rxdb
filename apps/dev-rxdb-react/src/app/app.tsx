import { RxDBProvider } from '@aiao/rxdb-react';
import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useNavigation } from 'react-router-dom';
import { AppHeader } from './components/AppHeader';
import { AppSidebar } from './components/AppSidebar';
import LoadingBar, { LoadingBarRef } from './components/LoadingBar';
import { AppServiceProvider, useAppService } from './hooks/useAppService';
import { useTheme } from './hooks/useTheme';
import setup_rxdb from './rxdb/setup_rxdb_sqlite-wasm';

const db = setup_rxdb();

function AppLayout() {
  const { sidebarPinned, headerFloating, toggleSidebar } = useAppService();
  const ref = useRef<LoadingBarRef>(null);
  const navigation = useNavigation();

  useEffect(() => {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    document.documentElement.lang = locale;
  }, []);

  useEffect(() => {
    if (navigation.state === 'loading') {
      ref.current?.continuousStart();
    } else if (navigation.state === 'idle') {
      ref.current?.complete();
    }
  }, [navigation.state]);

  return (
    <div
      className={`flex size-full ${sidebarPinned ? 'left-menu-pinned' : ''} ${headerFloating ? 'header-floating' : ''}`}
      id='layout-main'
    >
      <LoadingBar color='#f11946' ref={ref} shadow={true} />
      {sidebarPinned && (
        <div className='sidebar-overlay md:hidden' onClick={toggleSidebar} aria-label='Close sidebar' />
      )}
      <AppSidebar />
      <div className='flex h-full min-w-0 grow flex-col overflow-hidden' id='layout-container'>
        <AppHeader />
        <div id='layout-content' className='flex min-h-0 flex-1 flex-col overflow-auto'>
          <Suspense
            fallback={
              <div className='flex h-full items-center justify-center'>
                <span className='loading loading-spinner loading-lg'></span>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  useTheme();

  return (
    <RxDBProvider db={db}>
      <AppServiceProvider>
        <AppLayout />
      </AppServiceProvider>
    </RxDBProvider>
  );
}
