import type { OrbitClient } from '@aiao/orbit/client';
import { I18nProvider } from '@aiao/rxdb-i18n-react';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/app';
import { getBenchmarksI18n } from './i18n/runtime';
import { BENCHMARK_SQLITE_ADAPTERS, DEFAULT_BENCHMARK_SQLITE_ADAPTER } from './utils/rxdb-factory';
import './styles.css';

export async function bootstrap(client: OrbitClient | undefined): Promise<void> {
  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root mount element');
  const i18n = getBenchmarksI18n();
  document.documentElement.lang = i18n.locale;
  document.title = i18n.t('app.title', { adapter: BENCHMARK_SQLITE_ADAPTERS[DEFAULT_BENCHMARK_SQLITE_ADAPTER].label });
  const root = createRoot(container);
  function Ready() {
    useEffect(() => client?.ready(), []);
    return <App />;
  }
  client?.onDispose(() => root.unmount());
  root.render(
    <StrictMode>
      <I18nProvider value={i18n}>
        <Ready />
      </I18nProvider>
    </StrictMode>
  );
}
