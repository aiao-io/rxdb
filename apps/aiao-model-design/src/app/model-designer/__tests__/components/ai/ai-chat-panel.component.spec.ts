import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import type { AiOperationState } from '../../../services/ai-state.types';
import { AiChatPanelComponent } from '../../../components/ai/ai-chat-panel.component';

/**
 * Angular 21 JIT (Vitest/happy-dom) 不支持 signal inputs 的模板绑定测试（NG0303），
 * 采用 class-level 测试：通过 Object.defineProperty 覆盖 InputSignal 为可写 signal，
 * 验证 computed signals 和方法逻辑。DOM 渲染测试由 E2E 覆盖。
 */

function createComponent(overrides?: {
  operationState?: AiOperationState;
  canStartOperation?: boolean;
  isOffline?: boolean;
  activeSessionId?: string;
}) {
  return TestBed.runInInjectionContext(() => {
    const c = new AiChatPanelComponent();
    const opState = signal<AiOperationState>(overrides?.operationState ?? 'idle');
    const canStart = signal(overrides?.canStartOperation ?? true);
    const offline = signal(overrides?.isOffline ?? false);
    const activeSession = signal<string | undefined>(overrides?.activeSessionId);
    Object.defineProperty(c, 'operationState', { value: opState, writable: false });
    Object.defineProperty(c, 'canStartOperation', { value: canStart, writable: false });
    Object.defineProperty(c, 'isOffline', { value: offline, writable: false });
    Object.defineProperty(c, 'activeSessionId', { value: activeSession, writable: false });
    return { component: c, opState, canStart, offline, activeSession };
  });
}

describe('AiChatPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
    });
  });

  describe('canInput computed', () => {
    it('should return true when idle', () => {
      const { component } = createComponent({ operationState: 'idle' });
      expect(component['canInput']()).toBe(true);
    });

    it('should return true when previewing', () => {
      const { component } = createComponent({ operationState: 'previewing' });
      expect(component['canInput']()).toBe(true);
    });

    it('should return false when generating', () => {
      const { component } = createComponent({ operationState: 'generating' });
      expect(component['canInput']()).toBe(false);
    });

    it('should return false when offline', () => {
      const { component } = createComponent({ isOffline: true });
      expect(component['canInput']()).toBe(false);
    });

    it('should return false when canStartOperation is false', () => {
      const { component } = createComponent({ canStartOperation: false });
      expect(component['canInput']()).toBe(false);
    });
  });

  describe('blockingMessage computed', () => {
    it('should return offline message when offline', () => {
      const { component } = createComponent({ isOffline: true });
      expect(component['blockingMessage']()).toBe(DEFAULT_TRANSLATIONS.ai.offline);
    });

    it('should return pendingChanges message when canStartOperation is false', () => {
      const { component } = createComponent({ canStartOperation: false });
      expect(component['blockingMessage']()).toBe(DEFAULT_TRANSLATIONS.ai.pendingChanges);
    });

    it('should return empty string when no blocking condition', () => {
      const { component } = createComponent();
      expect(component['blockingMessage']()).toBe('');
    });
  });

  describe('canSend computed', () => {
    it('should return false when input is empty', () => {
      const { component } = createComponent();
      expect(component['canSend']()).toBe(false);
    });

    it('should return false when input is whitespace only', () => {
      const { component } = createComponent();
      component['inputValue'].set('   ');
      expect(component['canSend']()).toBe(false);
    });

    it('should return true when input has content and canInput', () => {
      const { component } = createComponent();
      component['inputValue'].set('Create a blog');
      expect(component['canSend']()).toBe(true);
    });

    it('should return false when input has content but offline', () => {
      const { component } = createComponent({ isOffline: true });
      component['inputValue'].set('Create a blog');
      expect(component['canSend']()).toBe(false);
    });
  });

  describe('onSend method', () => {
    it('should emit sendMessage with trimmed value', () => {
      const { component } = createComponent();
      let emitted: string | undefined;
      component.sendMessage.subscribe((v: string) => (emitted = v));

      component['inputValue'].set('  Create a blog  ');
      component['onSend']();

      expect(emitted).toBe('Create a blog');
    });

    it('should clear input after sending', () => {
      const { component } = createComponent();
      component.sendMessage.subscribe(() => void 0);
      component['inputValue'].set('Hello');
      component['onSend']();

      expect(component['inputValue']()).toBe('');
    });

    it('should not emit when input is empty', () => {
      const { component } = createComponent();
      let emitted = false;
      component.sendMessage.subscribe(() => (emitted = true));

      component['inputValue'].set('');
      component['onSend']();

      expect(emitted).toBe(false);
    });
  });

  describe('onEnterKey method', () => {
    it('should send on plain Enter when canSend', () => {
      const { component } = createComponent();
      let emitted = false;
      component.sendMessage.subscribe(() => (emitted = true));
      component['inputValue'].set('test');

      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      component['onEnterKey'](event);

      expect(emitted).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not send on Shift+Enter', () => {
      const { component } = createComponent();
      let emitted = false;
      component.sendMessage.subscribe(() => (emitted = true));
      component['inputValue'].set('test');

      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
      component['onEnterKey'](event);

      expect(emitted).toBe(false);
    });
  });

  describe('onInput method', () => {
    it('should update inputValue from event target', () => {
      const { component } = createComponent();
      const textarea = document.createElement('textarea');
      textarea.value = 'new text';
      const event = new Event('input');
      Object.defineProperty(event, 'target', { value: textarea });
      component['onInput'](event);

      expect(component['inputValue']()).toBe('new text');
    });
  });

  describe('currentView computed', () => {
    it('should return list when no active session', () => {
      const { component } = createComponent();
      expect(component['currentView']()).toBe('list');
    });

    it('should return chat when active session is set', () => {
      const { component } = createComponent({ activeSessionId: 'session-1' });
      expect(component['currentView']()).toBe('chat');
    });

    it('should switch from chat to list when session is cleared', () => {
      const { component, activeSession } = createComponent({ activeSessionId: 'session-1' });
      expect(component['currentView']()).toBe('chat');
      activeSession.set(undefined);
      expect(component['currentView']()).toBe('list');
    });
  });
});
