import { isPlatformServer } from '@angular/common';
import { ApplicationRef, inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, filter, first, interval, Observable, Subject, Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SwUpdatesService implements OnDestroy {
  #appRef = inject(ApplicationRef);
  #updateActivatedSub = new Subject<VersionReadyEvent>();
  #swUpdate = inject(SwUpdate, { optional: true });
  #isServer = isPlatformServer(inject(PLATFORM_ID));
  #enabled = false;
  #subscriptions = new Subscription();

  private checkInterval = 1000 * 60 * 60 * 1; // 1 hours

  // 网站更新通知事件
  updateActivated$: Observable<VersionReadyEvent> = this.#updateActivatedSub.asObservable();

  disable() {
    this.#subscriptions.unsubscribe();
    this.#subscriptions = new Subscription();
    this.#enabled = false;
  }

  enable() {
    if (this.#isServer) return;
    if (!this.#swUpdate?.isEnabled || this.#enabled) return;
    this.#enabled = true;

    const appIsStable$ = this.#appRef.isStable.pipe(first(isStable => isStable === true));
    const everySixHours$ = interval(this.checkInterval);
    const everySixHoursOnceAppIsStable$ = concat(appIsStable$, everySixHours$);

    this.#subscriptions.add(
      this.#swUpdate.unrecoverable.subscribe(event => {
        console.log('An error occurred that we cannot recover from:\n' + event.reason + '\n\nPlease reload the page.');
      })
    );

    this.#subscriptions.add(
      everySixHoursOnceAppIsStable$.subscribe(async () => {
        try {
          const updateFound = await this.#swUpdate!.checkForUpdate();
          console.log(updateFound ? 'A new version is available.' : 'Already on the latest version.');
        } catch (err) {
          console.error('Failed to check for updates:', err);
        }
      })
    );

    this.#subscriptions.add(
      this.#swUpdate.versionUpdates.subscribe(evt => {
        switch (evt.type) {
          case 'VERSION_DETECTED':
            console.log(`Downloading new app version: ${evt.version.hash}`);
            break;
          case 'VERSION_READY':
            console.log(`Current app version: ${evt.currentVersion.hash}`);
            console.log(`New app version ready for use: ${evt.latestVersion.hash}`);
            break;
          case 'VERSION_INSTALLATION_FAILED':
            console.log(`Failed to install app version '${evt.version.hash}': ${evt.error}`);
            break;
        }
      })
    );

    this.#subscriptions.add(
      this.#swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(evt => this.#updateActivatedSub.next(evt))
    );
  }

  ngOnDestroy() {
    this.disable();
    this.#updateActivatedSub.complete();
  }
}
