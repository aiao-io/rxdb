import { Button, Checkbox, CheckboxGroup, Input, Label, Text, View } from '@tarojs/components';
import { useLoad, useUnload } from '@tarojs/taro';
import { useCallback, useRef, useState } from 'react';
import {
  getMiniProgramRuntimeReferences,
  inspectMiniProgramRuntime,
  type RuntimeCapability
} from '../../runtime-preflight';
import { openMiniProgramRxdbDemo, type DemoCheck, type MiniProgramRxdbDemo, type TodoItem } from '../../rxdb-demo';
import './index.scss';

type DemoPhase = 'checking' | 'ready' | 'blocked' | 'error';
type CheckStatus = 'waiting' | 'running' | 'passed' | 'pending' | 'failed';

interface CheckView {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: DemoCheck['detail'];
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

function capabilityStatus(capability: RuntimeCapability): string {
  if (!capability.available) return capability.polyfillable ? '待引导' : '缺失';
  return {
    missing: '缺失',
    native: '原生',
    polyfill: 'Polyfill',
    wechat: '微信桥接'
  }[capability.source ?? 'native'];
}

export default function Index() {
  const demoRef = useRef<MiniProgramRxdbDemo>();
  const [phase, setPhase] = useState<DemoPhase>('checking');
  const [capabilities, setCapabilities] = useState<readonly RuntimeCapability[]>([]);
  const [checks, setChecks] = useState<readonly CheckView[]>(INITIAL_CHECKS);
  const [todos, setTodos] = useState<readonly TodoItem[]>([]);
  const [sqliteVersion, setSqliteVersion] = useState('等待连接');
  const [title, setTitle] = useState('');
  const [operation, setOperation] = useState('正在检查微信运行时');
  const [busy, setBusy] = useState(false);

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
      const detail = errorMessage(error);
      setChecks(current =>
        current.map(check => (check.name === '跨启动持久化' ? check : { ...check, status: 'failed', detail }))
      );
      setOperation(detail);
    }
  }, []);

  const start = useCallback(async () => {
    const preflight = inspectMiniProgramRuntime();
    setCapabilities(preflight);
    if (preflight.some(capability => !capability.available && !capability.polyfillable)) {
      setPhase('blocked');
      setOperation('微信运行时缺少 RxDB 依赖能力');
      return;
    }

    setBusy(true);
    setPhase('checking');
    setOperation('正在引导运行时并加载 RxDB 与 wa-sqlite');
    try {
      const result = await openMiniProgramRxdbDemo(getMiniProgramRuntimeReferences());
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

  const runManualVerification = useCallback(() => {
    const demo = demoRef.current;
    if (!demo || busy) return;
    setBusy(true);
    void verifyReconnect(demo).finally(() => setBusy(false));
  }, [busy, verifyReconnect]);

  return (
    <View className='index'>
      <View className='topline'>
        <View>
          <Text className='eyebrow'>WECHAT MINIPROGRAM</Text>
          <Text className='title'>wa-sqlite x RxDB</Text>
        </View>
        <View className={`phase phase-${phase}`}>
          <Text>{phaseText(phase)}</Text>
        </View>
      </View>

      <View className='runtime-summary'>
        <View className='summary-item'>
          <Text className='summary-label'>SQLite</Text>
          <Text className='summary-value'>{sqliteVersion}</Text>
        </View>
        <View className='summary-item summary-version'>
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
                {capabilityStatus(capability)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section checks-section'>
        <View className='section-heading'>
          <Text className='section-title'>验证状态</Text>
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
    </View>
  );
}
