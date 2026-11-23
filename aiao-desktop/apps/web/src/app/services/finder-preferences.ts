import { Service, computed, inject } from '@angular/core';

import { Preferences } from '../data/preferences';

export const FINDER_DEFAULTS_DOMAIN = 'com.apple.finder';
export const SHOW_ALL_FILES_KEY = 'AppleShowAllFiles';

const KEY = `${FINDER_DEFAULTS_DOMAIN}.${SHOW_ALL_FILES_KEY}`;
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Finder 窗口、菜单和终端共用的本地偏好。 */
@Service({ autoProvided: false })
export class FinderPreferences {
  private readonly preferences = inject(Preferences);

  readonly showHiddenFiles = computed(() => this.preferences.get(KEY, isBoolean) ?? false);

  setShowHiddenFiles(shown: boolean): Promise<void> {
    return this.preferences.set(KEY, shown);
  }

  toggleShowHiddenFiles(): Promise<void> {
    return this.preferences.update(KEY, isBoolean, shown => !shown);
  }
}
