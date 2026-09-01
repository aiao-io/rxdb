import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header.component';
import { ToastComponent } from './components/toast.component';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-base-100 flex h-screen flex-col">
      <app-header />
      <main class="flex-1 overflow-hidden">
        <router-outlet />
      </main>
      <app-toast />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
      }
    `
  ]
})
export class AppComponent implements OnInit {
  private readonly themeService = inject(ThemeService);

  ngOnInit(): void {
    // 初始化主题
    this.themeService.initTheme();
  }
}
