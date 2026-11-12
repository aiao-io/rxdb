import { Directive, model } from '@angular/core';

/**
 * 设置面板里的开关（`.sw`）。绑系统状态时用 `[(appSwitch)]="signal"`；
 * 只改外观的开关只给初始值，状态留在这个元素上，面板重建后回到初始值。
 */
@Directive({
  selector: '[appSwitch]',
  host: {
    class: 'sw',
    tabindex: '-1',
    '[class.on]': 'appSwitch()',
    '(click)': 'appSwitch.set(!appSwitch())',
    '(keydown.enter)': 'appSwitch.set(!appSwitch())'
  }
})
export class ToggleSwitch {
  readonly appSwitch = model(false);
}
