import { Link } from 'react-router-dom';

/** 首次操作前提供录入与恢复入口，避免空工作台提前初始化。 */
export default function StartPage() {
  return (
    <div className='page-host items-center justify-center gap-5 overflow-auto p-6'>
      <h2 className='text-xl font-semibold'>开始使用工作台</h2>
      <p className='max-w-md text-center text-sm'>打开当前浏览器的工作台，或在全新环境中从备份恢复数据。</p>
      <div className='flex flex-wrap justify-center gap-3'>
        <Link className='btn btn-primary' to='/entities'>
          打开工作台
        </Link>
        <Link className='btn btn-outline' to='/backup'>
          从备份恢复
        </Link>
      </div>
      <p className='max-w-md text-center text-sm opacity-70'>
        如需恢复，请先选择「从备份恢复」。恢复只接受尚未使用的工作台，已有数据不会被覆盖。
      </p>
    </div>
  );
}
