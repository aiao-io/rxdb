import { clamp } from '../../shared/format';

/** 进程表的一行；内存 MB、磁盘 MB/s、网络 KB/s。 */
export interface Process {
  readonly name: string;
  readonly pid: number;
  readonly cpu: number;
  readonly threads: number;
  readonly mem: number;
  readonly user: string;
  readonly energy: number;
  readonly disk: number;
  readonly net: number;
}

type Metric = 'cpu' | 'mem' | 'energy' | 'disk' | 'net';

export type ActivityTab = 'CPU' | 'Memory' | 'Energy' | 'Disk' | 'Network';

export const ACTIVITY_TABS: readonly ActivityTab[] = ['CPU', 'Memory', 'Energy', 'Disk', 'Network'];

/** 每个标签页：列头、排序键、色调，以及单元格、热点、圆环与图例的算法。 */
export interface TabSpec {
  readonly cols: readonly string[];
  readonly key: Metric;
  readonly hue: string;
  /** 名称列之后的各列文字。 */
  cells(process: Process): readonly string[];
  /** 第二列（核心指标）是否标红。 */
  hot(process: Process): boolean;
  /** 圆环读数，0..100。 */
  ring(rows: readonly Process[]): number;
  legend(rows: readonly Process[], battery: number): readonly (readonly [string, string])[];
}

const p = (
  name: string,
  pid: number,
  cpu: number,
  threads: number,
  mem: number,
  user: string,
  energy: number,
  disk: number,
  net: number
): Process => ({ name, pid, cpu, threads, mem, user, energy, disk, net });

export const PROCESSES: readonly Process[] = [
  p('WindowServer', 214, 9.4, 24, 412.6, 'root', 8.2, 0.4, 12),
  p('kernel_task', 0, 6.1, 512, 1864, 'root', 3.1, 2.8, 6),
  p('Safari', 1841, 4.2, 31, 996.4, 'prasenjit', 21.4, 1.2, 486),
  p('Cursor Helper (Renderer)', 2290, 3.8, 42, 1240, 'prasenjit', 16.8, 0.9, 74),
  p('Terminal', 2461, 1.2, 8, 84.2, 'prasenjit', 1.1, 0.1, 0),
  p('Music', 1902, 0.9, 26, 288.1, 'prasenjit', 4.6, 0.6, 128),
  p('Finder', 620, 0.4, 12, 142.8, 'prasenjit', 0.8, 0.2, 2),
  p('Dock', 618, 0.3, 9, 96.4, 'prasenjit', 0.6, 0, 0),
  p('mds_stores', 340, 0.2, 7, 58.9, 'root', 0.4, 3.4, 0),
  p('bluetoothd', 188, 0.1, 5, 18.2, 'root', 0.2, 0, 1),
  p('loginwindow', 174, 0, 4, 22.6, 'prasenjit', 0.1, 0, 0),
  p('cfprefsd', 121, 0, 3, 9.4, 'root', 0.1, 0.1, 0)
];

const mb = (value: number): string => (value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${value.toFixed(1)} MB`);

const total = (rows: readonly Process[], metric: Metric): number => rows.reduce((sum, row) => sum + row[metric], 0);

/** 每个标签页都是一套不同的排序、列和圆环，像真机那样重新排表，而不只是换个标题。 */
export const TABS: Readonly<Record<ActivityTab, TabSpec>> = {
  CPU: {
    cols: ['Process Name', 'PID', '% CPU', 'Threads', 'Memory', 'User'],
    key: 'cpu',
    hue: '#0a84ff',
    cells: row => [String(row.pid), row.cpu.toFixed(1), String(row.threads), mb(row.mem), row.user],
    hot: row => row.cpu > 5,
    ring: rows => clamp(total(rows, 'cpu'), 0, 100),
    legend: rows => {
      const sum = total(rows, 'cpu');
      return [
        ['System', `${(sum * 0.38).toFixed(2)}%`],
        ['User', `${(sum * 0.62).toFixed(2)}%`],
        ['Idle', `${(100 - sum).toFixed(2)}%`]
      ];
    }
  },
  Memory: {
    cols: ['Process Name', 'PID', 'Memory', 'Threads', 'Compressed', 'User'],
    key: 'mem',
    hue: '#30d158',
    cells: row => [String(row.pid), mb(row.mem), String(row.threads), mb(row.mem * 0.18), row.user],
    hot: row => row.mem > 900,
    ring: rows => clamp(total(rows, 'mem') / 1310, 0, 100),
    legend: rows => {
      const used = total(rows, 'mem') / 1024;
      return [
        ['Physical', '128.00 GB'],
        ['Used', `${used.toFixed(2)} GB`],
        ['Cached', `${(used * 0.42).toFixed(2)} GB`]
      ];
    }
  },
  Energy: {
    cols: ['Process Name', 'PID', 'Energy Impact', '12 hr Power', 'App Nap', 'User'],
    key: 'energy',
    hue: '#ff9f0a',
    cells: row => [
      String(row.pid),
      row.energy.toFixed(1),
      (row.energy * 0.42).toFixed(2),
      row.energy < 1 ? 'Yes' : 'No',
      row.user
    ],
    hot: row => row.energy > 15,
    ring: rows => clamp(total(rows, 'energy'), 0, 100),
    legend: (rows, battery) => [
      ['Energy Impact', total(rows, 'energy').toFixed(1)],
      ['Battery', `${battery}%`],
      ['Remaining', '6:24']
    ]
  },
  Disk: {
    cols: ['Process Name', 'PID', 'Bytes Read/s', 'Bytes Written/s', 'Reads In', 'User'],
    key: 'disk',
    hue: '#af52de',
    cells: row => [
      String(row.pid),
      `${row.disk.toFixed(2)} MB`,
      `${(row.disk * 0.38).toFixed(2)} MB`,
      String(Math.round(row.disk * 214)),
      row.user
    ],
    hot: row => row.disk > 2,
    ring: rows => clamp(total(rows, 'disk') * 9, 0, 100),
    legend: rows => [
      ['Reads/s', `${total(rows, 'disk').toFixed(2)} MB`],
      ['Writes/s', `${(total(rows, 'disk') * 0.38).toFixed(2)} MB`],
      ['Total read', '284.6 GB']
    ]
  },
  Network: {
    cols: ['Process Name', 'PID', 'Rcvd Bytes/s', 'Sent Bytes/s', 'Packets In', 'User'],
    key: 'net',
    hue: '#5e5ce6',
    cells: row => [
      String(row.pid),
      `${row.net.toFixed(0)} KB`,
      `${(row.net * 0.31).toFixed(0)} KB`,
      String(Math.round(row.net * 3.4)),
      row.user
    ],
    hot: row => row.net > 200,
    ring: rows => clamp(total(rows, 'net') / 12, 0, 100),
    legend: rows => [
      ['Data received/s', `${total(rows, 'net').toFixed(0)} KB`],
      ['Data sent/s', `${(total(rows, 'net') * 0.31).toFixed(0)} KB`],
      ['Packets in', '1,284,602']
    ]
  }
};
