/** 附近的 Wi‑Fi 网络：`s` 为信号格数。菜单栏面板与系统设置共用。 */
export interface WifiNetwork {
  readonly n: string;
  readonly s: number;
  readonly lock: boolean;
}

export const NETWORKS: readonly WifiNetwork[] = [
  { n: 'Prasen 5G', s: 3, lock: true },
  { n: 'Prasen 2.4G', s: 3, lock: true },
  { n: 'JioFiber-4821', s: 2, lock: true },
  { n: 'Airtel_Xstream', s: 2, lock: true },
  { n: 'TP-Link_9C40', s: 1, lock: true },
  { n: 'CoffeeHouse Guest', s: 1, lock: false }
];
