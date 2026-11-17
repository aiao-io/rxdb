import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WeatherCity } from '../apps/weather/weather.entities';
import { DesktopData } from '../data/desktop-data';
import { configureServices } from '../testing/angular';
import { FakeDesktopData, restoreEntityStubs, stubFindAll } from '../testing/fake-desktop-data';
import { WeatherStore, weatherCode } from './weather-store';

interface CityRow {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  position: number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** 2026-07-27（周一）16:00 的预报：72°F、多云，24 个小时和三天。 */
const PAYLOAD = {
  current: { time: '2026-07-27T16:00', temperature_2m: 71.6, weather_code: 2, is_day: 1 },
  hourly: {
    time: Array.from({ length: 24 }, (_, hour) => `2026-07-27T${pad(hour)}:00`),
    temperature_2m: Array.from({ length: 24 }, (_, hour) => 50 + hour + 0.4),
    weather_code: Array.from({ length: 24 }, () => 0)
  },
  daily: {
    time: ['2026-07-27', '2026-07-28', '2026-07-29'],
    weather_code: [0, 3, 61],
    temperature_2m_max: [80.4, 75.5, 70],
    temperature_2m_min: [55.2, 54.5, 50]
  }
};

const CUPERTINO: CityRow = { name: 'Cupertino', latitude: 37.323, longitude: -122.0322, position: 0 };

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

async function setup(cities: CityRow[] = [CUPERTINO]) {
  const data = new FakeDesktopData();
  const rows = data.table<CityRow>(WeatherCity);
  rows.seed(cities);
  stubFindAll(WeatherCity, rows.rows$ as Observable<CityRow[]>);
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD }));
  vi.stubGlobal('fetch', fetchMock);
  configureServices([WeatherStore, { provide: DesktopData, useValue: data }]);
  const store = TestBed.inject(WeatherStore);
  await tick();
  return { store, fetchMock, rows, data };
}

afterEach(() => {
  restoreEntityStubs();
  vi.useRealTimers();
});

describe('weatherCode', () => {
  it('WMO 天气代码转成文字和图标，夜里把太阳换成月亮', () => {
    expect(weatherCode(0)).toEqual(['Clear', 'g-sun']);
    expect(weatherCode(0, false)).toEqual(['Clear', 'g-moon']);
    expect(weatherCode(0, 0)).toEqual(['Clear', 'g-moon']);
    expect(weatherCode(2, false)).toEqual(['Partly Cloudy', 'g-mooncloud']);
    expect(weatherCode(61)).toEqual(['Light Rain', 'g-rain']);
  });

  it('没有夜间图标的代码夜里照用白天的图标；不认识的代码显示破折号', () => {
    expect(weatherCode(3, false)).toEqual(['Cloudy', 'g-cloud']);
    expect(weatherCode(1234)).toEqual(['—', 'g-cloud']);
  });
});

describe('WeatherStore 离线读数', () => {
  it('读城市列表之前先保证天气的数据域已经种过初始数据（首次读取才种）', async () => {
    const { data } = await setup();
    expect(data.ensureSeeded).toHaveBeenCalledWith(WeatherCity);
  });

  it('place 是主城市的名字，城市列表还没读到时为空串', async () => {
    const { store } = await setup([{ name: 'Tokyo', latitude: 35.68, longitude: 139.69, position: 1 }, CUPERTINO]);
    expect(store.place()).toBe('Tokyo');

    const empty = await setup([]);
    expect(empty.store.place()).toBe('');
  });

  it('没有请求到实况前不生成温度、小时或七日预报', async () => {
    const { store } = await setup();
    expect(store.now()).toBeNull();
    expect(store.hours()).toEqual([]);
    expect(store.days()).toEqual([]);
  });
});

