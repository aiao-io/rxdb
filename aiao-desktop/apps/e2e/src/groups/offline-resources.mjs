import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const payload = temperature => ({
  current: { time: '2026-11-17T08:00', temperature_2m: temperature, weather_code: 2, is_day: 1 },
  hourly: {
    time: Array.from({ length: 24 }, (_, hour) => `2026-11-17T${String(hour).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 24 }, () => temperature),
    weather_code: Array.from({ length: 24 }, () => 2)
  },
  daily: {
    time: Array.from({ length: 7 }, (_, day) => `2026-11-${17 + day}`),
    temperature_2m_max: Array.from({ length: 7 }, () => temperature + 5),
    temperature_2m_min: Array.from({ length: 7 }, () => temperature - 5),
    weather_code: Array.from({ length: 7 }, () => 2)
  }
});
const PLACE = {
  lat: '35.68',
  lon: '139.69',
  name: 'Tokyo',
  display_name: 'Tokyo, Japan',
  boundingbox: ['35', '36', '139', '140']
};
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64'
);
const cors = { 'access-control-allow-origin': '*' };

const buttonContrast = button => {
  const style = getComputedStyle(button);
  const luminance = color => {
    const channels = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
    const linear = channels.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const ink = luminance(style.color);
  const surface = luminance(style.backgroundColor);
  return (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
};

export async function checkResourceAccessibility(session) {
  const { page, helpers } = session;
  await helpers.closeAll();
  await helpers.launch('Weather');
  const weather = helpers.win('weather');
  await expect(weather.locator('app-weather-status button')).toBeEnabled();
  const weatherStop = await pressUntil(
    page,
    focus => focus.app === 'weather' && /^(Retry|Refresh) weather$/.test(focus.name)
  );
  expect(weatherStop.found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(weather.locator('app-weather-status button')).toBeEnabled();
  const weatherAxe = await new AxeBuilder({ page }).include('.win[data-app="weather"]').analyze();
  await helpers.launch('Maps');
  const maps = helpers.win('maps');
  await expect(maps.getByRole('button', { name: 'Retry map' })).toBeVisible();
  const mapStop = await pressUntil(page, focus => focus.app === 'maps' && focus.name === 'Retry map');
  expect(mapStop.found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(maps.getByRole('button', { name: 'Retry map' })).toBeVisible();
  const mapsAxe = await new AxeBuilder({ page }).include('.win[data-app="maps"]').analyze();
  await helpers.closeAll();
  return { keyboardControls: true, noViolations: [...weatherAxe.violations, ...mapsAxe.violations] };
}

export const offlineResources = {
  name: 'offline-resources',
  description: '天气无数据、响应校验、共享请求、陈旧状态与恢复；地图资源失败与重试、键盘和 axe',
  keys: [
    'offlineResources.noInventedWeather',
    'offlineResources.requestStateAndTimes',
    'offlineResources.staleReadingsPreserved',
    'offlineResources.weatherRecovers',
    'offlineResources.mapRetry',
    'offlineResources.searchRetryAndEmpty',
    'offlineResources.keyboardControls',
    'offlineResources.noViolations'
  ],
  async run(session) {
    const { page, context, helpers } = session;
    const result = traced('offline-resources');
    let weatherMode = 'failed';
    let weatherRequests = 0;
    let releaseWeather;
    let mapMode = 'failed';
    let searchMode = 'invalid';
    await context.route('https://api.open-meteo.com/**', async route => {
      weatherRequests++;
      if (weatherMode === 'failed')
        return route.fulfill({ status: 503, headers: cors, json: { error: 'Unavailable' } });
      if (weatherMode === 'hold')
        await new Promise(resolve => {
          releaseWeather = resolve;
        });
      if (weatherMode === 'invalid') return route.fulfill({ headers: cors, json: { current: payload(100).current } });
      await route.fulfill({ headers: cors, json: payload(weatherMode === 'cool' ? 64 : 72) });
    });
    await context.route('https://*.basemaps.cartocdn.com/**', route =>
      mapMode === 'failed' ?
        route.abort()
      : route.fulfill({
          contentType: 'image/png',
          body: TILE,
          headers: { 'cross-origin-resource-policy': 'cross-origin' }
        })
    );
    await context.route('https://nominatim.openstreetmap.org/**', route =>
      route.fulfill({
        headers: cors,
        json:
          searchMode === 'invalid' ? { error: 'Unavailable' }
          : searchMode === 'empty' ? []
          : [PLACE]
      })
    );
    await session.openDesktop();
    Object.assign(result, await checkResourceAccessibility(session));
    await helpers.closeAll();
    await helpers.launch('Weather');
    const weather = helpers.win('weather');
    const widget = page.locator('[data-wxw]');
    for (const view of [weather, widget]) {
      await expect(view).toContainText('No weather data');
      await expect(view.getByRole('alert')).toContainText('Weather is unavailable');
      expect(await view.innerText()).not.toMatch(/\d+°/);
    }
    result.noInventedWeather = true;

    weatherMode = 'hold';
    const requestsBefore = weatherRequests;
    await weather.getByRole('button', { name: 'Retry weather' }).click();
    await expect(weather.getByRole('status')).toHaveText('Updating weather…');
    /* 桌面小组件也有刷新按钮（键盘可达）；请求进行中它同样禁用，不额外发请求。 */
    await expect(widget.locator('button')).toHaveCount(1);
    await expect(widget.getByRole('button', { name: /^(Retry|Refresh) weather$/ })).toBeDisabled();
    await expect.poll(() => typeof releaseWeather).toBe('function');
    expect(weatherRequests).toBe(requestsBefore + 1);
    weatherMode = 'warm';
    releaseWeather();
    await expect(weather).toContainText('72°');
    await expect(widget).toContainText('72°');
    await expect(weather).toContainText('2026-11-17 08:00 (city time)');
    await expect(weather).toContainText('Retrieved');
    result.requestStateAndTimes = true;

    weatherMode = 'invalid';
    await weather.getByRole('button', { name: 'Refresh weather' }).click();
    for (const view of [weather, widget]) {
      await expect(view).toContainText('Showing an earlier forecast');
      await expect(view).toContainText('72°');
      expect(await view.innerText()).not.toContain('100°');
    }
    await expect(weather.getByRole('button', { name: 'Retry weather' })).toBeEnabled();
    const contrast = await weather.locator('app-weather-status button').evaluate(buttonContrast);
    expect(contrast, 'Enabled weather retry text must be readable').toBeGreaterThanOrEqual(4.5);
    await expect(widget.locator('app-weather-status button')).toHaveCount(1);
    const staleAxe = await new AxeBuilder({ page }).include('.win[data-app="weather"]').analyze();
    expect(staleAxe.violations).toEqual([]);
    await page.screenshot({ path: '/tmp/aiao-offline-weather-stale.png' });
    result.staleReadingsPreserved = true;
    weatherMode = 'cool';
    await weather.getByRole('button', { name: 'Retry weather' }).click();
    for (const view of [weather, widget]) {
      await expect(view).toContainText('64°');
      await expect(view.getByRole('alert')).toHaveCount(0);
      await expect(view).not.toContainText('Showing an earlier forecast');
    }
    result.weatherRecovers = true;

    await helpers.launch('Maps');
    const maps = helpers.win('maps');
    await expect(maps.getByRole('alert')).toContainText('Some map tiles could not be loaded');
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    mapMode = 'ready';
    await maps.getByRole('button', { name: 'Retry map' }).click();
    await expect(maps.locator('.pane img.in').first()).toBeVisible();
    await expect(maps.getByRole('alert')).toHaveCount(0);
    result.mapRetry = true;

    const search = maps.getByRole('textbox', { name: 'Search Maps' });
    await search.fill('Tokyo');
    await search.press('Enter');
    await expect(maps.getByRole('alert')).toHaveText('Search is unavailable. Try again.');
    searchMode = 'ready';
    await maps.getByRole('button', { name: 'Retry search' }).click();
    await maps.locator('[data-hit="0"]').click();
    await expect(maps.locator('[data-card]')).toContainText('Tokyo');
    searchMode = 'empty';
    await search.fill('Nowhere');
    await search.press('Enter');
    await expect(maps).toContainText('No results for “Nowhere”');
    result.searchRetryAndEmpty = true;

    return { offlineResources: result };
  }
};
