import { I18nProvider, useI18n } from '@aiao/rxdb-i18n-react';
import { RxDBProvider } from '@aiao/rxdb-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useNavigation } from 'react-router-dom';
import { AppHeader } from './components/AppHeader';
import { AppSidebar } from './components/AppSidebar';
import { DbConnectionAlert } from './components/DbConnectionAlert';
import LoadingBar, { LoadingBarRef } from './components/LoadingBar';
import { AppServiceProvider, useAppService } from './hooks/useAppService';
import { useTheme } from './hooks/useTheme';
import { isReportedDbConnectionError } from './rxdb/db-connection';
import { createDemoI18n } from './rxdb/i18n';
import setup_rxdb from './rxdb/setup_rxdb_sqlite-wasm';

const db = setup_rxdb();
const i18n = createDemoI18n(db);
const i18nReady = i18n.init();

function AppLayout() {
  const { sidebarPinned, headerFloating, toggleSidebar } = useAppService();
  const ref = useRef<LoadingBarRef>(null);
  const navigation = useNavigation();
  const { locale } = useI18n();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
          <DbConnectionAlert />
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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let active = true;
    void i18nReady.then(
      () => {
        if (active) setReady(true);
      },
      error => {
        if (active) setError(error);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  if (error && isReportedDbConnectionError(error)) return <DbConnectionAlert />;
  if (error) throw error;
  if (!ready)
    return (
      <div className='flex h-full items-center justify-center'>
        <span className='loading loading-spinner loading-lg' />
      </div>
    );

  return (
    <RxDBProvider db={db}>
      <I18nProvider value={i18n}>
        <AppServiceProvider>
          <AppLayout />
        </AppServiceProvider>
      </I18nProvider>
    </RxDBProvider>
  );
}