describe('WeatherStore 实况', () => {
  it('load 取主城市的坐标请求 Open-Meteo，之后读数来自实况', async () => {
    const { store, fetchMock } = await setup();
    const payload = await store.load();
    expect(payload).toEqual(PAYLOAD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls as unknown[][])[0][0]);
    expect(url).toContain('https://api.open-meteo.com/v1/forecast?latitude=37.323&longitude=-122.0322');
    expect(url).toContain('temperature_unit=fahrenheit');

    expect(store.now()).toEqual({ t: 72, code: 2, day: 1, hi: 80, lo: 55, live: true });
  });

  it('hours 从当前小时起往后数，第一项是 Now，夜里换成月亮图标', async () => {
    const { store } = await setup();
    await store.load();
    expect(store.hours(6)).toEqual([
      ['Now', 66, 'g-sun'],
      ['5PM', 67, 'g-sun'],
      ['6PM', 68, 'g-sun'],
      ['7PM', 69, 'g-sun'],
      ['8PM', 70, 'g-moon'],
      ['9PM', 71, 'g-moon']
    ]);
  });

  it('hours 不为超出预报的时刻复制最后一条读数', async () => {
    const { store } = await setup();
    await store.load();
    expect(store.hours(12)).toHaveLength(8);
    expect(store.hours(12).at(-1)).toEqual(['11PM', 73, 'g-moon']);
  });

  it('days 第一天是 Today，其余是星期缩写，温度取整', async () => {
    const { store } = await setup();
    await store.load();
    expect(store.days()).toEqual([
      ['Today', 55, 80, 'g-sun'],
      ['Tue', 55, 76, 'g-cloud'],
      ['Wed', 50, 70, 'g-rain']
    ]);
  });

  it('每个会话只请求一次：并发调用共享同一个请求，成功后直接返回缓存', async () => {
    const { store, fetchMock } = await setup();
    const [first, second] = await Promise.all([store.load(), store.load()]);
    expect(first).toBe(second);
    expect(await store.load()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('网络不通时得到 null 和错误，下一次调用会重试', async () => {
    const { store, fetchMock } = await setup();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await store.load()).toBeNull();
    expect(store.now()).toBeNull();
    expect(store.error()).not.toBeNull();

    expect(await store.load()).toEqual(PAYLOAD);
    expect(store.now()?.live).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('返回的内容不像预报（没有 current）时当作失败', async () => {
    const { store, fetchMock } = await setup();
    fetchMock.mockResolvedValueOnce({ json: async () => ({ error: true }) } as never);
    expect(await store.load()).toBeNull();
    expect(store.now()).toBeNull();
    expect(store.error()).not.toBeNull();
  });

  it('本地数据起不来时报告设置不可用，不读库也不发请求', async () => {
    const data = new FakeDesktopData();
    data.ready = Promise.reject(new Error('库不可用'));
    stubFindAll(WeatherCity, data.table<CityRow>(WeatherCity).rows$ as Observable<CityRow[]>);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    configureServices([WeatherStore, { provide: DesktopData, useValue: data }]);
    const store = TestBed.inject(WeatherStore);
    await tick();

    expect(await store.load()).toBeNull();
    expect(store.now()).toBeNull();
    expect(store.error()).not.toBeNull();
    expect(data.repository).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('没有城市就没有实况可取，也不发请求', async () => {
    const { store, fetchMock } = await setup([]);
    expect(await store.load()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WeatherStore 失败、刷新与城市切换', () => {
  it('HTTP 错误不能因为正文有天气字段而成功', async () => {
    const { store, fetchMock } = await setup();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => PAYLOAD });
    expect(await store.load()).toBeNull();
    expect(store.now()).toBeNull();
    expect(store.error()).toMatch(/unavailable/i);
  });

  it.each([
    { ...PAYLOAD, current: { ...PAYLOAD.current, temperature_2m: NaN } },
    { ...PAYLOAD, current: { ...PAYLOAD.current, is_day: 3 } },
    { ...PAYLOAD, hourly: { ...PAYLOAD.hourly, time: [] } },
    { ...PAYLOAD, hourly: { ...PAYLOAD.hourly, weather_code: [0] } },
    { ...PAYLOAD, daily: { ...PAYLOAD.daily, temperature_2m_min: [Infinity, 54, 50] } },
    { ...PAYLOAD, daily: { ...PAYLOAD.daily, time: ['not-a-date', '2026-07-28', '2026-07-29'] } },
    { current: PAYLOAD.current }
  ])('非法或长度不一致的预报不进入状态：%j', async payload => {
    const { store, fetchMock } = await setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload } as never);
    expect(await store.load()).toBeNull();
    expect(store.now()).toBeNull();
    expect(store.error()).not.toBeNull();
  });

  it('记录来源与取得时间，刷新失败只保留真实旧读数，重试后清除陈旧状态', async () => {
    const { store, fetchMock } = await setup();
    await store.load();
    const received = store.receivedAt();
    expect(store.sourceTime()).toBe(PAYLOAD.current.time);
    expect(Number.isFinite(Date.parse(received!))).toBe(true);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await store.refresh()).toBeNull();
    expect(store.now()).toMatchObject({ t: 72, live: false });
    expect(store.stale()).toBe(true);
    expect(store.receivedAt()).toBe(received);
    expect(store.hours()).toHaveLength(6);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...PAYLOAD, current: { ...PAYLOAD.current, temperature_2m: 64 } })
    });
    await store.refresh();
    expect(store.now()).toMatchObject({ t: 64, live: true });
    expect(store.stale()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('等待中重复刷新共享请求，完成后退出等待状态', async () => {
    const { store, fetchMock } = await setup();
    let done!: (value: { ok: boolean; json: () => Promise<typeof PAYLOAD> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          done = resolve;
        })
    );
    const first = store.refresh();
    const second = store.refresh();
    await tick();
    expect(store.loading()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    done({ ok: true, json: async () => PAYLOAD });
    expect(await first).toBe(await second);
    expect(store.loading()).toBe(false);
  });

  it('城市切换后取消旧请求，迟到的响应不会出现在新城市', async () => {
    const { store, fetchMock, rows } = await setup();
    let done!: (value: { ok: boolean; json: () => Promise<typeof PAYLOAD> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          done = resolve;
        })
    );
    const first = store.load();
    await tick();
    const options = (fetchMock.mock.calls as unknown[][])[0][1] as RequestInit;
    await rows.update(rows.rows[0], { name: 'Tokyo', latitude: 35.68, longitude: 139.69 });
    TestBed.tick();
    await tick();
    const current = await store.load();
    expect(options.signal?.aborted).toBe(true);
    expect(store.place()).toBe('Tokyo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    done({ ok: true, json: async () => ({ ...PAYLOAD, current: { ...PAYLOAD.current, temperature_2m: 100 } }) });
    await first;
    expect(current).toEqual(PAYLOAD);
    expect(store.now()?.t).toBe(72);
  });

  it('超过十秒中止请求并提供可重试的超时反馈', async () => {
    const { store, fetchMock } = await setup();
    fetchMock.mockImplementationOnce(
      (...args: unknown[]) =>
        new Promise((_resolve, reject) => {
          const options = args[1] as RequestInit;
          options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );
    vi.useFakeTimers();
    const pending = store.load();
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toBeNull();
    expect(store.loading()).toBe(false);
    expect(store.error()).toMatch(/timed out/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('服务销毁会取消请求并清理计时器', async () => {
    const { store, fetchMock } = await setup();
    fetchMock.mockImplementationOnce(
      (...args: unknown[]) =>
        new Promise((_resolve, reject) => {
          const options = args[1] as RequestInit;
          options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );
    const pending = store.load();
    await tick();
    const options = (fetchMock.mock.calls as unknown[][])[0][1] as RequestInit;
    TestBed.resetTestingModule();
    expect(options.signal?.aborted).toBe(true);
    expect(await pending).toBeNull();
  });
});
