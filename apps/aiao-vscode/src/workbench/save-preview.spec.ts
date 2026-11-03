import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSavePreviewController, type SavePreviewCompile } from './save-preview.js';
import { WorkbenchSession, type WorkbenchBackend, type WorkbenchFiles } from './session.js';

async function fixture() {
  let revision = 1;
  let files: WorkbenchFiles = { 'main.ts': 'initial' };
  const persist: WorkbenchBackend['save'] = async (projectId, next, expected) => {
    if (expected !== String(revision)) throw new Error('revision conflict');
    files = { ...next };
    return { projectId, revision: String(++revision), files };
  };
  const backend: WorkbenchBackend = {
    open: vi.fn(async projectId => ({ projectId, revision: String(revision), files })),
    save: vi.fn(persist),
    create: vi.fn<WorkbenchBackend['create']>(),
    remove: vi.fn<WorkbenchBackend['remove']>(),
    rename: vi.fn<WorkbenchBackend['rename']>(),
    status: vi.fn<WorkbenchBackend['status']>(),
    stage: vi.fn<WorkbenchBackend['stage']>(),
    unstage: vi.fn<WorkbenchBackend['unstage']>(),
    readDiff: vi.fn<WorkbenchBackend['readDiff']>(),
    discardWorking: vi.fn<WorkbenchBackend['discardWorking']>(),
    commit: vi.fn<WorkbenchBackend['commit']>(),
    history: vi.fn<WorkbenchBackend['history']>(),
    restore: vi.fn<WorkbenchBackend['restore']>(),
    exportArchive: vi.fn<WorkbenchBackend['exportArchive']>(),
    importArchive: vi.fn<WorkbenchBackend['importArchive']>(),
    dispose: vi.fn()
  };
  const session = new WorkbenchSession(backend);
  await session.open('project');
  const compile = vi.fn<SavePreviewCompile>(async snapshot => ({ js: String(snapshot.files['main.ts']), css: '' }));
  const phase = vi.fn();
  const error = vi.fn();
  const controller = createSavePreviewController(session, compile, { delayMs: 100, onPhase: phase, onError: error });
  return { session, backend, persist, compile, phase, error, controller };
}

