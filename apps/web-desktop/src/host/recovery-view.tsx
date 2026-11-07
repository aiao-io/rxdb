import { useEffect, useRef } from 'react';
import { builtins } from '../core/catalog.js';
import type { DesktopHost } from './runtime.js';

const names = new Map(builtins.map(app => [app.id, app.name]));

function openCatalog(host: DesktopHost): void {
  try {
    host.launch('catalog');
    host.setPanel('recovery', false);
  } catch (error) {
    host.report(error);
  }
}

export function RecoveryPanel({ host }: { host: DesktopHost }) {
  const close = useRef<HTMLButtonElement>(null);
  const saved = host.state.session.filter(win => host.recovery.has(win.id));
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <section
      className='resource-panel recovery-panel'
      aria-label='待恢复窗口'
      onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        host.setPanel('recovery', false);
      }}
    >
      <div className='recovery-heading'>
        <h2>待恢复窗口</h2>
        <button ref={close} aria-label='关闭恢复待办' onClick={() => host.setPanel('recovery', false)}>
          关闭
        </button>
      </div>
      <p>以下窗口尚未恢复。你可以重试或逐项移除；移除只删除此窗口的恢复记录，文件仍会保留。</p>
      {saved.some(win => !host.state.installations.some(item => item.appId === win.appId)) && (
        <div className='recovery-catalog'>
          <p>有应用尚未安装。请先在应用目录中确认安装，再回来重试恢复。</p>
          <button onClick={() => openCatalog(host)}>打开应用目录</button>
        </div>
      )}
      {saved.map(win => {
        const failure = host.recovery.get(win.id)!;
        return (
          <article className='resource-instance' key={win.id} data-recovery-id={win.id} aria-busy={failure.busy}>
            <strong>{names.get(win.appId)}</strong>
            <span>工作区：{host.state.workspaces.find(item => item.id === win.workspaceId)?.name}</span>
            {win.fileId && <span>文件：{host.state.files.find(file => file.id === win.fileId)?.name}</span>}
            <span role='alert'>{failure.error}</span>
            <button
              disabled={failure.busy}
              onClick={() => void host.retryRecovery(win.id).catch(error => host.report(error))}
            >
              重试恢复
            </button>
            <button
              disabled={failure.busy}
              onClick={() => void host.removeRecovery(win.id).catch(error => host.report(error))}
            >
              移除恢复项
            </button>
          </article>
        );
      })}
    </section>
  );
}
