import type { MiniProgramHost } from '@aiao/rxdb-adapter-miniprogram';
import { Button, Checkbox, CheckboxGroup, Input, Label, Text, View } from '@tarojs/components';
import { useLoad, useUnload } from '@tarojs/taro';
import { useCallback, useRef, useState } from 'react';
import type { BenchmarkResult, BenchmarkSuiteInfo } from '../../benchmark/scenarios';
import { formatBenchmarkValue } from '../../benchmark/stats';
import { logFailure } from '../../debug-log';
import {
  currentDemoRuntime,
  getMiniProgramRuntimeReferences,
  inspectMiniProgramRuntime,
  type MiniProgramDemoRuntime,
  type RuntimeCapability
} from '../../runtime-preflight';
import { openMiniProgramRxdbDemo, type DemoCheck, type MiniProgramRxdbDemo, type TodoItem } from '../../rxdb-demo';
import './index.scss';

type DemoPhase = 'checking' | 'ready' | 'blocked' | 'error';
type CheckStatus = 'waiting' | 'running' | 'passed' | 'pending' | 'failed';
type BenchmarkPhase = 'idle' | 'running' | 'completed' | 'failed';

interface CheckView {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: DemoCheck['detail'];
}

interface BenchmarkSuiteView extends BenchmarkSuiteInfo {
  readonly results: readonly BenchmarkResult[];
}

