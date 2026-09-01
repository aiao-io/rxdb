import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsPage } from '../pages/events.page';
import { DevToolsStateService } from '../services/devtools-state.service';
import type { Branch, SerializedEvent } from '../types/devtools.types';
import { BranchSelectorComponent } from './branch-selector.component';
import { EventDetailComponent } from './event-detail.component';
import { EventListComponent } from './event-list.component';

class StateStub {
  readonly connected = signal(true);
  readonly events = signal<SerializedEvent[]>([]);
  readonly selectedEvent = signal<SerializedEvent | null>(null);
  readonly branches = signal<Branch[]>([]);
  readonly switching = signal(false);
  readonly activeBranch = signal<Branch | null>(null);
  readonly switchBranch = vi.fn();
  readonly createBranch = vi.fn();
  readonly selectEvent = vi.fn((event: SerializedEvent | null) => this.selectedEvent.set(event));
  readonly clearEvents = vi.fn(() => {
    this.events.set([]);
    this.selectedEvent.set(null);
  });
}

const event: SerializedEvent = {
  id: '1',
  eventType: 'INSERT',
  timestamp: 1,
  sequence: 1,
  data: { collection: 'todos' }
};

describe('BranchSelectorComponent', () => {
  let state: StateStub;
  let component: BranchSelectorComponent;

  beforeEach(() => {
    state = new StateStub();
    TestBed.configureTestingModule({
      providers: [BranchSelectorComponent, { provide: DevToolsStateService, useValue: state }]
    });
    component = TestBed.inject(BranchSelectorComponent);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('switches only to a different non-empty branch', () => {
    state.activeBranch.set({ id: 'main', activated: true });
    component.onBranchChange({ currentTarget: document.body } as unknown as Event);
    const select = document.createElement('select');
    for (const value of ['main', 'feature']) {
      const option = document.createElement('option');
      option.value = value;
      select.add(option);
    }
    select.value = 'main';
    component.onBranchChange({ currentTarget: select } as unknown as Event);
    select.value = 'feature';
    component.onBranchChange({ currentTarget: select } as unknown as Event);

    expect(component.currentBranchId()).toBe('main');
    expect(state.switchBranch).toHaveBeenCalledOnce();
    expect(state.switchBranch).toHaveBeenCalledWith('feature');
  });

  it('toggles the popover and creates trimmed branch names', () => {
    component.toggleBranchPopover();
    expect(component.showBranchPopover()).toBe(true);
    component.newBranchName.set('   ');
    component.createBranch();
    expect(state.createBranch).not.toHaveBeenCalled();

    component.newBranchName.set(' feature ');
    component.createBranch();
    expect(state.createBranch).toHaveBeenCalledWith('feature');
    expect(component.newBranchName()).toBe('');
    expect(component.showBranchPopover()).toBe(false);
  });

  it('keeps the popover open for inside clicks and closes it otherwise', () => {
    const popover = document.createElement('div');
    popover.setAttribute('data-branch-popover', '');
    const child = document.createElement('button');
    popover.appendChild(child);
    document.body.appendChild(popover);
    component.showBranchPopover.set(true);

    component.onDocumentClick({ target: child } as unknown as MouseEvent);
    expect(component.showBranchPopover()).toBe(true);
    component.onDocumentClick({ target: document } as unknown as MouseEvent);
    expect(component.showBranchPopover()).toBe(false);
    popover.remove();
  });
});

describe('event components', () => {
  let state: StateStub;

  beforeEach(() => {
    state = new StateStub();
    TestBed.configureTestingModule({
      providers: [
        EventListComponent,
        EventDetailComponent,
        EventsPage,
        { provide: DevToolsStateService, useValue: state }
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('selects events and derives badge and summary values', () => {
    const component = TestBed.inject(EventListComponent);
    component.selectEvent(event);
    expect(state.selectEvent).toHaveBeenCalledWith(event);
    expect(component.getEventTypeBadgeClass('INSERT')).toBe('badge-primary');
    expect(component.getEventTypeBadgeClass('UNKNOWN')).toBe('badge-ghost');
    expect(component.getEventSummary(event)).toBe('todos');
    expect(component.getEventSummary({ ...event, data: { entity: 'users' } })).toBe('users');
    expect(component.getEventSummary({ ...event, eventType: 'PING', data: {} })).toBe('PING');
  });

  it('closes details and clears the page event list', () => {
    state.events.set([event]);
    state.selectedEvent.set(event);
    TestBed.inject(EventDetailComponent).closeDetail();
    TestBed.inject(EventsPage).clearEvents();

    expect(state.selectEvent).toHaveBeenCalledWith(null);
    expect(state.clearEvents).toHaveBeenCalledOnce();
    expect(state.events()).toEqual([]);
  });
});
