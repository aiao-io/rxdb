import { Component, computed, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';
import { CALC_RESET, CalcKey, formatCalc, pressCalc } from './calculator-engine';

interface CalcButton {
  readonly label: string;
  readonly cls: '' | 'fn' | 'op';
  readonly key: CalcKey;
  readonly wide?: boolean;
}

const BUTTONS: readonly CalcButton[] = [
  { label: 'AC', cls: 'fn', key: 'ac' },
  { label: '+/−', cls: 'fn', key: 'neg' },
  { label: '%', cls: 'fn', key: 'pct' },
  { label: '÷', cls: 'op', key: 'div' },
  { label: '7', cls: '', key: 'n7' },
  { label: '8', cls: '', key: 'n8' },
  { label: '9', cls: '', key: 'n9' },
  { label: '×', cls: 'op', key: 'mul' },
  { label: '4', cls: '', key: 'n4' },
  { label: '5', cls: '', key: 'n5' },
  { label: '6', cls: '', key: 'n6' },
  { label: '−', cls: 'op', key: 'sub' },
  { label: '1', cls: '', key: 'n1' },
  { label: '2', cls: '', key: 'n2' },
  { label: '3', cls: '', key: 'n3' },
  { label: '+', cls: 'op', key: 'add' },
  { label: '0', cls: '', key: 'n0', wide: true },
  { label: '.', cls: '', key: 'dot' },
  { label: '=', cls: 'op', key: 'eq' }
];

const KEYBOARD: Readonly<Record<string, CalcKey>> = {
  '/': 'div',
  '*': 'mul',
  x: 'mul',
  '-': 'sub',
  '+': 'add',
  '=': 'eq',
  Enter: 'eq',
  '.': 'dot',
  ',': 'dot',
  '%': 'pct',
  Escape: 'ac',
  Backspace: 'del',
  Delete: 'ac'
};

/** 计算器：基础模式，支持键盘输入（仅前台窗口响应）。 */
@Component({
  selector: 'app-calculator',
  imports: [TrafficLights],
  host: {
    style: 'display: contents',
    '(document:keydown)': 'keyboard($event)',
    '(window:pointerup)': 'pressed.set(null)'
  },
  template: `
    <div class="tb dark" data-drag>
      <div class="title">Calculator</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz"></div>
    </div>
    <div class="calc">
      <div class="calc-out" data-out>{{ display() }}</div>
      <div class="calc-keys">
        @for (button of buttons; track button.key) {
          <button
            class="ck"
            [attr.data-k]="button.key"
            [class.down]="pressed() === button.key"
            [class.fn]="button.cls === 'fn'"
            [class.on]="armed() === button.key"
            [class.op]="button.cls === 'op'"
            [class.w2]="button.wide"
            (click)="press(button.key)"
            (pointerdown)="pressed.set(button.key)"
          >
            {{ button.key === 'ac' ? clearLabel() : button.label }}
          </button>
        }
      </div>
    </div>
  `
})
export class CalculatorApp {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);

  private readonly state = signal(CALC_RESET);
  protected readonly buttons = BUTTONS;
  protected readonly pressed = signal<CalcKey | null>(null);

  protected readonly display = computed(() => formatCalc(this.state().cur));
  /** 刚按下的运算符保持高亮，直到输入下一个数。 */
  protected readonly armed = computed(() => {
    const { op, fresh } = this.state();
    return op && fresh ? op : null;
  });
  protected readonly clearLabel = computed(() => (this.state().cur !== '0' || this.state().op ? 'C' : 'AC'));

  constructor() {
    const menus = inject(DesktopMenus);
    const toast = inject(Toast);
    this.win.setMenus(
      computed(() =>
        menus.standard('calculator', {
          View: [
            { id: 'b', label: 'Basic', key: '⌘1', checked: true },
            {
              id: 's',
              label: 'Scientific',
              key: '⌘2',
              checked: false,
              run: () => toast.show('Scientific mode is not in this build')
            }
          ]
        })
      )
    );
  }

  protected press(key: CalcKey): void {
    this.state.update(state => pressCalc(state, key));
  }

  protected keyboard(event: KeyboardEvent): void {
    if (this.wm.front() !== this.win) return;
    const key: CalcKey | undefined = /^[0-9]$/.test(event.key) ? (`n${event.key}` as CalcKey) : KEYBOARD[event.key];
    if (!key) return;
    event.preventDefault();
    this.pressed.set(key);
    setTimeout(() => this.pressed.update(current => (current === key ? null : current)), 95);
    this.press(key);
  }
}
