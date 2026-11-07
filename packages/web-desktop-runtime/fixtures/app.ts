import { connectWujieClient } from '../src/client.js';

const mode = new URL(location.href).searchParams.get('mode');
const client = await connectWujieClient();
if (client) {
  const events: unknown[] = [];
  const id = crypto.randomUUID();
  Reflect.set(window, 'fixtureIdentity', id);
  client.bus.$on('host-event', (...args) => events.push(args));
  client.onRequest('inspect', () => ({
    id,
    events: JSON.stringify(events),
    props: { ...client.context.props },
    visible: client.context.visible,
    url: location.href,
    color: getComputedStyle(document.body).color,
    text: document.getElementById('root')!.textContent
  }));
  client.onRequest('echo', payload => payload);
  client.onRequest(
    'slow',
    (_payload, signal) =>
      new Promise(resolve => {
        signal.addEventListener(
          'abort',
          () => {
            client.bus.$emit('cancelled', client.context.instanceId);
            resolve(null);
          },
          { once: true }
        );
      })
  );
  client.onRequest('throw', () => {
    throw new Error('应用处理错误');
  });
  client.onRequest('invalid', () => undefined as never);
  client.onRequest('emit', payload => {
    client.bus.$emit('app-event', payload);
    return null;
  });
  client.onRequest('host', payload => client.request('host', payload));
  client.onRequest('lazy', async () => (await import('./lazy.js')).loaded);
  client.onRequest('route', () => {
    history.pushState(null, '', '#new-route');
    return location.hash;
  });
  client.onRequest('fail', () => {
    client.fail('业务启动失败');
    return null;
  });
  client.onPropsChange(() => client.bus.$emit('props-changed'));
  client.onVisibilityChange(visible => client.bus.$emit('visible', visible));
  document.getElementById('root')!.textContent = client.context.instanceId;
  if (mode === 'fail') client.fail('业务启动失败');
  else if (mode !== 'silent') await (await import('./render.js')).render(client, new URL(location.href).searchParams.get('framework'));
}
