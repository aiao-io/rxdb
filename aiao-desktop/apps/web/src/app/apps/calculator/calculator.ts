import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';
import { CALC_RESET, CalcKey, calcKeysOfText, formatCalc, pressCalc } from './calculator-engine';

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

/** 计算器：基础模式，支持键盘输入（仅前台窗口响应）、复制结果与粘贴数字。 */
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
      <div class="title">{{ i18n.t('apps.calculator.name') }}</div>
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
  private readonly toast = inject(Toast);
  private readonly state = signal(CALC_RESET);

  protected readonly i18n = useI18n();
  protected readonly buttons = BUTTONS;
  protected readonly pressed = signal<CalcKey | null>(null);

  /** 屏幕显示：除零等错误由引擎记成「Error」状态字，这里换成当前语言的显示。 */
  protected readonly display = computed(() => {
    const text = formatCalc(this.state().cur);
    return text === 'Error' ? this.i18n.t('apps.calculator.error') : text;
  });
  /** 刚按下的运算符保持高亮，直到输入下一个数。 */
  protected readonly armed = computed(() => {
    const { op, fresh } = this.state();
    return op && fresh ? op : null;
  });
  protected readonly clearLabel = computed(() => (this.state().cur !== '0' || this.state().op ? 'C' : 'AC'));

  constructor() {
    const menus = inject(DesktopMenus);
    /* 菜单名就是 standard() 的合并键：覆盖要用翻译后的分区名。 */
    const edit = this.i18n.t('shell.menu.sectionEdit');
    const view = this.i18n.t('shell.menu.sectionView');
    this.win.setMenus(
      computed(() =>
        menus.standard('calculator', {
          [edit]: [
            { id: 'c', label: this.i18n.t('apps.calculator.copyResult'), key: '⌘C', run: () => void this.copyResult() },
            { id: 'v', label: this.i18n.t('shell.menu.paste'), key: '⌘V', run: () => void this.pasteValue() }
          ],
          [view]: [
            { id: 'b', label: this.i18n.t('apps.calculator.basic'), key: '⌘1', checked: true },
            {
              id: 's',
              label: this.i18n.t('apps.calculator.scientific'),
              key: '⌘2',
              checked: false,
              run: () => this.toast.show(this.i18n.t('apps.calculator.noScientific'))
            }
          ]
        })
      )
    );
  }

  protected press(key: CalcKey): void {
    this.state.update(state => pressCalc(state, key));
  }

  /** 修饰键组合不落进键盘输入：⌘1 这类菜单快捷键不能顺便按出数字。 */
  protected keyboard(event: KeyboardEvent): void {
    if (this.wm.front() !== this.win) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key: CalcKey | undefined = /^[0-9]$/.test(event.key) ? (`n${event.key}` as CalcKey) : KEYBOARD[event.key];
    if (!key) return;
    event.preventDefault();
    this.pressed.set(key);
    setTimeout(() => this.pressed.update(current => (current === key ? null : current)), 95);
    this.press(key);
  }

  /** ⌘C：把当前显示的数字写进系统剪贴板（不带千分位，与 macOS 一致）。 */
  private async copyResult(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new DOMException('Clipboard unavailable', 'NotAllowedError');
      await navigator.clipboard.writeText(this.state().cur);
      this.toast.show(this.i18n.t('shell.toast.copied'));
    } catch {
      this.toast.show(this.i18n.t('apps.calculator.clipboardUnavailable'));
    }
  }

  /** ⌘V：读剪贴板，把里面的数字按按键序列回放进当前输入。 */
  private async pasteValue(): Promise<void> {
    try {
      const text = navigator.clipboard ? await navigator.clipboard.readText() : '';
      const keys = calcKeysOfText(text);
      if (!keys.length) {
        this.toast.show(this.i18n.t('apps.calculator.clipboardNoNumber'));
        return;
      }
      this.state.update(state => keys.reduce((current, key) => pressCalc(current, key), state));
    } catch {
      this.toast.show(this.i18n.t('apps.calculator.clipboardUnavailable'));
    }
  }
}
