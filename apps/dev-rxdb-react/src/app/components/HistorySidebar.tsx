import { HistoryItem, HistoryScopeType } from '@aiao/rxdb';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X } from 'lucide-react';
import { useRef } from 'react';

interface HistorySidebarProps {
  show: boolean;
  histories: HistoryItem[];
  scopeType: HistoryScopeType;
  borderSide?: 'left' | 'right';
  onClose: () => void;
}

export function HistorySidebar({ show, histories, scopeType, borderSide = 'left', onClose }: HistorySidebarProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: histories.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5
  });

  const hasHistories = histories.length > 0;

  const trackByFn = (index: number, item: HistoryItem) => item.fingerprint;

  const getScopeLabel = () => {
    switch (scopeType) {
      case 'database':
        return <span className='badge badge-xs badge-primary'>数据库</span>;
      case 'repository':
        return <span className='badge badge-xs badge-secondary'>仓库</span>;
      case 'entity':
        return <span className='badge badge-xs badge-accent'>实体</span>;
      default:
        return null;
    }
  };

  const getTypeColor = (type: HistoryItem['type']) => {
    switch (type) {
      case 'DELETE':
        return 'bg-error';
      case 'UPDATE':
        return 'bg-info';
      case 'TRANSACTION':
        return 'bg-primary';
      case 'INSERT':
        return 'bg-success';
      default:
        return 'bg-base-300';
    }
  };

  return (
    <aside
      className={`bg-base-100 border-base-300 flex h-full flex-col overflow-hidden shadow-lg transition-all duration-300 ${
        borderSide === 'left' ? 'border-l' : 'border-r'
      }`}
      style={{ width: show ? '192px' : '0' }}
    >
      <div className='flex h-full min-w-48 flex-col'>
        {/* Header */}
        <div className='border-base-300 border-b px-4 py-2'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <h2 className='text-sm font-semibold'>操作历史</h2>
              {getScopeLabel()}
            </div>
            <button className='btn btn-circle btn-ghost btn-xs' onClick={onClose} aria-label='关闭历史'>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 时间线 */}
        <div className='flex-1 overflow-auto' ref={parentRef}>
          <div className='p-3'>
            <ol
              className={`relative ${hasHistories ? 'border-base-300 border-l-2' : ''}`}
              style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
            >
              {histories.length === 0 ?
                <li className='text-base-content/40 flex min-h-40 items-center justify-center text-xs'>暂无操作历史</li>
              : virtualizer.getVirtualItems().map(virtualItem => {
                  const item = histories[virtualItem.index];
                  return (
                    <li
                      key={trackByFn(virtualItem.index, item)}
                      className='relative mb-4 pb-2 pl-4 last:mb-0'
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`
                      }}
                    >
                      {/* 时间线点 */}
                      <div
                        className={`ring-base-100 absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full ring-2 ${getTypeColor(item.type)} ${
                          item.reverted ? 'opacity-40' : ''
                        }`}
                      ></div>
                      {/* 内容 */}
                      <div className={item.reverted ? 'opacity-50' : ''}>
                        {/* 时间 */}
                        <time className='text-base-content/50 mb-1 block text-[10px]'>
                          {new Date(item.createdAt).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                          .{String(new Date(item.createdAt).getMilliseconds()).padStart(3, '0')}
                        </time>
                        {/* 简介 */}
                        <p className={`text-base-content mb-1.5 text-xs ${item.redoInvalidated ? 'line-through' : ''}`}>
                          <span>#{item.changeId}</span> {item.description}
                        </p>

                        {/* 徽章 */}
                        <div className='flex flex-wrap gap-1'>
                          {scopeType === 'database' && (
                            <>
                              <span className='badge badge-xs badge-soft badge-ghost'>{item.namespace}</span>
                              <span className='badge badge-xs badge-soft badge-primary'>{item.entity}</span>
                            </>
                          )}
                          {item.reverted && !item.redoInvalidated && (
                            <span className='badge badge-xs badge-soft badge-warning'>已撤销</span>
                          )}
                          {item.redoInvalidated && (
                            <span className='badge badge-xs badge-soft badge-error'>已失效</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })
              }
            </ol>
          </div>
        </div>
      </div>
    </aside>
  );
}
