import { connectOrbitClient } from '@aiao/orbit/client';
import { AppSession } from '../apps/session.js';
import { errorMessage, requireCondition } from '../core/errors.js';
import { FrameworkDocument } from './document.js';
import './style.css';

const renderers = {
  angular: () => import('./angular.js'),
  react: () => import('./react.js'),
  vue: () => import('./vue.js')
};

async function start(): Promise<void> {
  const root = document.getElementById('root');
  requireCondition(root, 'INVALID', '应用根节点缺失');
  const framework = document.documentElement.dataset['framework'];
  requireCondition(
    framework === 'angular' || framework === 'react' || framework === 'vue',
    'INVALID',
    '便签框架入口无效'
  );
  const client = await connectOrbitClient();
  if (client && import.meta.env.PROD)
    requireCondition(
      document.querySelector<HTMLMetaElement>('meta[name="desktop-release"]')?.content ===
        `${client.context.appId}@${client.context.version}`,
      'INTEGRITY',
      '应用资源与运行版本不一致'
    );
  const label = { angular: 'Angular', react: 'React', vue: 'Vue' }[framework] + ' 便签';
  const session = client ? new AppSession(client) : null;
  const model = new FrameworkDocument(session, label);
  let disposed = false;
  let unmount: (() => void) | null = null;
  const pointer = () => {
    if (session) void session.request('window.focus').catch(error => model.report(error));
  };
  const keyboard = (event: KeyboardEvent) => {
    if (
      !session ||
      event.isComposing ||
      !event.altKey ||
      !event.shiftKey ||
      !['k', 'o', 'm', 'f', 'x', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(event.key.toLowerCase())
    )
      return;
    event.preventDefault();
    void session.request('desktop.shortcut', { key: event.key }).catch(error => model.report(error));
  };
  const dispose = () => {
    disposed = true;
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard);
    model.dispose();
    unmount?.();
  };
  client?.onDispose(dispose);
  try {
    const renderer = await renderers[framework]();
    if (disposed) return;
    unmount = await renderer.render(root, model);
    if (disposed) {
      unmount();
      return;
    }
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard);
    client?.ready();
    await model.start();
  } catch (error) {
    dispose();
    client?.fail(errorMessage(error));
    root.textContent = errorMessage(error);
  }
}

void start();
