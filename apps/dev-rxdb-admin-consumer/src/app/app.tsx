import { RxDBProvider } from '@aiao/rxdb-react';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import setup_rxdb from './rxdb/setup_rxdb';

const db = setup_rxdb();

function AppLayout() {
  return (
    <div className='flex size-full flex-col'>
      <header className='border-base-300 bg-base-100 flex h-14 shrink-0 items-center border-b px-4'>
        <h1 className='text-lg font-semibold'>独立消费示例 · 书签</h1>
      </header>
      <div id='layout-content' className='flex min-h-0 flex-1 flex-col overflow-auto'>
        <Suspense
          fallback={
            <div className='flex h-full items-center justify-center' data-testid='loading-fallback' aria-label='加载中'>
              <span className='loading loading-spinner loading-lg'></span>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <RxDBProvider db={db}>
      <AppLayout />
    </RxDBProvider>
  );
}
