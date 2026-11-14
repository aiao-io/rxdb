import { Component, ViewEncapsulation } from '@angular/core';
import { AppShell } from './app/components/app-shell';

@Component({
  selector: 'bom-domain-host',
  imports: [AppShell],
  template: '<div class="bom-domain"><bom-app-shell /></div>',
  styleUrl: './domain-host.scss',
  encapsulation: ViewEncapsulation.None
})
export class BomDomainHost {}
