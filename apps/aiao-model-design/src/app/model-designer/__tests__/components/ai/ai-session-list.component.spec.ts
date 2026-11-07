import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import { AiSessionListComponent, type ChatSessionItem } from '../../../components/ai/ai-session-list.component';

function createComponent(sessions: ChatSessionItem[] = [], activeId?: string) {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const comp = TestBed.runInInjectionContext(() => new AiSessionListComponent());
  Object.defineProperty(comp, 'sessions', { value: signal(sessions), writable: false });
  if (activeId) {
    Object.defineProperty(comp, 'activeSessionId', { value: signal(activeId), writable: false });
  }
  return comp;
}

const SESSIONS: ChatSessionItem[] = [
  { id: 's1', name: '会话一', lastUsedAt: '2024-06-01' },
  { id: 's2', name: '会话二', lastUsedAt: '2024-06-02' }
];

describe('AiSessionListComponent', () => {
  it('should expose sessions input', () => {
    const comp = createComponent(SESSIONS);
    expect(comp.sessions()).toHaveLength(2);
  });

  it('should expose activeSessionId input', () => {
    const comp = createComponent(SESSIONS, 's1');
    expect(comp.activeSessionId()).toBe('s1');
  });

  it('should emit selectSession on selection', () => {
    const comp = createComponent(SESSIONS);
    const spy = vi.fn();
    comp.selectSession.subscribe(spy);
    // Simulate selecting a session — calling the internal event
    comp.selectSession.emit('s2');
    expect(spy).toHaveBeenCalledWith('s2');
  });

  it('should emit deleteSession on delete', () => {
    const comp = createComponent(SESSIONS);
    const spy = vi.fn();
    comp.deleteSession.subscribe(spy);
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    comp['onDelete'](event, 's1');
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('s1');
  });

  it('should emit createSession', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.createSession.subscribe(spy);
    comp.createSession.emit();
    expect(spy).toHaveBeenCalled();
  });
});
