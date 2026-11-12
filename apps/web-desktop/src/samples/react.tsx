import { StrictMode, useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type { FrameworkDocument } from './document.js';

function Sample({ model, ready }: { model: FrameworkDocument; ready: () => void }) {
  const view = useSyncExternalStore(model.subscribe, () => model.snapshot);
  useEffect(ready, [ready]);
  return (
    <main
      className='framework-sample'
      data-route={view.route}
      data-theme={view.theme}
      data-accent={view.accent}
      style={{ '--desktop-scale': view.scale / 100 } as CSSProperties}
    >
      <h1>{model.label}</h1>
      {!view.desktop && (
        <p className='sample-boundary'>独立运行：可以编辑和下载文本。桌面托管文件、剪贴板和窗口能力不可用。</p>
      )}
      {view.error && <p role='alert'>{view.error}</p>}
      {!view.loaded && view.error && <button onClick={() => void model.start()}>重试读取</button>}
      <label>
        文件名
        <input
          value={view.name}
          disabled={view.busy || !view.loaded}
          onChange={event => model.rename(event.target.value)}
        />
      </label>
      <label htmlFor='document-text'>文档内容</label>
      <textarea
        id='document-text'
        value={view.text}
        disabled={view.busy || !view.loaded}
        onChange={event => model.edit(event.target.value)}
      />
      <div className='sample-actions'>
        <button disabled={!view.desktop || view.busy || !view.loaded} onClick={() => void model.save()}>
          保存到我的文件
        </button>
        <button disabled={view.busy || !view.loaded} onClick={() => model.exportText()}>
          下载文本
        </button>
        <button disabled={!view.canUndo || view.busy} onClick={() => model.undo()}>
          撤销
        </button>
        <button disabled={!view.canRedo || view.busy} onClick={() => model.redo()}>
          重做
        </button>
        <button disabled={!view.desktop || view.busy} onClick={() => void model.copy()}>
          复制全文
        </button>
        <button disabled={!view.desktop || view.busy} onClick={() => void model.check()}>
          检查当前内容
        </button>
        <button onClick={() => model.toggleAccent()}>切换强调色</button>
      </div>
      <form
        className='sample-route'
        onSubmit={event => {
          event.preventDefault();
          void model.navigate();
        }}
      >
        <label>
          逻辑位置
          <input value={view.location} onChange={event => model.setLocation(event.target.value)} />
        </label>
        <button disabled={view.busy}>前往位置</button>
      </form>
      <p role='status'>{view.busy ? '正在处理…' : view.message}</p>
    </main>
  );
}

export async function render(root: HTMLElement, model: FrameworkDocument): Promise<() => void> {
  const app = createRoot(root);
  await new Promise<void>(resolve =>
    app.render(
      <StrictMode>
        <Sample model={model} ready={resolve} />
      </StrictMode>
    )
  );
  return () => app.unmount();
}
