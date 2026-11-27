import type { Page } from '@playwright/test';

export function checkStorageLocale(page: Page): Promise<void>;
export function checkOpfsLocale(page: Page): Promise<void>;
export function checkHistoryLocale(page: Page): Promise<void>;
export function checkHistoryEntrypointsLocale(page: Page): Promise<void>;
