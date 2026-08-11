import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { BarChart3, FileDown, Gauge, Play, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BenchmarkResults } from '../components/BenchmarkResults';
import { ScoreCard } from '../components/ScoreCard';
import { ThemeToggle } from '../components/ThemeToggle';
import { useBenchmark } from '../hooks/useBenchmark';
import { exportResultsAsCSV, exportResultsAsJSON } from '../utils/export-results';
import {
  BENCHMARK_SQLITE_OPTIONS,
  DEFAULT_BENCHMARK_SQLITE_ADAPTER,
  getBenchmarkSqliteMeta,
  type BenchmarkSqliteAdapter
} from '../utils/rxdb-factory';

requestIdleCallbackPolyfill();

export function App() {
  const [sqliteAdapter, setSqliteAdapter] = useState<BenchmarkSqliteAdapter>(DEFAULT_BENCHMARK_SQLITE_ADAPTER);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const sqliteMeta = getBenchmarkSqliteMeta(sqliteAdapter);
  const { state, sections, error, runBenchmarks, getAllResults, isRunning } = useBenchmark(sqliteAdapter);

  useEffect(() => {
    document.title = `RxDB Benchmarks (${sqliteMeta.label})`;
  }, [sqliteMeta.label]);

  // 关闭 daisyUI dropdown：在选项被激活后移除焦点
  const closeDropdown = useCallback(() => {
    exportButtonRef.current?.blur();
  }, []);

  const handleExport = useCallback(
    (exporter: (results: ReturnType<typeof getAllResults>) => void) => {
      const results = getAllResults();
      if (results.length === 0) {
        setExportError('请先运行测试');
        return;
      }
      setExportError(null);
      exporter(results);
      closeDropdown();
    },
    [closeDropdown, getAllResults]
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
          <label className='select select-xs' aria-label='选择数据库适配器'>
            <span className='label'>适配器</span>
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
              aria-label='导出测试结果'
              aria-haspopup='menu'
              onKeyDown={handleExportKeyDown}
            >
              <FileDown size={14} aria-hidden />
              导出
            </button>
            <ul role='menu' className='dropdown-content menu z-[1] w-32 p-2'>
              <li role='none'>
                <button role='menuitem' onClick={() => handleExport(exportResultsAsJSON)}>
                  JSON
                </button>
              </li>
              <li role='none'>
                <button role='menuitem' onClick={() => handleExport(exportResultsAsCSV)}>
                  CSV
                </button>
              </li>
            </ul>
          </div>
          <button
            className='btn btn-primary btn-sm shrink-0 whitespace-nowrap'
            onClick={runBenchmarks}
            disabled={isRunning}
            aria-label='开始性能测试'
          >
            {!isRunning && <Play size={14} aria-hidden />}
            {isRunning ? '运行中' : '开始测试'}
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
          <h2 className='max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl'>
            本地数据库性能 · 真实浏览器内测量
          </h2>
          <p className='mt-4 text-sm leading-6 opacity-70 sm:text-base sm:leading-7'>
            在当前浏览器环境下，运行吞吐量、延迟、扩展性与并发四类场景，直接测量数据库引擎的真实开销，而非理论指标。
          </p>
        </section>

        {/* Info Cards */}
        <div className='mb-10 grid grid-cols-1 gap-4 md:grid-cols-3'>
          <div className='stats'>
            <div className='stat'>
              <div className='stat-figure text-primary'>
                <TrendingUp size={24} strokeWidth={2} />
              </div>
              <div className='stat-title'>测试场景</div>
              <div className='stat-value text-primary'>4</div>
              <div className='stat-desc'>吞吐量 · 延迟 · 扩展性 · 并发</div>
            </div>
          </div>

          <div className='stats'>
            <div className='stat'>
              <div className='stat-figure text-primary'>
                <BarChart3 size={24} strokeWidth={2} />
              </div>
              <div className='stat-title'>数据规模</div>
              <div className='stat-value'>10K</div>
              <div className='stat-desc'>基线测试数据量</div>
            </div>
          </div>

          <div className='stats'>
            <div className='stat'>
              <div className='stat-figure text-primary'>
                <Gauge size={24} strokeWidth={2} />
              </div>
              <div className='stat-title'>数据库引擎</div>
              <div className='stat-value text-xl'>{sqliteMeta.label}</div>
              <div className='stat-desc'>{sqliteMeta.description}</div>
            </div>
          </div>
        </div>

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
            <span>测试失败: {error}</span>
          </div>
        )}
      </main>

      <footer className='footer footer-center p-4 opacity-70'>
        <div>
          <p>
            RxDB Benchmarks · local-first data infrastructure · {sqliteMeta.label} ·
            <a className='link link-hover' href='/' target='_top'>
              返回文档
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