describe('保存后的最新预览调度', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('save 只等真实保存回执，100ms 后后台预览，不触发 Git 提交', async () => {
    const { session, backend, compile, phase, controller } = await fixture();
    session.edit('main.ts', 'saved');
    await controller.save();
    expect(session.state.dirty).toBe(false);
    expect(compile).not.toHaveBeenCalled();
    expect(phase).toHaveBeenLastCalledWith('waiting');
    await vi.advanceTimersByTimeAsync(99);
    expect(compile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(compile).toHaveBeenCalledWith(
      expect.objectContaining({ revision: '2', files: { 'main.ts': 'saved' } }),
      expect.any(AbortSignal)
    );
    expect(session.state.preview?.js).toBe('saved');
    expect(phase.mock.calls.map(call => call[0])).toEqual(['saving', 'waiting', 'compiling', 'idle']);
    expect(backend.commit).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('连续保存只编译最后一次已持久化 revision', async () => {
    const { session, compile, controller } = await fixture();
    session.edit('main.ts', 'second');
    await controller.save();
    await vi.advanceTimersByTimeAsync(50);
    session.edit('main.ts', 'third');
    await controller.save();
    await vi.advanceTimersByTimeAsync(99);
    expect(compile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(compile).toHaveBeenCalledOnce();
    expect(session.state.preview).toMatchObject({ revision: '3', js: 'third' });
    controller.dispose();
  });

  it('同一已保存 revision 重复 CtrlS 不打断在途编译，新的输入仍会触发新保存', async () => {
    const { session, backend, compile, controller } = await fixture();
    const pending = Promise.withResolvers<{ js: string; css: string }>();
    compile.mockImplementationOnce(() => pending.promise);
    session.edit('main.ts', 'saved');
    await controller.save(['main.ts']);
    await vi.advanceTimersByTimeAsync(100);
    const signal = compile.mock.calls[0][1];
    await controller.save(['main.ts']);
    expect(signal.aborted).toBe(false);
    expect(backend.save).toHaveBeenCalledOnce();
    pending.resolve({ js: 'saved', css: '' });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.state.preview?.js).toBe('saved');
    session.edit('main.ts', 'next');
    await controller.save(['main.ts']);
    await vi.advanceTimersByTimeAsync(100);
    expect(backend.save).toHaveBeenCalledTimes(2);
    expect(session.state.preview?.js).toBe('next');
    controller.dispose();
  });

  it('无修改的 CtrlS 不再重编译：成功后跳过，编译失败后同一 revision 重试', async () => {
    const { session, compile, phase, error, controller } = await fixture();
    await controller.run();
    const previous = session.state.preview;
    expect(compile).toHaveBeenCalledOnce();
    await controller.save();
    await vi.advanceTimersByTimeAsync(1000);
    expect(compile).toHaveBeenCalledOnce();
    expect(session.state.preview).toBe(previous);
    expect(phase).toHaveBeenLastCalledWith('idle');
    compile.mockRejectedValueOnce(new Error('syntax error'));
    session.edit('main.ts', 'broken');
    await controller.save();
    await vi.advanceTimersByTimeAsync(100);
    expect(error).toHaveBeenCalledOnce();
    expect(session.state.preview).toBe(previous);
    await controller.save();
    await vi.advanceTimersByTimeAsync(100);
    expect(compile).toHaveBeenCalledTimes(3);
    expect(session.state.preview).toMatchObject({ revision: '2', js: 'broken' });
    controller.dispose();
  });

  it('CtrlS 只保存指定文件，其他 dirty buffer 不进入磁盘快照或预览', async () => {
    const { session, backend, compile, controller } = await fixture();
    session.edit('main.ts', 'active saved');
    session.edit('notes.ts', 'leave unsaved');
    await controller.save(['main.ts']);
    expect(session.isModified('main.ts')).toBe(false);
    expect(session.isModified('notes.ts')).toBe(true);
    expect(session.state.dirty).toBe(true);
    expect(backend.save).toHaveBeenCalledWith('project', { 'main.ts': 'active saved' }, '1');
    await vi.advanceTimersByTimeAsync(100);
    expect(compile.mock.calls[0][0].files).toEqual({ 'main.ts': 'active saved' });
    expect(session.state.preview?.js).toBe('active saved');
    expect(session.state.files['notes.ts']).toBe('leave unsaved');
    expect(backend.commit).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('单文件保存屏障只补存该文件的新输入，不顺带保存另一个文件', async () => {
    const { session, backend, persist, compile, controller } = await fixture();
    const gate = Promise.withResolvers<void>();
    vi.mocked(backend.save).mockImplementationOnce(async (...args) => {
      await gate.promise;
      return persist(...args);
    });
    session.edit('main.ts', 'first input');
    const saved = controller.save(['main.ts']);
    session.edit('main.ts', 'latest input');
    session.edit('notes.ts', 'leave unsaved');
    gate.resolve();
    await saved;
    expect(backend.save).toHaveBeenCalledTimes(2);
    expect(session.isModified('main.ts')).toBe(false);
    expect(session.isModified('notes.ts')).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(compile.mock.calls[0][0].files).toEqual({ 'main.ts': 'latest input' });
    controller.dispose();
  });

  it('保存中继续输入并再次 CtrlS，会补存新缓冲而不是复用旧回执', async () => {
    const { session, backend, persist, compile, controller } = await fixture();
    const gate = Promise.withResolvers<void>();
    vi.mocked(backend.save).mockImplementationOnce(async (...args) => {
      await gate.promise;
      return persist(...args);
    });
    session.edit('main.ts', 'second');
    const first = controller.save();
    session.edit('main.ts', 'third');
    const second = controller.save();
    gate.resolve();
    await Promise.all([first, second]);
    expect(backend.save).toHaveBeenCalledTimes(2);
    expect(session.state.files['main.ts']).toBe('third');
    expect(session.state.dirty).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(compile).toHaveBeenCalledOnce();
    expect(session.state.preview).toMatchObject({ revision: '3', js: 'third' });
    controller.dispose();
  });

  it('单次保存期间的新输入也会跨过保存屏障，未保存内容不会被回执覆盖', async () => {
    const { session, backend, persist, controller } = await fixture();
    const gate = Promise.withResolvers<void>();
    vi.mocked(backend.save).mockImplementationOnce(async (...args) => {
      await gate.promise;
      return persist(...args);
    });
    session.edit('main.ts', 'second');
    const saved = controller.save();
    session.edit('main.ts', 'third');
    gate.resolve();
    await saved;
    expect(backend.save).toHaveBeenCalledTimes(2);
    expect(session.state.files['main.ts']).toBe('third');
    expect(session.state.dirty).toBe(false);
    controller.dispose();
  });

  it('旧编译即使忽略 signal 并在新 debounce 期间返回，也不覆盖成功预览或注入取消错误', async () => {
    const { session, compile, phase, error, controller } = await fixture();
    await controller.run();
    const previous = session.state.preview;
    const stale = Promise.withResolvers<{ js: string; css: string }>();
    compile.mockImplementationOnce(() => stale.promise);
    session.edit('main.ts', 'second');
    await controller.save();
    await vi.advanceTimersByTimeAsync(100);
    const signal = compile.mock.calls[1][1];
    session.edit('main.ts', 'third');
    await controller.save();
    expect(signal.aborted).toBe(true);
    stale.resolve({ js: 'stale', css: '' });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.state.preview).toBe(previous);
    expect(session.state.error).toBeNull();
    expect(phase).toHaveBeenLastCalledWith('waiting');
    expect(error).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(session.state.preview).toMatchObject({ revision: '3', js: 'third' });
    controller.dispose();
  });

  it('不合作的旧编译不会让后续成功预览一直处于 busy', async () => {
    const { session, compile, controller } = await fixture();
    const stale = Promise.withResolvers<{ js: string; css: string }>();
    compile.mockImplementationOnce(() => stale.promise);
    session.edit('main.ts', 'second');
    await controller.save();
    await vi.advanceTimersByTimeAsync(100);
    session.edit('main.ts', 'latest');
    await controller.run();
    expect(session.state.preview?.js).toBe('latest');
    expect(session.state.busy).toBe(false);
    stale.resolve({ js: 'stale', css: '' });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.state.preview?.js).toBe('latest');
    controller.dispose();
  });

  it('后台编译错误只回调一次且保留旧预览，显式 run 错误由 Promise 返回', async () => {
    const { session, compile, phase, error, controller } = await fixture();
    await controller.run();
    const previous = session.state.preview;
    compile.mockRejectedValueOnce(new Error('syntax error'));
    session.edit('main.ts', 'broken');
    await controller.save();
    await vi.advanceTimersByTimeAsync(100);
    expect(session.state.preview).toBe(previous);
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'syntax error' }));
    expect(phase).toHaveBeenLastCalledWith('error');
    compile.mockRejectedValueOnce(new Error('manual failure'));
    await expect(controller.run()).rejects.toThrow('manual failure');
    expect(error).toHaveBeenCalledOnce();
    expect(session.state.preview).toBe(previous);
    controller.dispose();
  });

  it('手动运行立即取代 debounce，后续定时器不会重复编译', async () => {
    const { session, compile, controller } = await fixture();
    session.edit('main.ts', 'run now');
    await controller.save();
    await controller.run();
    expect(compile).toHaveBeenCalledOnce();
    expect(session.state.preview?.js).toBe('run now');
    await vi.advanceTimersByTimeAsync(1000);
    expect(compile).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('自动初始预览只编译 saved snapshot，不能把用户刚输入的 draft 顺带保存', async () => {
    const { session, backend, compile, phase, controller } = await fixture();
    session.edit('main.ts', 'draft without save');
    await controller.runSaved();
    expect(backend.save).not.toHaveBeenCalled();
    expect(compile.mock.calls[0][0].files).toEqual({ 'main.ts': 'initial' });
    expect(session.state.preview).toMatchObject({ revision: '1', js: 'initial' });
    expect(session.state.files['main.ts']).toBe('draft without save');
    expect(session.state.dirty).toBe(true);
    expect(phase.mock.calls.map(call => call[0])).toEqual(['compiling', 'idle']);
    controller.dispose();
  });

  it('保存失败保留 dirty buffer，不安排编译也不重复回调错误', async () => {
    const { session, backend, compile, phase, error, controller } = await fixture();
    session.edit('main.ts', 'keep input');
    vi.mocked(backend.save).mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(controller.save()).rejects.toThrow('quota exceeded');
    expect(session.state.dirty).toBe(true);
    expect(session.state.files['main.ts']).toBe('keep input');
    expect(phase).toHaveBeenLastCalledWith('error');
    await vi.advanceTimersByTimeAsync(1000);
    expect(compile).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('取消后台工作不打断正在落盘的快照，也不丢弃后来的输入', async () => {
    const { session, backend, persist, compile, controller } = await fixture();
    const gate = Promise.withResolvers<void>();
    vi.mocked(backend.save).mockImplementationOnce(async (...args) => {
      await gate.promise;
      return persist(...args);
    });
    session.edit('main.ts', 'second');
    const saved = controller.save();
    controller.cancel();
    session.edit('main.ts', 'later input');
    gate.resolve();
    await saved;
    expect(session.state.files['main.ts']).toBe('later input');
    expect(session.state.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(compile).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('cancel 清理排程，dispose 中断编译且阻止迟到事件与后续保存', async () => {
    const { session, compile, phase, error, controller } = await fixture();
    session.edit('main.ts', 'second');
    await controller.save();
    controller.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(compile).not.toHaveBeenCalled();
    const pending = Promise.withResolvers<{ js: string; css: string }>();
    compile.mockImplementationOnce(() => pending.promise);
    await controller.save();
    await vi.advanceTimersByTimeAsync(100);
    const signal = compile.mock.calls[0][1];
    controller.dispose();
    const count = phase.mock.calls.length;
    expect(signal.aborted).toBe(true);
    pending.reject(new DOMException('cancelled', 'AbortError'));
    await vi.advanceTimersByTimeAsync(0);
    expect(error).not.toHaveBeenCalled();
    expect(phase).toHaveBeenCalledTimes(count);
    expect(session.state.error).toBeNull();
    await expect(controller.save()).rejects.toThrow('已经释放');
    await expect(controller.run()).rejects.toThrow('已经释放');
    await expect(controller.runSaved()).rejects.toThrow('已经释放');
    expect(() => controller.cancel()).not.toThrow();
    expect(() => controller.dispose()).not.toThrow();
    session.dispose();
  });

  it('项目切换前取消排程，旧快照不会进入新项目', async () => {
    const { session, compile, controller } = await fixture();
    session.edit('main.ts', 'saved');
    await controller.save();
    controller.cancel();
    await session.open('another');
    await vi.advanceTimersByTimeAsync(1000);
    expect(compile).not.toHaveBeenCalled();
    expect(session.state.projectId).toBe('another');
    controller.dispose();
  });
});
