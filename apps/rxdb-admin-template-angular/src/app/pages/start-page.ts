import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-start-page',
  imports: [RouterLink],
  template: ` <div class="page-host items-center justify-center gap-5 overflow-auto p-6">
    <h2 class="text-xl font-semibold">{{ t('start.title') }}</h2>
    <p class="max-w-md text-center text-sm">{{ t('start.description') }}</p>
    <div class="flex flex-wrap justify-center gap-3">
      <a class="btn btn-primary" routerLink="/entities">{{ t('start.open') }}</a>
      <a class="btn btn-outline" routerLink="/backup">{{ t('start.restore') }}</a>
    </div>
    <p class="max-w-md text-center text-sm opacity-70">{{ t('start.warning') }}</p>
  </div>`
})
export default class StartPage {
  readonly t = useI18n().t;
}
