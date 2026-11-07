import { connectOrbitClient } from '@aiao/orbit/client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { errorMessage, requireCondition } from '../core/errors.js';
import '../styles.css';
import { CatalogView } from './catalog-view.js';
import { EditorView } from './editor-view.js';
import { FilesView } from './files-view.js';
import { AppSession } from './session.js';
import { SettingsView } from './settings-view.js';

function AppFrame({ session }: { session: AppSession }) {
  useSyncExternalStore(session.subscribe, () => session.revision);
  const [error, setError] = useState('');
  useEffect(() => {
    session.client.ready();
    const pointer = () => {
      void session.request('window.focus').catch(error => setError(errorMessage(error)));
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        !event.altKey ||
        !event.shiftKey ||
        !['k', 'o', 'm', 'f', 'x', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(event.key.toLowerCase())
      )
        return;
      event.preventDefault();
      void session.request('desktop.shortcut', { key: event.key }).catch(error => setError(errorMessage(error)));
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', keyboard);
    };
  }, [session]);
  const views = {
    editor: EditorView,
    files: FilesView,
    settings: SettingsView,
    catalog: CatalogView,
    notes: EditorView
  };
  const id = session.client.context.appId;
  const View = views[id as keyof typeof views];
  if (!View)
    return (
      <main className='standalone-message'>
        <h1>应用不在此构建的受控目录中</h1>
      </main>
    );
  return (
    <div
      className='app-frame'
      data-route={session.navigation.state.route}
      data-theme={session.profile.theme}
      data-reduced-motion={session.profile.reducedMotion}
      style={{ '--desktop-scale': session.profile.scale / 100 } as React.CSSProperties}
    >
      {error && (
        <p className='app-error' role='alert'>
          {error}
        </p>
      )}
      {session.navigationError && (
        <p className='app-error' role='alert'>
          {session.navigationError}
        </p>
      )}
      <View session={session} />
    </div>
  );
}

const desktopURL = import.meta.env.BASE_URL;

async function start() {
  const container = document.getElementById('root');
  if (!container) throw new Error('应用根节点缺失');
  const root = createRoot(container);
  root.render(
    <main className='standalone-message' role='status'>
      正在连接桌面…
    </main>
  );
  const client = await connectOrbitClient();
  if (!client) {
    root.render(
      <main className='standalone-message'>
        <span aria-hidden='true'>◈</span>
        <h1>从 Orbit 桌面打开此应用</h1>
        <p>独立页面无法使用桌面托管文件与设置。</p>
        <a href={desktopURL}>打开桌面</a>
      </main>
    );
    return;
  }
  try {
    if (import.meta.env.PROD)
      requireCondition(
        document.querySelector<HTMLMetaElement>('meta[name="desktop-release"]')?.content ===
          `${client.context.appId}@${client.context.version}`,
        'INTEGRITY',
        '应用资源与运行版本不一致'
      );
    const session = new AppSession(client);
    client.onDispose(() => root.unmount());
    root.render(<AppFrame session={session} />);
  } catch (error) {
    client.fail(errorMessage(error));
    throw error;
  }
}
void start();
