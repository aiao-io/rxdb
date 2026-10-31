import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type DemoStep = {
  name: string;
  detail: string;
  status: 'passed' | 'info' | 'failed';
};

type DemoResult = {
  steps: DemoStep[];
  persisted: boolean;
  head: string;
  branch: string;
};

type WorkerResponse = { result?: DemoResult; error?: string };

function App() {
  const workerRef = useRef<Worker | null>(null);
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [head, setHead] = useState('—');
  const [branch, setBranch] = useState('—');

  const getWorker = useCallback(() => {
    workerRef.current ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return workerRef.current;
  }, []);

  const callWorker = useCallback(
    (action: 'demo' | 'reopen' | 'clear') =>
      new Promise<DemoResult>((resolve, reject) => {
        const worker = getWorker();
        const timer = window.setTimeout(() => reject(new Error('Worker 超时')), 60_000);
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          window.clearTimeout(timer);
          if (data.error) reject(new Error(data.error));
          else if (data.result) resolve(data.result);
          else reject(new Error('Worker 返回空结果'));
        };
        worker.onerror = event => {
          window.clearTimeout(timer);
          reject(new Error(event.message));
        };
        worker.postMessage({ action });
      }),
    [getWorker]
  );

  const applyResult = useCallback((result: DemoResult) => {
    setSteps(result.steps);
    setPersisted(result.persisted);
    setHead(result.head);
    setBranch(result.branch);
  }, []);

  const run = useCallback(
    async (action: 'demo' | 'reopen' | 'clear') => {
      setRunning(true);
      setError(null);
      try {
        if (action === 'reopen') {
          workerRef.current?.terminate();
          workerRef.current = null;
        }
        applyResult(await callWorker(action));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRunning(false);
      }
    },
    [applyResult, callWorker]
  );

  useEffect(() => () => workerRef.current?.terminate(), []);

  return (
    <main className='git-demo-shell'>
      <section className='git-demo-hero'>
        <p className='git-demo-eyebrow'>AI 原生开发环境 · 研究 Demo</p>
        <h1>浏览器 Git + OPFS</h1>
        <p>
          真实 Worker 使用 <code>wasm-git JSPI</code>，把工作区和 <code>.git</code> 写进 OPFS。 这个页面只演示已验证的
          Git 闭环，不承诺任意 Node / Nx 运行时。
        </p>
        <div className='git-demo-actions'>
          <button disabled={running} onClick={() => void run('demo')} type='button'>
            {running ? '运行中…' : '运行 Git 闭环'}
          </button>
          <button disabled={running} onClick={() => void run('reopen')} type='button'>
            重启 Worker
          </button>
          <button className='git-demo-danger' disabled={running} onClick={() => void run('clear')} type='button'>
            清空 OPFS 仓库
          </button>
        </div>
      </section>

      <section className='git-demo-stats' aria-label='仓库状态'>
        <div>
          <span>引擎</span>
          <strong>wasm-git JSPI</strong>
        </div>
        <div>
          <span>分支</span>
          <strong>{branch}</strong>
        </div>
        <div>
          <span>HEAD</span>
          <strong>{head}</strong>
        </div>
        <div>
          <span>持久化</span>
          <strong>{persisted ? 'OPFS 已保存' : '尚未创建'}</strong>
        </div>
      </section>

      <section className='git-demo-card'>
        <div className='git-demo-card-heading'>
          <h2>执行日志</h2>
          <span>clone → status → modify → commit → branch → checkout → reopen</span>
        </div>
        {steps.length === 0 && !error && <p className='git-demo-empty'>点击“运行 Git 闭环”开始。</p>}
        <ol className='git-demo-steps'>
          {steps.map(step => (
            <li className={`git-demo-step ${step.status}`} key={`${step.name}-${step.detail}`}>
              <span className='git-demo-step-icon'>
                {step.status === 'passed' ?
                  '✓'
                : step.status === 'failed' ?
                  '!'
                : '·'}
              </span>
              <div>
                <strong>{step.name}</strong>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {error && <p className='git-demo-error'>{error}</p>}
      </section>

      <p className='git-demo-footnote'>
        OPFS 按 origin 隔离，清理站点数据会删除仓库。导出、远端认证、依赖安装和隔离预览仍是后续验收项。
      </p>
    </main>
  );
}

createRoot(document.getElementById('git-demo-root')!).render(<App />);
