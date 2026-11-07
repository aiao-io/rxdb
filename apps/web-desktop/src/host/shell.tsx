import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { builtins } from '../core/catalog.js';
import type { Mode, WindowRecord } from '../core/types.js';
import { AppIcon, SymbolIcon, SystemMark } from '../ui/icons.js';
import { AppBar } from './app-bar.js';
import { HOST_VERSION } from './diagnostics.js';
import { WindowGesture } from './gesture.js';
import { RecoveryPanel } from './recovery-view.js';
import type { DesktopHost, RunningApp } from './runtime.js';

const names: Record<string, string> = Object.fromEntries(builtins.map(app => [app.id, app.name]));
const run = (host: DesktopHost, action: () => unknown | Promise<unknown>) => {
  try {
    void Promise.resolve(action()).catch(error => host.report(error));
  } catch (error) {
    host.report(error);
  }
};

const developmentResources = import.meta.env.DEV;
const runtimeNames = {
  created: '正在准备',
  loading: '正在打开',
  ready: '运行中',
  hidden: '已隐藏',
  failed: '启动失败',
  destroyed: '已退出'
};
const backgroundNames = {
  running: '运行中',
  suspending: '正在挂起',
  suspended: '已挂起',
  resuming: '正在恢复',
  unknown: '后台状态未确认'
};
const prefetchNames = {
  waiting: '等待空闲',
  preparing: '等待或准备静态资源',
  ready: '已准备',
  cancelled: '已取消',
  error: '准备失败'
};

function ResourcePanel({ host }: { host: DesktopHost }) {
  return (
    <section className='resource-panel' aria-label='运行与资源'>
      <div className='panel-heading'>
        <h2>运行与资源</h2>
        <button aria-label='关闭资源面板' onClick={() => host.toggleResources()}>
          ×
        </button>
      </div>
      <p>后台最多同时准备两个静态版本。前台加载优先；预取不会启动应用。</p>
      <div className='resource-actions'>
        {host.prefetch.enabled ?
          <button onClick={() => host.prefetch.stop()}>取消后台预取</button>
        : <button disabled={developmentResources} onClick={() => host.startPrefetch()}>
            继续后台预取
          </button>
        }
        <button
          disabled={host.collectingResources || developmentResources}
          onClick={() => run(host, () => host.cleanupResources())}
        >
          清理无用应用资源
        </button>
      </div>
      <p role='status'>{host.collectingResources ? '正在清理无引用资源…' : host.resourceMessage}</p>
      <ul className='resource-preparations'>
        {host.state.installations.map(item => {
          const status = host.prefetch.statuses.get(item.appId);
          return (
            <li key={item.appId}>
              {names[item.appId]} {item.version} · {status ? prefetchNames[status.state] : '尚未预取'}
              {status?.error && <span role='alert'>{status.error}</span>}
            </li>
          );
        })}
      </ul>
      <h3>应用实例</h3>
      <button disabled={host.instances.size === 0} onClick={() => run(host, () => host.suspendApplications())}>
        检查并挂起应用
      </button>
      {host.instances.size === 0 && <p>尚未启动应用。</p>}
      {[...host.instances.values()].map(app => (
        <article key={app.id} className='resource-instance'>
          <strong>{app.definition.name}</strong>
          <span>
            {app.title} · {app.definition.version} ·{' '}
            {app.background.state === 'running' ? runtimeNames[app.status] : backgroundNames[app.background.state]}
          </span>
          {app.definition.suspension === 1 ?
            <button
              disabled={
                app.background.state === 'suspending' ||
                app.background.state === 'resuming' ||
                (app.status !== 'ready' && app.status !== 'hidden')
              }
              onClick={() =>
                run(host, () =>
                  app.background.state === 'running' ? host.suspendApplication(app) : host.resumeApplication(app)
                )
              }
            >
              {app.background.state === 'running' ? '挂起' : '恢复'}
            </button>
          : <span>未声明挂起协议，需要用户处理。</span>}
        </article>
      ))}
    </section>
  );
}

