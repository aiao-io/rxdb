import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, requireCondition } from '../core/errors.js';
import { defaultProfile } from '../core/state.js';
import type { Grant, Profile } from '../core/types.js';
import { download, type AppSession } from './session.js';

interface SettingsData {
  profile: Profile;
  workspaces: { id: string; name: string }[];
  grants: Grant[];
  offlineReady: boolean;
  version: string;
}

function settingsTab(route: string): string {
  const path = new URL(route, 'https://settings.invalid/').pathname;
  const tab = path === '/' ? 'appearance' : path.slice(1);
  requireCondition(
    ['appearance', 'workspaces', 'permissions', 'data', 'about'].includes(tab),
    'UNSUPPORTED',
    '设置页面不存在'
  );
  return tab;
}

export function SettingsView({ session }: { session: AppSession }) {
  const backupInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState(() => settingsTab(session.navigation.state.route));
  useEffect(() => session.navigation.bind(route => setTab(settingsTab(route))), [session]);
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [backup, setBackup] = useState<unknown>(null);
  const [backupInfo, setBackupInfo] = useState<{ files: number; workspaces: number } | null>(null);
  const [diagnostic, setDiagnostic] = useState('');
  useEffect(
    () => session.bindSuspension(() => !busy && !workspaceName && backup === null),
    [session, busy, workspaceName, backup]
  );
  const refresh = useCallback(async () => {
    const value = await session.request<SettingsData>('profile.get');
    setData(value);
  }, [session]);
  async function perform(operation: () => Promise<unknown>, success = '') {
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
      setMessage(success);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function reorder(workspaces: SettingsData['workspaces'], index: number, direction: -1 | 1) {
    const ids = workspaces.map(workspace => workspace.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void perform(() => session.request('workspaces.reorder', { ids }), '工作区顺序已保存');
  }
  useEffect(() => {
    void session
      .request<SettingsData>('profile.get')
      .then(setData)
      .catch(error => setError(errorMessage(error)));
    const off = [
      session.client.onRequest('document.prepareClose', () => ({ dirty: false })),
      session.client.onRequest('document.save', () => true)
    ];
    return () => {
      for (const cleanup of off) cleanup();
    };
  }, [session]);
  function patch(value: Partial<Profile>) {
    void perform(() => session.request('profile.set', { patch: value }));
  }
  const tabs = [
    { id: 'appearance', label: '个性化', icon: '◐' },
    { id: 'workspaces', label: '工作区', icon: '▤' },
    { id: 'permissions', label: '权限', icon: '◇' },
    { id: 'data', label: '数据与备份', icon: '▱' },
    { id: 'about', label: '关于与帮助', icon: '◈' }
  ];
  return (
    <main className='settings-app app-layout'>
      <div className='settings-body'>
        <aside className='app-sidebar'>
          <h1>设置</h1>
          {tabs.map(item => (
            <button
              key={item.id}
              aria-pressed={tab === item.id}
              onClick={() => {
                setTab(item.id);
                session.navigation.record('/' + item.id);
              }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </aside>
        <section className='settings-content'>
          {error && (
            <div role='alert' className='app-error'>
              {error}
              <button
                onClick={() => {
                  void perform(refresh);
                }}
              >
                重试
              </button>
            </div>
          )}
          {!data && !error && <p role='status'>正在读取设置…</p>}
          {data && tab === 'appearance' && (
            <>
              <span className='section-kicker'>MAKE IT YOURS</span>
              <h2>熟悉，且属于你。</h2>
              <p className='section-description'>改变操作方式，保留正在进行的工作。</p>
              <div className='settings-card'>
                <h3>交互模式</h3>
                <div className='setting-options'>
                  {(['macos', 'windows'] as const).map(mode => (
                    <button key={mode} aria-pressed={data.profile.mode === mode} onClick={() => patch({ mode })}>
                      <strong>{mode === 'macos' ? 'macOS' : 'Windows'}</strong>
                      <small>{mode === 'macos' ? '顶部菜单与 Dock' : '开始菜单与任务栏'}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className='settings-card'>
                <label className='setting-row'>
                  <span>
                    <strong>外观</strong>
                    <small>为桌面及支持主题的应用统一偏好</small>
                  </span>
                  <select
                    aria-label='外观'
                    value={data.profile.theme}
                    onChange={event => patch({ theme: event.target.value as Profile['theme'] })}
                  >
                    <option value='system'>跟随系统</option>
                    <option value='light'>浅色</option>
                    <option value='dark'>深色</option>
                  </select>
                </label>
                <label className='setting-row'>
                  <span>
                    <strong>界面缩放</strong>
                    <small>窗口控制始终可达</small>
                  </span>
                  <select
                    aria-label='界面缩放'
                    value={data.profile.scale}
                    onChange={event => patch({ scale: Number(event.target.value) })}
                  >
                    {[100, 125, 150, 175, 200].map(scale => (
                      <option key={scale} value={scale}>
                        {scale}%
                      </option>
                    ))}
                  </select>
                </label>
                <label className='setting-row'>
                  <span>
                    <strong>减少动态效果</strong>
                    <small>保留操作反馈，停止装饰动画</small>
                  </span>
                  <input
                    aria-label='减少动态效果'
                    type='checkbox'
                    checked={data.profile.reducedMotion}
                    onChange={event => patch({ reducedMotion: event.target.checked })}
                  />
                </label>
                <label className='setting-row'>
                  <span>
                    <strong>免打扰</strong>
                    <small>通知仍保存在通知中心</small>
                  </span>
                  <input
                    aria-label='免打扰'
                    type='checkbox'
                    checked={data.profile.doNotDisturb}
                    onChange={event => patch({ doNotDisturb: event.target.checked })}
                  />
                </label>
              </div>
              <button
                onClick={() => {
                  const defaults = defaultProfile(data.profile.mode);
                  patch({ theme: defaults.theme, scale: defaults.scale, reducedMotion: defaults.reducedMotion });
                }}
              >
                恢复显示默认值
              </button>
            </>
          )}
          {data && tab === 'workspaces' && (
            <>
              <h2>让工作各就其位。</h2>
              <p className='section-description'>
                工作区只改变窗口分组，应用和未保存内容持续运行。至少保留一个工作区；前移、后移会保存入口顺序。
              </p>
              <div className='settings-card'>
                {data.workspaces.map((workspace, index) => (
                  <div className='workspace-setting' key={workspace.id}>
                    <strong>{workspace.name}</strong>
                    <button
                      aria-label={`前移工作区 ${workspace.name}`}
                      disabled={busy || index === 0}
                      onClick={() => reorder(data.workspaces, index, -1)}
                    >
                      前移
                    </button>
                    <button
                      aria-label={`后移工作区 ${workspace.name}`}
                      disabled={busy || index === data.workspaces.length - 1}
                      onClick={() => reorder(data.workspaces, index, 1)}
                    >
                      后移
                    </button>
                    <button
                      onClick={() => {
                        void perform(async () => {
                          const name = await session.request<string | null>('desktop.prompt', {
                            title: '重命名工作区',
                            label: '名称',
                            value: workspace.name
                          });
                          if (name !== null) await session.request('workspaces.rename', { id: workspace.id, name });
                        });
                      }}
                    >
                      重命名
                    </button>
                    <button
                      disabled={data.workspaces.length < 2}
                      onClick={() => {
                        void perform(async () => {
                          const target = await session.request<string | null>('desktop.chooseWorkspace', {
                            exclude: workspace.id
                          });
                          if (target !== null) await session.request('workspaces.delete', { id: workspace.id, target });
                        });
                      }}
                    >
                      删除并迁移窗口
                    </button>
                  </div>
                ))}
              </div>
              <form
                className='inline-form'
                onSubmit={event => {
                  event.preventDefault();
                  void perform(async () => {
                    await session.request('workspaces.create', { name: workspaceName });
                    setWorkspaceName('');
                  });
                }}
              >
                <input
                  aria-label='新工作区名称'
                  placeholder='新工作区名称'
                  value={workspaceName}
                  onChange={event => setWorkspaceName(event.target.value)}
                  required
                />
                <button type='submit' className='primary'>
                  创建工作区
                </button>
              </form>
            </>
          )}
          {data && tab === 'permissions' && (
            <>
              <h2>每一项能力，由你决定。</h2>
              <p className='section-description'>
                授权仅控制桌面托管服务。受信应用仍须遵守接入契约；这不是恶意代码安全沙箱。
              </p>
              <div className='settings-card'>
                {!data.grants.length && <p className='empty'>尚无授权记录。</p>}
                {data.grants.map(grant => (
                  <div className='grant-row' key={grant.id}>
                    <span>
                      <strong>
                        {grant.appId} · {grant.capability}
                      </strong>
                      <small>
                        {grant.origin}
                        <br />
                        {grant.scope} · {grant.instanceId === null ? '持久授权' : '本次实例'}
                      </small>
                    </span>
                    <button
                      onClick={() => {
                        void perform(
                          () => session.request('permissions.revoke', { id: grant.id }),
                          '授权已撤销，后续调用立即重新检查'
                        );
                      }}
                    >
                      撤销
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {data && tab === 'data' && (
            <>
              <h2>你的数据，可以带走。</h2>
              <p className='section-description'>浏览器清理站点数据会删除本地内容。重要文件请另行保存。</p>
              <div className='settings-card'>
                <h3>离线状态</h3>
                <p>
                  {data.offlineReady ?
                    '完整资源已准备，支持离线打开和本地编辑保存。'
                  : '离线资源尚未完整准备，请联网完成准备后重试。'}
                </p>
                <button
                  onClick={() => {
                    void perform(refresh);
                  }}
                >
                  刷新状态
                </button>
              </div>
              <div className='settings-card'>
                <h3>导出桌面备份</h3>
                <p>
                  包含托管文件原字节、应用私有数据、布局和偏好。备份未加密，不含授权、令牌、通知、剪贴板或未保存内存。文件字节总量上限
                  200 MiB。
                </p>
                <button
                  disabled={busy}
                  className='primary'
                  onClick={() => {
                    void perform(async () => {
                      const exported = await session.request('backup.export');
                      download(
                        `orbit-desktop-${new Date().toISOString().slice(0, 10)}.json`,
                        new TextEncoder().encode(JSON.stringify(exported)),
                        'application/json'
                      );
                    }, '已交付备份下载，请妥善保存');
                  }}
                >
                  导出未加密备份
                </button>
              </div>
              <div className='settings-card'>
                <h3>从备份恢复</h3>
                <p>先完整校验，再确认替换范围。损坏或不兼容的备份不会改变当前数据。</p>
                <div>
                  <button disabled={busy} onClick={() => backupInput.current?.click()}>
                    选择备份文件
                  </button>
                  <input
                    type='file'
                    ref={backupInput}
                    accept='application/json,.json'
                    aria-label='选择桌面备份'
                    hidden
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void perform(async () => {
                        if (file.size > 300 * 1024 * 1024) throw new Error('LIMIT: 备份文件不能超过 300 MiB');
                        const imported: unknown = JSON.parse(await file.text());
                        const info = await session.request<{ files: number; workspaces: number }>('backup.validate', {
                          backup: imported
                        });
                        setBackup(imported);
                        setBackupInfo(info);
                      });
                      event.target.value = '';
                    }}
                  />
                </div>
                {backupInfo && (
                  <p>
                    已验证：{backupInfo.files} 个文件，{backupInfo.workspaces} 个工作区。
                    <button
                      className='danger'
                      onClick={() => {
                        void perform(async () => {
                          await session.request('backup.restore', { backup: backup });
                          setBackup(null);
                          setBackupInfo(null);
                        }, '数据恢复完成，权限需重新授予');
                      }}
                    >
                      检查并恢复
                    </button>
                  </p>
                )}
              </div>
              <div className='settings-card'>
                <h3>重置桌面</h3>
                <p>
                  可只恢复主题、字号、动态效果、应用入口和通知偏好，也可删除全部托管数据。两种范围都需要两次确认；可先导出备份。
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    void perform(
                      () => session.request('backup.reset', { scope: 'configuration' }),
                      '桌面配置已恢复默认值'
                    );
                  }}
                >
                  只重置配置
                </button>
                <button
                  className='danger'
                  disabled={busy}
                  onClick={() => {
                    void perform(() => session.request('backup.reset', { scope: 'all' }));
                  }}
                >
                  重置桌面数据
                </button>
              </div>
            </>
          )}
          {data && tab === 'about' && (
            <>
              <span className='about-orbit' aria-hidden='true'>
                ◈
              </span>
              <h2>Orbit Desktop</h2>
              <p className='section-description'>一个可以工作的 Web 桌面。</p>
              <div className='settings-card'>
                <p>桌面 {data.version} · Orbit 0.0.1</p>
                <p>
                  仓内运行内核。Wujie 设计基线：<code>c459329</code>。
                </p>
                <p>首版无账号、无云同步。支持能力与实际浏览器验收记录见产品文档。</p>
              </div>
              <div className='settings-card'>
                <h3>键盘操作</h3>
                <p>Tab / Shift+Tab 在控件间移动；Enter 执行；Escape 关闭弹层。</p>
                <p>
                  Alt+Shift+K 应用启动器 · Alt+Shift+O 窗口概览
                  <br />
                  Alt+Shift+方向键 移动窗口 · Alt+Shift+M 最小化
                  <br />
                  Alt+Shift+F 最大化/还原 · Alt+Shift+X 关闭
                  <br />
                  编辑器 Ctrl / Command+S 保存，Shift+S 另存为。
                </p>
                <p>浏览器与操作系统可能保留快捷键。所有操作均提供可聚焦按钮与菜单。</p>
              </div>
              <div className='settings-card'>
                <h3>本地诊断</h3>
                <p>
                  仅记录版本、实例标识和错误类别。不会上传诊断，不包含文件正文、剪贴板、Cookie、令牌或完整敏感 URL。
                </p>
                <button
                  onClick={() => {
                    void perform(async () =>
                      setDiagnostic(JSON.stringify(await session.request('diagnostics.export'), null, 2))
                    );
                  }}
                >
                  预览诊断
                </button>
                {diagnostic && (
                  <>
                    <textarea aria-label='去敏诊断预览' className='diagnostic-preview' readOnly value={diagnostic} />
                    <button
                      onClick={() =>
                        download('orbit-diagnostics.json', new TextEncoder().encode(diagnostic), 'application/json')
                      }
                    >
                      下载诊断
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <footer className='app-status' role='status'>
        <span>{busy ? '正在处理…' : message || '只改变你选择的设置'}</span>
        <span>Orbit Desktop</span>
      </footer>
    </main>
  );
}
