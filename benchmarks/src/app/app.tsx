import { useI18n } from '@aiao/rxdb-i18n-react';
import { requestIdleCallbackPolyfill } from '@aiao/utils';
import type { UiLocale } from '@aiao/rxdb-i18n';
import { BarChart3, FileDown, Gauge, GitBranch, Play, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BenchmarkResults } from '../components/BenchmarkResults';
import { ScoreCard } from '../components/ScoreCard';
import { ThemeToggle } from '../components/ThemeToggle';
import { useBenchmark } from '../hooks/useBenchmark';
import { setBenchmarksLocale } from '../i18n/runtime';
import { exportResultsAsCSV, exportResultsAsJSON } from '../utils/export-results';
import {
  BENCHMARK_SQLITE_OPTIONS,
  DEFAULT_BENCHMARK_SQLITE_ADAPTER,
  getBenchmarkSqliteMeta,
  type BenchmarkSqliteAdapter
} from '../utils/rxdb-factory';

const BROWSER_GIT_OPFS_DEMO_URL = `${import.meta.env.BASE_URL}browser-git-opfs-demo.html`;

requestIdleCallbackPolyfill();

export function App() {
  const { t, locale } = useI18n();
  const [sqliteAdapter, setSqliteAdapter] = useState<BenchmarkSqliteAdapter>(DEFAULT_BENCHMARK_SQLITE_ADAPTER);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const sqliteMeta = getBenchmarkSqliteMeta(sqliteAdapter);
  const { state, sections, error, runBenchmarks, getAllResults, isRunning } = useBenchmark(sqliteAdapter);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('app.title', { adapter: sqliteMeta.label });
  }, [locale, sqliteMeta.label, t]);

  // 关闭 daisyUI dropdown：在选项被激活后移除焦点
  const closeDropdown = useCallback(() => {
    exportButtonRef.current?.blur();
  }, []);

  const handleExport = useCallback(
    (exporter: (results: ReturnType<typeof getAllResults>) => void) => {
      const results = getAllResults();
      if (results.length === 0) {
        setExportError(t('app.exportEmpty'));
        return;
      }
      setExportError(null);
      exporter(results);
      closeDropdown();
    },
    [closeDropdown, getAllResults, t]
  );

  const handleExportKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDropdown();
      }
    },
    [closeDropdown]
  );

  return (
    <div className='bench-shell flex min-h-screen flex-col'>
      <header className='navbar sticky top-0 z-10 min-h-0 flex-nowrap gap-3 px-6 py-2'>
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <span className='data-cube' aria-hidden />
          <h1 className='truncate text-sm font-semibold tracking-tight'>
            <span className='text-primary'>RxDB</span> Benchmarks
          </h1>
          <ThemeToggle />
        </div>
        <div className='flex flex-none flex-nowrap items-center gap-1.5'>
          <label className='inline-flex items-center gap-2 text-sm'>
            <span className='hidden md:inline'>{t('app.language')}</span>
            <select
              className='select select-xs w-auto'
              data-testid='i18n-locale'
              value={locale.startsWith('en') ? 'en' : 'zh-Hans'}
              onChange={event => {
                void setBenchmarksLocale(event.target.value as UiLocale);
              }}
            >
              <option value='zh-Hans'>简体中文</option>
              <option value='en'>English</option>
            </select>
          </label>
          <label className='select select-xs' aria-label={t('app.selectAdapter')}>
            <span className='label'>{t('app.adapter')}</span>
            <select
              value={sqliteAdapter}
              onChange={event => setSqliteAdapter(event.target.value as BenchmarkSqliteAdapter)}
              disabled={isRunning}
            >
              {BENCHMARK_SQLITE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className='dropdown dropdown-end flex-none'>
            <button
              ref={exportButtonRef}
              type='button'
              className='btn btn-ghost btn-xs whitespace-nowrap'
              aria-label={t('app.exportResults')}
              aria-haspopup='menu'
              onKeyDown={handleExportKeyDown}
            >
              <FileDown size={14} aria-hidden />
              {t('app.export')}
            </button>
            <ul role='menu' className='dropdown-content menu z-[1] w-32 p-2'>
              <li role='none'>
                <button role='menuitem' onClick={() => handleExport(exportResultsAsJSON)}>
                  JSON
                </button>
              </li>
              <li role='none'>
                <button role='menuitem' onClick={() => handleExport(results => exportResultsAsCSV(results, t))}>
                  CSV
                </button>
              </li>
            </ul>
          </div>
          <button
            className='btn btn-primary btn-sm shrink-0 whitespace-nowrap'
            onClick={runBenchmarks}
            disabled={isRunning}
            aria-label={t('app.startBenchmark')}
          >
            {!isRunning && <Play size={14} aria-hidden />}
            {isRunning ? t('app.running') : t('app.start')}
          </button>
        </div>
      </header>
      {exportError && (
        <div role='status' aria-live='polite' className='alert alert-warning mx-6 mt-3'>
          <span>{exportError}</span>
        </div>
      )}

      <main className='container mx-auto flex-1 px-6 py-8' role='main'>
        {/* Page heading */}
        <section className='mb-10 border-b border-[color:color-mix(in_oklab,var(--color-base-content)_10%,transparent)] pb-8'>
          <h2 className='max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl'>{t('app.heading')}</h2>
          <p className='mt-4 text-sm leading-6 opacity-70 sm:text-base sm:leading-7'>{t('app.headingDescription')}</p>
        </section>

        {/* Info Cards */}
        <div className='mb-10 grid grid-cols-1 gap-4 md:grid-cols-3'>
          <div className='stats'>
            <div className='stat'>
              <div className='stat-figure text-primary'>
                <TrendingUp size={24} strokeWidth={2} />
              </div>
              <div className='stat-title'>{t('app.statScenarios')}</div>
              <div className='stat-value text-primary'>4</div>
              <div className='stat-desc'>{t('app.statScenariosDescription')}</div>
            </div>
          </div>

          <div className='stats'>
            <div className='stat'>
              <div className='stat-figure text-primary'>
                <BarChart3 size={24} strokeWidth={2} />
              </div>
              <div className='stat-title'>{t('app.statScale')}</div>
              <div className='stat-value'>10K</div>
              <div className='stat-desc'>{t('app.statScaleDescription')}</div>
            </div>
          </div>

          <div className='stats'>
            <div className='stat'>
              <div className='stat-figure text-primary'>
                <Gauge size={24} strokeWidth={2} />
              </div>
              <div className='stat-title'>{t('app.statEngine')}</div>
              <div className='stat-value text-xl'>{sqliteMeta.label}</div>
              <div className='stat-desc'>{sqliteMeta.description}</div>
            </div>
          </div>
        </div>

        <section className='card border-primary/20 bg-base-200/40 mb-10 border'>
          <div className='card-body flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <span className='eyebrow'>research demo</span>
              <h3 className='mt-2 text-xl font-semibold'>{t('app.gitDemoTitle')}</h3>
              <p className='mt-2 max-w-2xl text-sm leading-6 opacity-70'>{t('app.gitDemoDescription')}</p>
            </div>
            <a
              className='btn btn-outline shrink-0 whitespace-nowrap'
              href={BROWSER_GIT_OPFS_DEMO_URL}
              rel='noreferrer'
              target='_blank'
            >
              <GitBranch size={16} aria-hidden />
              {t('app.gitDemoOpen')}
            </a>
          </div>
        </section>

        {/* Results table */}
        <section className='mb-6'>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <span className='eyebrow'>results</span>
            <span className='mono text-[10px] tracking-[0.18em] uppercase opacity-60'>— 01</span>
          </div>
          <div className='card'>
            <div className='card-body p-0'>
              <BenchmarkResults sections={sections} />
            </div>
          </div>
        </section>

        {state === 'completed' && (
          <section className='mt-8'>
            <div className='mb-4 flex items-center justify-between gap-4'>
              <span className='eyebrow'>score</span>
              <span className='mono text-[10px] tracking-[0.18em] uppercase opacity-60'>— 02</span>
            </div>
            <ScoreCard sections={sections} />
          </section>
        )}

        {error && (
          <div className='alert alert-error mt-6'>
            <span className='mono text-xs tracking-wider uppercase opacity-70'>ERROR</span>
            <span>{t('app.errorPrefix', { message: error })}</span>
          </div>
        )}
      </main>

      <footer className='footer footer-center p-4 opacity-70'>
        <div>
          <p>
            RxDB Benchmarks · local-first data infrastructure · {sqliteMeta.label} ·
            <a className='link link-hover' href='/' target='_top'>
              {t('app.backToDocs')}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
