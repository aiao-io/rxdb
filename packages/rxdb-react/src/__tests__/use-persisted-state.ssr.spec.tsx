// @vitest-environment node
/**
 * `usePersistedState` 的服务端渲染与 hydrate 快照（RV-01a1ba4b4adf）。
 *
 * @remarks
 * 长驻 SSR 进程会连续、并发地处理不同用户的请求。服务端渲染出的 HTML 只能来自本次调用的
 * `initialValue`，不能经进程内注册表把上一个请求的值带进下一个请求。
 */
import { Suspense, use, type ReactNode } from 'react';
import { renderToReadableStream, renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePersistedState } from '../use-persisted-state';

const Profile = ({ owner }: { owner: string }) => <span>{usePersistedState('ssr-profile', 'owner', owner).value}</span>;

const Slot = ({ initial }: { initial: number | string }) => (
  <span>{usePersistedState<number | string>('ssr-slot', 'slot', initial).value}</span>
);

const Gated = ({ gate, children }: { gate: Promise<void>; children: ReactNode }) => {
  use(gate);
  return children;
};

const renderStream = async (node: ReactNode): Promise<string> => {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe('usePersistedState（SSR）', () => {
  it('运行在没有 window 的服务端环境', () => {
    expect(typeof window).toBe('undefined');
  });

  it('连续两个请求用同一业务键时，各自渲染本次的 initialValue', () => {
    expect(renderToString(<Profile owner='alice-private' />)).toBe('<span>alice-private</span>');
    expect(renderToString(<Profile owner='bob-private' />)).toBe('<span>bob-private</span>');
  });

  it('并发请求交错渲染同一业务键时互不可见', async () => {
    const alice = deferred();
    const bob = deferred();
    const pages = Promise.all([
      renderStream(
        <Suspense fallback={null}>
          <Gated gate={alice.promise}>
            <Profile owner='alice-concurrent' />
          </Gated>
        </Suspense>
      ),
      renderStream(
        <Suspense fallback={null}>
          <Gated gate={bob.promise}>
            <Profile owner='bob-concurrent' />
          </Gated>
        </Suspense>
      )
    ]);

    bob.resolve();
    await Promise.resolve();
    alice.resolve();
    const [alicePage, bobPage] = await pages;

    expect(alicePage).toContain('<span>alice-concurrent</span>');
    expect(alicePage).not.toContain('bob-concurrent');
    expect(bobPage).toContain('<span>bob-concurrent</span>');
    expect(bobPage).not.toContain('alice-concurrent');
  });

  it('同一请求内同键的两个调用点各自渲染自己的 initialValue', () => {
    const html = renderToString(
      <>
        <Profile owner='first' />
        <Profile owner='second' />
      </>
    );

    expect(html).toBe('<span>first</span><span>second</span>');
  });

  // 服务端渲染若在进程内注册表里登记，第一个请求的值类型会钉住这个键：下一个请求换了类型，整页渲染抛错
  it('同键跨请求换值类型不抛错', () => {
    expect(renderToString(<Slot initial={42} />)).toBe('<span>42</span>');
    expect(renderToString(<Slot initial='forty-two' />)).toBe('<span>forty-two</span>');
  });
});