function Welcome({ host }: { host: DesktopHost }) {
  const [mode, setMode] = useState<Mode>(host.state.profile.mode);
  return (
    <main className={`welcome wallpaper mode-${mode}`}>
      <div className='welcome-orbit' aria-hidden='true'>
        ◈
      </div>
      <section role='dialog' aria-modal='true' aria-labelledby='welcome-title' className='welcome-card'>
        <span className='eyebrow'>ORBIT · YOUR SPACE ON THE WEB</span>
        <h1 id='welcome-title'>
          熟悉的桌面，
          <br />
          新的可能。
        </h1>
        <p>选择你习惯的交互方式。应用和文件留在这个浏览器中，无需账号，随时可以切换。</p>
        {host.message && <p role='status'>{host.message}</p>}
        <div className='mode-options'>
          {(['macos', 'windows'] as const).map(value => (
            <button
              key={value}
              className={mode === value ? 'mode-option selected' : 'mode-option'}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              <span className={`mode-preview preview-${value}`} aria-hidden='true'>
                <i />
                <b />
                <em />
              </span>
              <strong>{value === 'macos' ? 'macOS 风格' : 'Windows 风格'}</strong>
              <small>{value === 'macos' ? '菜单栏、Dock 与保留运行的应用' : '开始菜单、任务栏与熟悉的窗口'}</small>
            </button>
          ))}
        </div>
        <button
          className='primary welcome-enter'
          onClick={() => run(host, () => host.updateProfile({ mode, guided: true }))}
        >
          进入桌面 <span aria-hidden='true'>↗</span>
        </button>
        <p className='welcome-hint'>从应用栏打开「文件」开始。文件保存在浏览器内，重要内容请定期导出。</p>
      </section>
      <span className='welcome-signature'>A little space to make things happen.</span>
    </main>
  );
}

