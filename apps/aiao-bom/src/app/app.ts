import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppShell } from '@modules/bom-workspace';

@Component({
  selector: 'bom-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppShell],
  template: `<bom-app-shell />`
})
export class App {}
