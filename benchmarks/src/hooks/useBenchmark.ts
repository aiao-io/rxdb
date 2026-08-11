import { RxDB } from '@aiao/rxdb';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDB } from '../clear-db';
import type { BenchmarkResult } from '../constants';
import { runConcurrencyTests } from '../scenarios/concurrency';
import { runLatencyTests } from '../scenarios/latency';
import { runScalabilityTests } from '../scenarios/scalability';
import { runThroughputTests } from '../scenarios/throughput';
import { createRxDB, type BenchmarkSqliteAdapter } from '../utils/rxdb-factory';

export type BenchmarkState = 'idle' | 'running' | 'completed' | 'error';

export interface BenchmarkSection {
  title: string;
  icon: string;
  results: BenchmarkResult[];
}

const BENCHMARK_SUITES = [
  { id: 'throughput', title: '吞吐量测试', icon: 'throughput', runner: runThroughputTests },
  { id: 'latency', title: '延迟分布测试', icon: 'latency', runner: runLatencyTests },
  { id: 'scalability', title: '扩展性测试', icon: 'scalability', runner: runScalabilityTests },
  { id: 'concurrency', title: '并发性能测试', icon: 'concurrency', runner: runConcurrencyTests }
] as const;

export function useBenchmark(sqliteAdapter: BenchmarkSqliteAdapter) {
  const [state, setState] = useState<BenchmarkState>('idle');
  const [sections, setSections] = useState<BenchmarkSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rxdbRef = useRef<RxDB | null>(null);
  const sqliteAdapterRef = useRef(sqliteAdapter);
  const benchmarkRunRef = useRef(0);

  const disconnectCurrentDatabase = useCallback(async () => {
    const current = rxdbRef.current;
    rxdbRef.current = null;

    if (!current) return;

    await current.disconnectAll();
  }, []);

  const clearBenchmarkStorage = useCallback(async (reason: string) => {
    try {
      await clearDB();
    } catch (err) {
      console.warn(`Benchmark storage cleanup skipped during ${reason}:`, err);
    }
  }, []);

  const createFreshBenchmarkDatabase = useCallback(
    async (adapter: BenchmarkSqliteAdapter, dbName: string) => {
      await disconnectCurrentDatabase();

      const nextRxdb = await createRxDB(dbName, adapter);
      rxdbRef.current = nextRxdb;

      return nextRxdb;
    },
    [disconnectCurrentDatabase]
  );

  useEffect(() => {
    return () => {
      void disconnectCurrentDatabase();
    };
  }, [disconnectCurrentDatabase]);

  useEffect(() => {
    if (sqliteAdapterRef.current === sqliteAdapter) return;

    sqliteAdapterRef.current = sqliteAdapter;
    setSections([]);
    setError(null);
    setState('idle');

    // 使用 token 防止快速切换 adapter 时多次 clearDB 竞态执行。
    let cancelled = false;
    void (async () => {
      try {
        await disconnectCurrentDatabase();
        if (cancelled) return;
        await clearBenchmarkStorage('adapter switch');
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to clear benchmark database after adapter switch:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearBenchmarkStorage, disconnectCurrentDatabase, sqliteAdapter]);

  /**
   * 运行所有基准测试
   */
  const runBenchmarks = useCallback(async () => {
    setState('running');
    setError(null);
    setSections([]);

    try {
      const benchmarkRunId = ++benchmarkRunRef.current;
      const newSections: BenchmarkSection[] = [];

      await disconnectCurrentDatabase();
      await clearBenchmarkStorage('benchmark start');

      for (const suite of BENCHMARK_SUITES) {
        const suiteRxdb = await createFreshBenchmarkDatabase(
          sqliteAdapter,
          `benchmark-db-run-${benchmarkRunId}-${suite.id}`
        );
        const sectionIndex = newSections.length;
        const section: BenchmarkSection = { title: suite.title, icon: suite.icon, results: [] };
        newSections.push(section);
        setSections(prev => [...prev, section]);

        const onResult = (result: BenchmarkResult) => {
          setSections(prev => {
            const updated = [...prev];
            updated[sectionIndex] = { ...updated[sectionIndex], results: [...updated[sectionIndex].results, result] };
            return updated;
          });
        };

        await suite.runner(suiteRxdb, onResult);
      }

      await disconnectCurrentDatabase();
      await clearBenchmarkStorage('benchmark completion');
      setState('completed');
    } catch (err) {
      console.error('Benchmark failed:', err);
      await disconnectCurrentDatabase().catch(disconnectError => {
        console.error('Failed to disconnect benchmark database after error:', disconnectError);
      });
      await clearBenchmarkStorage('benchmark failure');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, [clearBenchmarkStorage, createFreshBenchmarkDatabase, disconnectCurrentDatabase, sqliteAdapter]);

  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const getAllResults = useCallback((): BenchmarkResult[] => {
    return sectionsRef.current.flatMap(section => section.results);
  }, []);

  return {
    state,
    sections,
    error,
    runBenchmarks,
    getAllResults,
    isRunning: state === 'running'
  };
}