function SystemDialog({ host }: { host: DesktopHost }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = host.dialogs.current;
  useEffect(() => {
    if (!pending || !dialog.current) return;
    const element = dialog.current;
    const origin = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, [pending]);
  if (!pending) return null;
  return (
    <dialog
      ref={dialog}
      className='system-dialog'
      aria-labelledby='system-dialog-title'
      onCancel={event => {
        event.preventDefault();
        host.dialogs.answer('cancel');
      }}
    >
      <form
        onSubmit={event => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const values = Object.fromEntries(
            [...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)])
          );
          host.dialogs.answer(submitter instanceof HTMLButtonElement ? submitter.value : 'cancel', values);
        }}
      >
        <span className='dialog-mark' aria-hidden='true'>
          ◈
        </span>
        <h2 id='system-dialog-title'>{pending.options.title}</h2>
        <p>{pending.options.message}</p>
        {pending.options.fields?.map(field => (
          <label key={field.name}>
            {field.label}
            {field.options ?
              <select name={field.name} aria-label={field.label} defaultValue={field.value}>
                {field.options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            : <input name={field.name} aria-label={field.label} defaultValue={field.value} required />}
          </label>
        ))}
        <div className='dialog-actions'>
          {pending.options.actions.map(action => (
            <button
              key={action.id}
              type='submit'
              value={action.id}
              className={
                action.danger ? 'danger'
                : action.id === 'cancel' ?
                  ''
                : 'primary'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </form>
    </dialog>
  );
}

function Launcher({ host }: { host: DesktopHost }) {
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const results = host.state.installations.filter(({ appId }) =>
    `${names[appId]} ${appId}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  return (
    <section
      className='launcher glass'
      aria-label='应用启动器'
      onKeyDown={event => {
        if (event.key === 'Escape') {
          host.setPanel('launcher', false);
        }
      }}
    >
      <div className='panel-heading'>
        <h2>{host.model.mode === 'macos' ? '应用程序' : '应用'}</h2>
        <button
          aria-label='关闭启动器'
          onClick={() => {
            host.setPanel('launcher', false);
          }}
        >
          ×
        </button>
      </div>
      <label className='search-box'>
        <SymbolIcon name='search' />
        <input
          ref={input}
          aria-label='搜索应用'
          placeholder='搜索应用…'
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </label>
      <div className='launcher-list'>
        {results.map(installation => (
          <div className='launcher-row' key={installation.appId}>
            <button className='launcher-app' onClick={() => run(host, () => host.launch(installation.appId))}>
              <AppIcon id={installation.appId} />
              <span>
                <strong>{names[installation.appId]}</strong>
              </span>
            </button>
            <button
              aria-label={`${host.state.profile.pinned.includes(installation.appId) ? '取消固定' : '固定'} ${names[installation.appId]}`}
              onClick={() =>
                run(host, () =>
                  host.updateProfile({
                    pinned:
                      host.state.profile.pinned.includes(installation.appId) ?
                        host.state.profile.pinned.filter(id => id !== installation.appId)
                      : [...host.state.profile.pinned, installation.appId]
                  })
                )
              }
            >
              {host.state.profile.pinned.includes(installation.appId) ? '●' : '＋'}
            </button>
          </div>
        ))}
      </div>
      {!results.length && <p className='empty'>没有找到应用。试试其他名称。</p>}
      <div className='launcher-footer'>
        <span>
          <SymbolIcon name='user' /> 本地账户
        </span>
        <button onClick={() => run(host, () => host.launch('settings'))}>
          <SymbolIcon name='controls' /> 桌面设置
        </button>
      </div>
    </section>
  );
}

function WindowOverview({ host }: { host: DesktopHost }) {
  return (
    <section className='overview glass' aria-label='窗口概览'>
      <div className='panel-heading'>
        <h2>所有窗口</h2>
        <button
          aria-label='关闭窗口概览'
          onClick={() => {
            host.setPanel('overview', false);
          }}
        >
          ×
        </button>
      </div>
      {!host.model.windows.length && <p className='empty'>还没有打开的窗口。</p>}
      {host.model.windows
        .slice()
        .sort((a, b) => b.z - a.z)
        .map(win => (
          <div className='overview-row' key={win.id}>
            <button onClick={() => run(host, () => host.reveal(win.instanceId))}>
              <AppIcon id={win.appId} />
              <span>
                <strong>{win.title}</strong>
                <small>
                  {host.state.workspaces.find(workspace => workspace.id === win.workspaceId)?.name} ·{' '}
                  {win.state === 'minimized' ? '已最小化' : '运行中'}
                </small>
              </span>
            </button>
            <select
              aria-label={`移动 ${win.title} 到工作区`}
              value={win.workspaceId}
              onChange={event => {
                host.moveWindowTo(win.id, event.target.value);
              }}
            >
              {host.state.workspaces.map(workspace => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <button
              aria-label={`概览关闭 ${win.title}`}
              onClick={() => run(host, () => host.windowAction(win.instanceId, 'close'))}
            >
              ×
            </button>
          </div>
        ))}
    </section>
  );
}

function WindowControls({ host, app, win }: { host: DesktopHost; app: RunningApp; win: WindowRecord }) {
  const controls = [
    { action: 'close', label: `关闭窗口 ${app.definition.name}`, glyph: '×', className: 'close-control' },
    { action: 'minimized', label: `最小化窗口 ${app.definition.name}`, glyph: '−', className: 'minimize-control' },
    {
      action: win.state === 'maximized' ? 'restore' : 'maximized',
      label: `${win.state === 'maximized' ? '还原' : '最大化'}窗口 ${app.definition.name}`,
      glyph: win.state === 'maximized' ? '❐' : '□',
      className: 'maximize-control'
    }
  ];
  const ordered = host.model.mode === 'macos' ? controls : [controls[1], controls[2], controls[0]];
  return (
    <div className='window-controls'>
      {ordered.map(control => (
        <button
          key={control.className}
          className={control.className}
          aria-label={control.label}
          title={control.label}
          onClick={() => run(host, () => host.windowAction(app.id, control.action))}
        >
          <span aria-hidden='true'>{control.glyph}</span>
        </button>
      ))}
    </div>
  );
}

function InstanceWindow({ host, app }: { host: DesktopHost; app: RunningApp }) {
  const container = useRef<HTMLDivElement>(null);
  const [gesture] = useState(
    () =>
      new WindowGesture(
        host.model,
        host.model.windows.find(win => win.instanceId === app.id)?.id ?? '',
        () => host.area(),
        () => host.changed(),
        () => run(host, () => host.persistSession()),
        app.definition.minWidth,
        app.definition.minHeight
      )
  );
  const [dragging, setDragging] = useState(false);
  const win = host.model.windows.find(win => win.instanceId === app.id);
  useEffect(() => {
    if (container.current) void host.mount(app, container.current);
  }, [host, app]);
  const shown =
    win && win.state !== 'minimized' && win.workspaceId === host.model.workspaceId && !host.model.showingDesktop;
  function begin(event: ReactPointerEvent<HTMLElement>, kind: string) {
    if (event.button !== 0 || !win) return;
    gesture.attach(win.id);
    gesture.begin(event.clientX, event.clientY, kind);
    if (gesture.active) event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(gesture.active);
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    gesture.move(event.clientX, event.clientY);
  }
  function end(event: ReactPointerEvent<HTMLElement>) {
    gesture.end(event.clientX, event.type === 'pointercancel');
    setDragging(false);
  }
  return (
    <section
      data-app-id={app.definition.id}
      data-instance-id={app.id}
      aria-label={`${app.title} 窗口`}
      className={`desktop-window ${host.model.activeId === win?.id ? 'active' : ''} ${dragging ? 'dragging' : ''}`}
      style={{
        display: shown ? undefined : 'none',
        left: win?.bounds.x,
        top: win?.bounds.y,
        width: win?.bounds.width,
        height: win?.bounds.height,
        zIndex: win?.z
      }}
    >
      {win && (
        <header className='titlebar'>
          <WindowControls host={host} app={app} win={win} />
          <div className='window-navigation'>
            <button
              aria-label={`后退 ${app.definition.name}`}
              disabled={!app.navigation.back || app.background.state !== 'running'}
              onClick={() => run(host, () => host.navigateApplication(app, { type: 'back' }))}
            >
              ←
            </button>
            <button
              aria-label={`前进 ${app.definition.name}`}
              disabled={!app.navigation.forward || app.background.state !== 'running'}
              onClick={() => run(host, () => host.navigateApplication(app, { type: 'forward' }))}
            >
              →
            </button>
          </div>
          <span className='titlebar-app-icon'>
            <AppIcon id={app.definition.id} />
          </span>
          <button
            className='window-title'
            aria-label={`移动窗口 ${app.definition.name}：${app.title}`}
            onPointerDown={event => begin(event, 'move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onDoubleClick={() =>
              run(host, () => host.windowAction(app.id, win.state === 'maximized' ? 'restore' : 'maximized'))
            }
            onClick={() => {
              host.selectWindow(win.id);
            }}
          >
            {app.dirty && <span aria-label='未保存'>● </span>}
            {app.title}
          </button>
          <details className='window-menu'>
            <summary aria-label={`窗口操作 ${app.definition.name}`}>···</summary>
            <div className='menu-popover'>
              {app.commands.map(command => (
                <button
                  key={command.id}
                  disabled={command.disabled}
                  onClick={() => run(host, () => host.command(app.id, command.id))}
                >
                  {command.label}
                </button>
              ))}
              <button
                onClick={event => {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                  run(host, () => host.openLocation(app));
                }}
              >
                打开位置…
              </button>
              <button onClick={() => run(host, () => host.launch(app.definition.id, true))}>新建窗口</button>
              <button onClick={() => run(host, () => host.windowAction(app.id, 'left'))}>贴靠到左侧</button>
              <button onClick={() => run(host, () => host.windowAction(app.id, 'right'))}>贴靠到右侧</button>
              <button onClick={() => run(host, () => host.windowAction(app.id, 'restore'))}>还原窗口</button>
              <button
                onClick={() =>
                  run(host, () =>
                    host.closeInstances(
                      [...host.instances.values()]
                        .filter(instance => instance.definition.id === app.definition.id)
                        .map(instance => instance.id)
                    )
                  )
                }
              >
                退出应用
              </button>
            </div>
          </details>
        </header>
      )}
      <div ref={container} className='frame-host' />
      {(app.status === 'created' || app.status === 'loading') && (
        <div className='window-overlay' role='status'>
          <span className='spinner' />
          正在打开 {app.definition.name}…
        </div>
      )}
      {!app.error && app.background.state !== 'running' && (
        <div className='window-overlay' role='status'>
          <h3>{backgroundNames[app.background.state]}</h3>
          <p>保存内容和路由保留在当前实例中。</p>
          <button
            disabled={app.background.state === 'suspending' || app.background.state === 'resuming'}
            onClick={() => run(host, () => host.resumeApplication(app))}
          >
            恢复应用
          </button>
        </div>
      )}
      {app.error && (
        <div className='window-overlay error-state' role='alert'>
          <h3>应用未能启动</h3>
          <p>{app.error}</p>
          <button onClick={() => run(host, () => host.retry(app))}>重试</button>
          <button onClick={() => run(host, () => host.closeInstances([app.id]))}>关闭</button>
        </div>
      )}
      {win?.state === 'normal' &&
        ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(kind => (
          <button
            key={kind}
            className={`resize-handle resize-${kind}`}
            aria-label={`从 ${kind} 调整窗口大小`}
            tabIndex={-1}
            onPointerDown={event => begin(event, kind)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
    </section>
  );
}

function DesktopMenu({ host }: { host: DesktopHost }) {
  return (
    <details className='desktop-menu'>
      <summary aria-label='桌面菜单'>
        {host.model.mode === 'macos' ?
          <SystemMark mode='macos' />
        : <SymbolIcon name='controls' />}
      </summary>
      <div className='menu-popover'>
        <button
          onClick={() => {
            host.showDesktop();
          }}
        >
          {host.model.showingDesktop ? '恢复窗口' : '显示桌面'}
        </button>
        <button onClick={() => run(host, () => host.launch('settings'))}>桌面设置</button>
        <button onClick={() => host.toggleResources()}>运行与资源</button>
        <button
          onClick={() =>
            run(host, () =>
              document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
            )
          }
        >
          {document.fullscreenElement ? '退出浏览器全屏' : '浏览器全屏'}
        </button>
        <button onClick={() => run(host, () => host.updateProfile({ guided: false }))}>快捷键与入门</button>
      </div>
    </details>
  );
}

function SystemTray({ host }: { host: DesktopHost }) {
  const windows = host.model.mode === 'windows';
  return (
    <div className='system-tray'>
      {windows && <DesktopMenu host={host} />}
      <button
        className='mode-toggle'
        title={`切换到 ${windows ? 'macOS' : 'Windows 11'}`}
        aria-label={`切换交互模式，当前 ${windows ? 'Windows' : 'macOS'}`}
        onClick={() => run(host, () => host.updateProfile({ mode: windows ? 'macos' : 'windows' }))}
      >
        <SymbolIcon name='switch' />
      </button>
      <button
        aria-label='运行与资源'
        title='运行与资源'
        aria-expanded={host.resourcesOpen}
        onClick={() => host.toggleResources()}
      >
        <SymbolIcon name='drive' />
      </button>
      {!import.meta.env.DEV && !host.offlineReady && (
        <button
          disabled={host.preparingOffline || host.offline}
          onClick={() => run(host, () => host.prepareResources())}
        >
          {host.preparingOffline ? '正在准备离线资源…' : '准备离线资源'}
        </button>
      )}
      {host.recovery.size > 0 && (
        <button aria-label='恢复待办' aria-expanded={host.recoveryOpen} onClick={() => host.setPanel('recovery')}>
          恢复待办 {host.recovery.size}
        </button>
      )}
      <span className='network-status'>
        {host.offline ?
          '离线'
        : host.offlineReady ?
          '离线已就绪'
        : '在线'}
      </span>
      <span className='tray-connectivity' title={host.offline ? '离线' : '已连接'}>
        <SymbolIcon name='wifi' />
      </span>
      <button
        className='tray-clock'
        title='通知中心'
        aria-expanded={host.notificationsOpen}
        onClick={() => host.setPanel('notifications')}
      >
        <time>
          {windows ?
            <>
              <span>{host.clock.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              <span>{host.clock.toLocaleDateString('zh-CN')}</span>
            </>
          : <>
              {host.clock.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })}{' '}
              {host.clock.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </>
          }
        </time>
        {windows && <SymbolIcon name='bell' />}
        <span className='sr-only'>通知中心</span>
        {host.notifications.length > 0 && <span className='notification-dot' />}
      </button>
    </div>
  );
}

export function DesktopApp({ host }: { host: DesktopHost }) {
  useSyncExternalStore(host.subscribe, () => host.revision);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || !event.altKey || !event.shiftKey) return;
      if (host.shortcut(event.key)) event.preventDefault();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [host]);
  if (host.phase === 'loading')
    return (
      <main className='boot wallpaper' role='status'>
        <span className='orbit-logo'>◈</span>
        <h1>正在打开你的空间</h1>
        <span className='spinner' />
      </main>
    );
  if (host.phase !== 'ready')
    return (
      <main className='boot wallpaper'>
        <section className='boot-card'>
          <span className='orbit-logo'>◈</span>
          <h1>
            {host.phase === 'spectator' ?
              '桌面已在另一个标签页打开'
            : host.phase === 'unsupported' ?
              '当前浏览器缺少必要能力'
            : host.phase === 'update-required' ?
              '桌面需要完成更新'
            : '桌面未能启动'}
          </h1>
          <p>
            {host.phase === 'spectator' ?
              '同一份数据只允许一个可写桌面。可返回原页面，或请求移交控制权。未保存的内容会先征求原页面确认。'
            : host.missing.join('、') || host.message}
          </p>
          {host.phase === 'spectator' && (
            <button className='primary' onClick={() => run(host, () => host.takeControl())}>
              请求接管
            </button>
          )}
          {host.phase === 'error' && (
            <button disabled={host.resettingStorage} onClick={() => run(host, () => host.start())}>
              重试
            </button>
          )}
          {host.storageRecovery && (
            <section aria-label='恢复诊断'>
              <h2>恢复诊断</h2>
              <p>原始数据已保留</p>
              <p>
                错误类别：{host.startupError} · 桌面版本 {HOST_VERSION}
              </p>
              <p>会话不兼容或损坏。重试不会清空数据；重置会永久删除本地文件及桌面配置。</p>
              <button disabled={host.resettingStorage} onClick={() => run(host, () => host.recoverStoredState())}>
                重置受损桌面…
              </button>
            </section>
          )}
          {host.phase === 'update-required' && (
            <>
              <p>已保存的文件、设置和窗口会在更新后恢复。新版本准备完成后，由你确认切换。</p>
              {host.updateAvailable ?
                <button
                  className='primary'
                  disabled={host.updatingShell}
                  onClick={() => run(host, () => host.activateUpdate())}
                >
                  保存工作并更新
                </button>
              : <button onClick={() => run(host, () => host.checkForUpdate())}>检查更新</button>}
            </>
          )}
          <p role='status'>{host.message}</p>
        </section>
        <SystemDialog host={host} />
      </main>
    );
  if (!host.state.profile.guided) return <Welcome host={host} />;
  const active = host.model.windows.find(win => win.id === host.model.activeId);
  const activeApp = host.instances.get(active?.instanceId ?? '');
  return (
    <main
      className={`desktop wallpaper mode-${host.model.mode}`}
      data-theme={host.state.profile.theme}
      data-reduced-motion={host.state.profile.reducedMotion}
      style={{ '--desktop-scale': host.state.profile.scale / 100 } as React.CSSProperties}
    >
      {host.model.mode === 'macos' && (
        <header className='system-bar glass'>
          <DesktopMenu host={host} />
          <strong className='active-app-name'>
            {activeApp?.definition.id === 'files' ? 'Finder' : (activeApp?.definition.name ?? 'Finder')}
          </strong>
          <details className='desktop-menu app-command-menu'>
            <summary>文件</summary>
            <div className='menu-popover'>
              <button onClick={() => run(host, () => host.launch(activeApp?.definition.id ?? 'files', true))}>
                新建窗口
              </button>
              {activeApp?.commands.map(command => (
                <button
                  key={command.id}
                  disabled={command.disabled}
                  onClick={() => run(host, () => host.command(activeApp.id, command.id))}
                >
                  {command.label}
                </button>
              ))}
              {activeApp && (
                <button onClick={() => run(host, () => host.windowAction(activeApp.id, 'close'))}>关闭窗口</button>
              )}
            </div>
          </details>
          <details className='desktop-menu app-command-menu'>
            <summary>窗口</summary>
            <div className='menu-popover'>
              <button onClick={() => host.setPanel('overview')}>窗口概览</button>
              <button onClick={() => host.showDesktop()}>显示桌面</button>
              {activeApp && (
                <button onClick={() => run(host, () => host.windowAction(activeApp.id, 'minimized'))}>最小化</button>
              )}
            </div>
          </details>
          <div className='system-spacer' />
          <SystemTray host={host} />
        </header>
      )}
      {host.resourcesOpen && <ResourcePanel host={host} />}
      {host.recoveryOpen && <RecoveryPanel host={host} />}
      <div
        className='desktop-surface'
        onPointerDown={event => {
          if (event.target === event.currentTarget) {
            host.focusDesktop();
          }
        }}
      >
        <div className='desktop-shortcuts'>
          {host.state.profile.shortcuts.map(id => (
            <button
              key={id}
              aria-label={`桌面快捷方式 ${id === 'files' ? '文件' : '文本编辑器'}`}
              onDoubleClick={() => run(host, () => host.launch(id))}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  run(host, () => host.launch(id));
                }
              }}
            >
              <AppIcon id={id} />
              <span>{id === 'files' ? '文件' : '文本编辑器'}</span>
            </button>
          ))}
        </div>
        <div className='workspace-switcher' aria-label='工作区' hidden={host.state.workspaces.length < 2}>
          {host.state.workspaces.map(workspace => (
            <button
              key={workspace.id}
              aria-pressed={host.model.workspaceId === workspace.id}
              onClick={() => host.setWorkspace(workspace.id)}
            >
              {workspace.name}
            </button>
          ))}
        </div>
        <div className='window-layer' style={{ height: host.area().height }}>
          {[...host.instances.values()].map(app => (
            <InstanceWindow key={app.id} host={host} app={app} />
          ))}
        </div>
      </div>
      <AppBar host={host} action={operation => run(host, operation)}>
        {host.model.mode === 'windows' && <SystemTray host={host} />}
      </AppBar>
      {host.launcherOpen && <Launcher host={host} />}
      {host.overviewOpen && <WindowOverview host={host} />}
      {host.notificationsOpen && (
        <section className='notification-center glass' aria-label='通知中心'>
          <div className='panel-heading'>
            <h2>通知</h2>
            <button
              aria-label='关闭通知中心'
              onClick={() => {
                host.setPanel('notifications', false);
              }}
            >
              ×
            </button>
          </div>
          {!host.notifications.length && <p className='empty'>一切安静。还没有通知。</p>}
          {host.notifications.map(item => (
            <button key={item.id} onClick={() => run(host, () => host.reveal(item.instanceId))}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <small>
                {item.appId} · {new Date(item.time).toLocaleTimeString()}
              </small>
            </button>
          ))}
        </section>
      )}
      {host.updateAvailable && (
        <div className='update-banner' role='status'>
          新版本已准备完成。
          <button disabled={host.updatingShell} onClick={() => run(host, () => host.activateUpdate())}>
            保存工作并更新
          </button>
        </div>
      )}
      {host.sessionRestored && (
        <div className='desktop-message session-notice' role='status'>
          <span>已恢复上次持久化的布局和已保存内容。未保存内容无法保证找回。</span>
          <button aria-label='关闭恢复提示' onClick={() => host.dismissSessionNotice()}>
            ×
          </button>
        </div>
      )}
      {host.message && (
        <div className='desktop-message' role='alert'>
          <span>{host.message}</span>
          <button
            aria-label='关闭消息'
            onClick={() => {
              host.clearMessage();
            }}
          >
            ×
          </button>
        </div>
      )}
      <SystemDialog host={host} />
      <span className='sr-only' aria-live='polite'>
        当前为 {host.model.mode === 'macos' ? 'macOS' : 'Windows'} 模式，活动窗口：{active?.title ?? '桌面'}
      </span>
    </main>
  );
}
