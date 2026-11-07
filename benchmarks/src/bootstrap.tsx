import type { WujieClient } from '@aiao/web-desktop-runtime/client';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/app';
import './styles.css';

export async function bootstrap(client: WujieClient | undefined): Promise<void> {
  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root mount element');
  const root = createRoot(container);
  function Ready() { useEffect(() => client?.ready(), []); return <App />; }
  client?.onDispose(() => root.unmount());
  root.render(<StrictMode><Ready /></StrictMode>);
}
