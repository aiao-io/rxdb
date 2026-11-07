import { useCallback, useEffect, useState } from 'react';
import { errorMessage, requireCondition } from '../core/errors.js';
import type { AppDefinition } from '../core/types.js';
import type { AppSession } from './session.js';

type CatalogItem = AppDefinition & {
  installed: boolean;
  origin: string;
  offlineReady: boolean;
  availableVersion: string;
  updateAvailable: boolean;
  previousVersion: string | null;
  changes: string[];
};
export function CatalogView({ session }: { session: AppSession }) {
  useEffect(
    () =>
      session.navigation.bind(route => {
        requireCondition(new URL(route, 'https://catalog.invalid/').pathname === '/', 'UNSUPPORTED', '目录页面不存在');
      }),
    [session]
  );
  const [apps, setApps] = useState<CatalogItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearData, setClearData] = useState(false);
  useEffect(() => session.bindSuspension(() => !busy), [session, busy]);
  const refresh = useCallback(async () => {
    const value = await session.request<CatalogItem[]>('apps.list');
    setApps(value);
  }, [session]);
  useEffect(() => {
    void session
      .request<CatalogItem[]>('apps.list')
      .then(setApps)
      .catch(error => setError(errorMessage(error)));
    const off = [
      session.client.onRequest('document.prepareClose', () => ({ dirty: false })),
      session.client.onRequest('document.save', () => true)
    ];
    return () => {
      for (const cleanup of off) cleanup();
    };
  }, [session]);
  async function change(app: CatalogItem) {
    setBusy(true);
    setError('');
    try {
      if (
        !(await session.confirm(
          app.installed ? `卸载 ${app.name}` : `安装 ${app.name}`,
          app.installed ?
            `将清除启动入口、授权和资源记录。${clearData ? '同时删除应用私有数据。' : '保留应用私有数据。'}共享文件不会删除。`
          : `来源：${app.origin}\n版本：${app.version}\n所需能力：${app.capabilities.join('、')}\n离线：${app.offlineReady ? '完整准备' : '尚未准备'}\n只有调用能力时才征求授权。`
        ))
      )
        return;
      await session.request(app.installed ? 'apps.uninstall' : 'apps.install', { id: app.id, clearData });
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function changeVersion(app: CatalogItem, rollback: boolean) {
    setBusy(true);
    setError('');
    try {
      await session.request(rollback ? 'apps.rollback' : 'apps.update', { id: app.id });
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className='catalog-app'>
      <span className='section-kicker'>A SMALL COLLECTION. A REAL WORKFLOW.</span>
      <h1>好工具，各就各位。</h1>
      <p className='section-description'>经过批准的独立 Web 应用。无需账号，按需授权。</p>
      {error && (
        <p className='app-error' role='alert'>
          {error}
          <button
            onClick={() => {
              void session
                .request<CatalogItem[]>('apps.list')
                .then(setApps)
                .catch(error => setError(errorMessage(error)));
            }}
          >
            重试
          </button>
        </p>
      )}
      <div className='catalog-grid'>
        {apps.map(app => (
          <article className='catalog-card' key={app.id}>
            <span className={`app-icon icon-${app.id}`} aria-hidden='true'>
              {app.id === 'editor' ?
                '≡'
              : app.id === 'files' ?
                '▰'
              : app.id === 'settings' ?
                '⚙'
              : '▦'}
            </span>
            <h2>{app.name}</h2>
            <p>{app.description}</p>
            <dl>
              <dt>来源</dt>
              <dd>{app.origin}</dd>
              <dt>版本</dt>
              <dd>
                {app.version}
                {app.updateAvailable ? ` · 可更新至 ${app.availableVersion}` : ''}
              </dd>
              <dt>所需能力</dt>
              <dd>{app.capabilities.join('、')}</dd>
              <dt>离线</dt>
              <dd>{app.offlineReady ? '已完整准备' : '尚未完整准备'}</dd>
            </dl>
            {app.updateAvailable && (
              <button
                disabled={busy}
                className='primary'
                onClick={() => {
                  void changeVersion(app, false);
                }}
              >
                更新到 {app.availableVersion}
              </button>
            )}
            {app.previousVersion && (
              <button
                disabled={busy}
                onClick={() => {
                  void changeVersion(app, true);
                }}
              >
                回退到 {app.previousVersion}
              </button>
            )}
            {app.system ?
              <span className='system-badge'>系统组件 · 不可卸载</span>
            : <button
                disabled={busy}
                className={app.installed ? '' : 'primary'}
                onClick={() => {
                  void change(app);
                }}
              >
                {app.installed ? '卸载' : '安装'}
              </button>
            }
          </article>
        ))}
      </div>
      <label className='clear-private-data'>
        <input type='checkbox' checked={clearData} onChange={event => setClearData(event.target.checked)} />
        卸载时同时清除应用私有数据（共享文件保留）
      </label>
      <p className='catalog-note'>不接受任意 URL。新应用需由运营方纳入受控目录。</p>
    </main>
  );
}
