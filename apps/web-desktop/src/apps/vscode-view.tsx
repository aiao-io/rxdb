import { useEffect, useState } from 'react';
import type { AppSession } from './session.js';

const VSCODE_URL = 'https://vscode.aiao.io/';

export function VscodeView({ session }: { session: AppSession }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => session.bindSuspension(() => true), [session]);

  return (
    <main className='vscode-app' aria-busy={!loaded}>
      {!loaded && (
        <div className='vscode-loading' role='status'>
          <span className='spinner' />
          正在加载 VS Code…
        </div>
      )}
      <iframe
        className='vscode-frame'
        title='Aiao VS Code 浏览器开发工作台'
        src={VSCODE_URL}
        allow='clipboard-read; clipboard-write; fullscreen'
        referrerPolicy='strict-origin-when-cross-origin'
        onLoad={() => setLoaded(true)}
      />
      {!loaded && (
        <p className='vscode-fallback'>
          如果当前浏览器阻止嵌入，
          <a href={VSCODE_URL} target='_blank' rel='noreferrer'>
            在新标签页打开 VS Code
          </a>
        </p>
      )}
    </main>
  );
}