const INITIAL_CHECKS: readonly CheckView[] = [
  { name: 'Todo CRUD 自检', status: 'waiting', detail: '等待数据库连接' },
  { name: '断开重连验证', status: 'waiting', detail: '等待数据库连接' },
  { name: '跨启动持久化', status: 'waiting', detail: '等待数据库连接' }
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusText(status: CheckStatus): string {
  return {
    waiting: '等待',
    running: '验证中',
    passed: '通过',
    pending: '待重启',
    failed: '失败'
  }[status];
}

function phaseText(phase: DemoPhase): string {
  return {
    checking: '初始化中',
    ready: '数据库已连接',
    blocked: '运行时不满足要求',
    error: '初始化失败'
  }[phase];
}

function benchmarkPhaseText(phase: BenchmarkPhase): string {
  return {
    idle: '未运行',
    running: '运行中',
    completed: '已完成',
    failed: '失败'
  }[phase];
}

function appendBenchmarkResult(
  suites: readonly BenchmarkSuiteView[],
  suiteId: string,
  result: BenchmarkResult
): readonly BenchmarkSuiteView[] {
  return suites.map(suite => (suite.id === suiteId ? { ...suite, results: [...suite.results, result] } : suite));
}

/** 来源为平台 id 时即宿主随机源，按宿主简称显示为「微信桥接」这类文案。 */
function capabilityStatus(capability: RuntimeCapability, shortName: string): string {
  if (!capability.available) return capability.polyfillable ? '待引导' : '缺失';
  const source = capability.source ?? 'native';
  if (source === 'missing') return '缺失';
  if (source === 'native') return '原生';
  if (source === 'polyfill') return 'Polyfill';
  return `${shortName}桥接`;
}

/** 解析宿主并做引导前预检；拿不到平台全局或真实全局对象时抛错。 */
function preflight(): { runtime: MiniProgramDemoRuntime; capabilities: readonly RuntimeCapability[] } {
  const runtime = currentDemoRuntime();
  return { runtime, capabilities: inspectMiniProgramRuntime(runtime) };
}

export default function Index() {
  const demoRef = useRef<MiniProgramRxdbDemo>();
  const [phase, setPhase] = useState<DemoPhase>('checking');
  const [capabilities, setCapabilities] = useState<readonly RuntimeCapability[]>([]);
  const [checks, setChecks] = useState<readonly CheckView[]>(INITIAL_CHECKS);
  const [todos, setTodos] = useState<readonly TodoItem[]>([]);
  const [sqliteVersion, setSqliteVersion] = useState('等待连接');
  const [title, setTitle] = useState('');
  const [operation, setOperation] = useState('正在检查小程序运行时');
  const [host, setHost] = useState<MiniProgramHost>();
  const [busy, setBusy] = useState(false);
  const [benchmarkPhase, setBenchmarkPhase] = useState<BenchmarkPhase>('idle');
  const [benchmarkSuites, setBenchmarkSuites] = useState<readonly BenchmarkSuiteView[]>([]);

  const verifyReconnect = useCallback(async (demo: MiniProgramRxdbDemo) => {
    setChecks(current =>
      current.map(check =>
        check.name === '跨启动持久化' ? check : { ...check, status: 'running', detail: '正在执行验证' }
      )
    );
    try {
      const result = await demo.verifyReconnect();
      setChecks(current =>
        current.map(check => {
          if (check.name === 'Todo CRUD 自检') return { ...check, ...result.crud };
          if (check.name === '断开重连验证') return { ...check, ...result.reconnect };
          return check;
        })
      );
      setTodos(await demo.listTodos());
      setOperation('数据库验证完成');
    } catch (error) {
      logFailure('数据库验证', error);
      const detail = errorMessage(error);
      setChecks(current =>
        current.map(check => (check.name === '跨启动持久化' ? check : { ...check, status: 'failed', detail }))
      );
      setOperation(detail);
    }
  }, []);

  const start = useCallback(async () => {
    let checked: ReturnType<typeof preflight>;
    try {
      checked = preflight();
    } catch (error) {
      logFailure('运行时预检', error);
      setPhase('error');
      setOperation(errorMessage(error));
      return;
    }
    const { runtime, capabilities: inspected } = checked;
    setHost(runtime.host);
    setCapabilities(inspected);
    if (inspected.some(capability => !capability.available && !capability.polyfillable)) {
      setPhase('blocked');
      setOperation(`${runtime.host.displayName}运行时缺少 RxDB 依赖能力`);
      return;
    }

    setBusy(true);
    setPhase('checking');
    setOperation('正在引导运行时并加载 RxDB 与 wa-sqlite');
    try {
      const result = await openMiniProgramRxdbDemo(getMiniProgramRuntimeReferences(runtime));
      demoRef.current = result.demo;
      setCapabilities(result.capabilities);
      setSqliteVersion(result.sqliteVersion);
      setTodos(await result.demo.listTodos());
      setChecks(current =>
        current.map(check => (check.name === '跨启动持久化' ? { ...check, ...result.launchPersistence } : check))
      );
      setPhase('ready');
      await verifyReconnect(result.demo);
    } catch (error) {
      logFailure('初始化', error);
      setPhase('error');
      setOperation(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [verifyReconnect]);

  useLoad(() => {
    void start();
  });

  useUnload(() => {
    void demoRef.current?.dispose();
  });

  const runTodoOperation = useCallback(
    async (action: (demo: MiniProgramRxdbDemo) => Promise<TodoItem[]>, message: string) => {
      const demo = demoRef.current;
      if (!demo || busy) return;
      setBusy(true);
      try {
        setTodos(await action(demo));
        setOperation(message);
      } catch (error) {
        logFailure('Todo 操作', error);
        setOperation(errorMessage(error));
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  const addTodo = useCallback(() => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setOperation('请输入 Todo 内容');
      return;
    }
    void runTodoOperation(demo => demo.addTodo(normalizedTitle), 'Todo 已添加');
    setTitle('');
  }, [runTodoOperation, title]);

  const resetDemoData = useCallback(() => {
    void runTodoOperation(demo => demo.resetDemoData(), '演示数据已清空');
    // 探针刚被删掉，卡片上那条结论已经过期——照实改回待重启，别留着上一轮的「通过」。
    setChecks(current =>
      current.map(check =>
        check.name === '跨启动持久化' ?
          { ...check, status: 'pending' as const, detail: '已清空探针；重新启动后重新验证' }
        : check
      )
    );
  }, [runTodoOperation]);

  const runManualVerification = useCallback(() => {
    const demo = demoRef.current;
    if (!demo || busy) return;
    setBusy(true);
    void verifyReconnect(demo).finally(() => setBusy(false));
  }, [busy, verifyReconnect]);

  const runBenchmark = useCallback(async () => {
    const demo = demoRef.current;
    if (!demo || busy) return;
    setBusy(true);
    setBenchmarkPhase('running');
    setBenchmarkSuites([]);
    setOperation('性能测试运行中');
    try {
      await demo.runBenchmark({
        onSuiteStart: suite => setBenchmarkSuites(current => [...current, { ...suite, results: [] }]),
        onResult: (suiteId, result) => setBenchmarkSuites(current => appendBenchmarkResult(current, suiteId, result))
      });
      setBenchmarkPhase('completed');
      setOperation('性能测试完成');
    } catch (error) {
      logFailure('性能测试', error);
      setBenchmarkPhase('failed');
      setOperation(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <View className='index'>
      <View className='topline'>
        <View>
          <Text className='eyebrow'>{host ? `${host.platform.toUpperCase()} MINIPROGRAM` : 'MINIPROGRAM'}</Text>
          <Text className='title'>wa-sqlite x RxDB</Text>
        </View>
        <View className={`phase phase-${phase}`}>
          <Text>{phaseText(phase)}</Text>
        </View>
      </View>

      <View className='runtime-summary'>
        <View className='summary-item summary-sqlite'>
          <Text className='summary-label'>SQLite</Text>
          <Text className='summary-value'>{sqliteVersion}</Text>
        </View>
        <View className='summary-item summary-operation'>
          <Text className='summary-label'>状态</Text>
          <Text className='summary-value'>{operation}</Text>
        </View>
      </View>

      <View className='section capabilities-section'>
        <View className='section-heading'>
          <Text className='section-title'>运行时能力</Text>
          <Text className='section-meta'>
            {capabilities.filter(item => item.available).length}/{capabilities.length}
          </Text>
        </View>
        <View className='capability-grid'>
          {capabilities.map(capability => (
            <View className='capability-row' key={capability.name}>
              <Text className='capability-name'>{capability.name}</Text>
              <Text className={capability.available ? 'capability-ok' : 'capability-failed'}>
                {capabilityStatus(capability, host?.shortName ?? '宿主')}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section checks-section'>
        <View className='section-heading'>
          <Text className='section-title'>验证状态</Text>
          <Button
            className='verify-button reset-button'
            size='mini'
            disabled={phase !== 'ready' || busy}
            onClick={resetDemoData}
          >
            重置数据
          </Button>
          <Button
            className='verify-button'
            size='mini'
            disabled={phase !== 'ready' || busy}
            onClick={runManualVerification}
          >
            重跑验证
          </Button>
        </View>
        {checks.map(check => (
          <View className='check-row' key={check.name}>
            <View className='check-copy'>
              <Text className='check-name'>{check.name}</Text>
              <Text className='check-detail'>{check.detail}</Text>
            </View>
            <Text className={`check-status check-status-${check.status}`}>{statusText(check.status)}</Text>
          </View>
        ))}
      </View>

      <View className='section todo-section'>
        <View className='section-heading'>
          <Text className='section-title'>Todo</Text>
          <Text className='section-meta'>{todos.length}</Text>
        </View>
        <View className='todo-composer'>
          <Input
            className='todo-input'
            value={title}
            maxlength={80}
            placeholder='输入待办事项'
            disabled={phase !== 'ready' || busy}
            onInput={event => setTitle(event.detail.value)}
            onConfirm={addTodo}
          />
          <Button className='add-button' disabled={phase !== 'ready' || busy} onClick={addTodo}>
            添加
          </Button>
        </View>
        <View className='todo-list'>
          {todos.map(todo => (
            <View className='todo-row' key={todo.id}>
              <CheckboxGroup onChange={() => void runTodoOperation(demo => demo.toggleTodo(todo.id), 'Todo 已更新')}>
                <Label className='todo-main'>
                  <Checkbox value={todo.id} checked={todo.completed} color='#0f7c67' disabled={busy} />
                  <Text className={todo.completed ? 'todo-title todo-completed' : 'todo-title'}>{todo.title}</Text>
                </Label>
              </CheckboxGroup>
              <Button
                className='remove-button'
                size='mini'
                disabled={busy}
                onClick={() => void runTodoOperation(demo => demo.removeTodo(todo.id), 'Todo 已删除')}
              >
                删除
              </Button>
            </View>
          ))}
          {phase === 'ready' && todos.length === 0 ?
            <Text className='empty-state'>暂无 Todo</Text>
          : null}
        </View>
      </View>

      <View className='section benchmark-section'>
        <View className='section-heading'>
          <Text className='section-title'>性能测试</Text>
          <Text className={`section-meta benchmark-phase-${benchmarkPhase}`}>{benchmarkPhaseText(benchmarkPhase)}</Text>
          <Button
            className='verify-button benchmark-button'
            size='mini'
            disabled={phase !== 'ready' || busy}
            onClick={() => void runBenchmark()}
          >
            {benchmarkPhase === 'idle' ? '开始测试' : '重新测试'}
          </Button>
        </View>
        {benchmarkPhase === 'idle' ?
          <Text className='benchmark-hint'>
            点击后才运行：吞吐量、延迟分布、扩展性、并发四组，数据写入独立的 benchmark_todo 表，跑完清空，不影响上面的
            Todo。
          </Text>
        : null}
        {benchmarkSuites.map(suite => (
          <View className='benchmark-suite' key={suite.id}>
            <Text className='benchmark-suite-title'>{suite.title}</Text>
            {suite.results.map(result => (
              <View className='benchmark-row' key={result.name}>
                <View className='benchmark-copy'>
                  <Text className='benchmark-name'>{result.name}</Text>
                  <Text className='benchmark-detail'>{result.detail}</Text>
                </View>
                <Text className='benchmark-value'>{formatBenchmarkValue(result)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
