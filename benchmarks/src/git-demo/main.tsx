import { I18nProvider, useI18n } from '@aiao/rxdb-i18n-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BenchmarksMessageKey } from '../i18n/messages';
import { createBenchmarksI18n, readStoredLocale } from '../i18n/runtime';
import './styles.css';

type DemoStep = {
  key: BenchmarksMessageKey;
  params?: Record<string, unknown>;
  detail?: string;
  detailKey?: BenchmarksMessageKey;
  detailParams?: Record<string, unknown>;
  status: 'passed' | 'info' | 'failed';
};

type DemoResult = {
  steps: DemoStep[];
  persisted: boolean;
  head: string;
  branch: string;
};

type WorkerResponse = { result?: DemoResult; error?: string };
type DevToolsState = 'loading' | 'loaded' | 'unavailable' | 'production';

const runtime = createBenchmarksI18n({
  storedLocale: readStoredLocale(),
  deviceLocale: globalThis.navigator?.language
});
document.documentElement.lang = runtime.locale;
document.title = runtime.t('gitDemo.title');

function App() {
  const { t } = useI18n();
  const workerRef = useRef<Worker | null>(null);
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [head, setHead] = useState('—');
  const [branch, setBranch] = useState('—');
  const [devToolsState, setDevToolsState] = useState<DevToolsState>(import.meta.env.DEV ? 'loading' : 'production');

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import('@aiao/rxdb-devtools')
      .then(({ getDevToolsConnector }) => {
        getDevToolsConnector();
        setDevToolsState('loaded');
      })
      .catch(() => setDevToolsState('unavailable'));
  }, []);

  const getWorker = useCallback(() => {
    workerRef.current ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return workerRef.current;
  }, []);

  const callWorker = useCallback(
    (action: 'demo' | 'reopen' | 'clear') =>
      new Promise<DemoResult>((resolve, reject) => {
        const worker = getWorker();
        const timer = window.setTimeout(() => reject(new Error(t('gitDemo.workerTimeout'))), 60_000);
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          window.clearTimeout(timer);
          if (data.error) reject(new Error(data.error));
          else if (data.result) resolve(data.result);
          else reject(new Error(t('gitDemo.workerEmptyResult')));
        };
        worker.onerror = event => {
          window.clearTimeout(timer);
          reject(new Error(event.message));
        };
        worker.postMessage({ action });
      }),
    [getWorker, t]
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

  const devToolsStatus =
    devToolsState === 'loading' ? t('gitDemo.devtoolsLoading')
    : devToolsState === 'loaded' ? t('gitDemo.devtoolsLoaded')
    : devToolsState === 'unavailable' ? t('gitDemo.devtoolsUnavailable')
    : t('gitDemo.devtoolsProduction');

  return (
    <main className='git-demo-shell'>
      <section className='git-demo-hero'>
        <p className='git-demo-eyebrow'>{t('gitDemo.eyebrow')}</p>
        <h1>{t('gitDemo.heading')}</h1>
        <p>{t('gitDemo.description')}</p>
        <div className='git-demo-actions'>
          <button disabled={running} onClick={() => void run('demo')} type='button'>
            {running ? t('gitDemo.running') : t('gitDemo.run')}
          </button>
          <button disabled={running} onClick={() => void run('reopen')} type='button'>
            {t('gitDemo.reopenWorker')}
          </button>
          <button className='git-demo-danger' disabled={running} onClick={() => void run('clear')} type='button'>
            {t('gitDemo.clearRepo')}
          </button>
        </div>
        <p className='git-demo-devtools-status'>
          {t('gitDemo.devtoolsLabel')}
          {devToolsStatus}
        </p>
      </section>

      <section className='git-demo-stats' aria-label={t('gitDemo.statsLabel')}>
        <div>
          <span>{t('gitDemo.statEngine')}</span>
          <strong>wasm-git JSPI</strong>
        </div>
        <div>
          <span>{t('gitDemo.statBranch')}</span>
          <strong>{branch}</strong>
        </div>
        <div>
          <span>HEAD</span>
          <strong>{head}</strong>
        </div>
        <div>
          <span>{t('gitDemo.statPersisted')}</span>
          <strong>{persisted ? t('gitDemo.persistedSaved') : t('gitDemo.persistedNone')}</strong>
        </div>
      </section>

      <section className='git-demo-card'>
        <div className='git-demo-card-heading'>
          <h2>{t('gitDemo.logTitle')}</h2>
          <span>{t('gitDemo.flow')}</span>
        </div>
        {steps.length === 0 && !error && <p className='git-demo-empty'>{t('gitDemo.emptyHint')}</p>}
        <ol className='git-demo-steps'>
          {steps.map(step => {
            const detail = step.detail ?? (step.detailKey ? t(step.detailKey, step.detailParams) : '');
            return (
              <li className={`git-demo-step ${step.status}`} key={`${step.key}-${detail}`}>
                <span className='git-demo-step-icon'>
                  {step.status === 'passed' ?
                    '✓'
                  : step.status === 'failed' ?
                    '!'
                  : '·'}
                </span>
                <div>
                  <strong>{t(step.key, step.params)}</strong>
                  <p>{detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {error && <p className='git-demo-error'>{error}</p>}
      </section>

      <p className='git-demo-footnote'>{t('gitDemo.footnote')}</p>
    </main>
  );
}

const root = document.getElementById('git-demo-root');
if (!root) throw new Error('git-demo-root is missing');
createRoot(root).render(
  <I18nProvider value={runtime}>
    <App />
  </I18nProvider>
);
