import { memo } from 'react';
import { VideoGridItem } from '@/components/video-list/VideoGridItem';
import { useVideoListStore } from '@/store/videoList';
import { Skeleton } from '@/components/ui/skeleton';
import { type VideoListProps } from '@/components/containers/VideoList';
import { isPropsEquals } from '@/lib/utils';
import { VirtuosoGrid } from 'react-virtuoso';

type VideoListBodyProps = {
  isLoading: boolean;
  columns?: number;
} & VideoListProps;

const GRID_CLASSES: Record<number, string> = {
  2: 'grid grid-cols-2 gap-3',
  3: 'grid grid-cols-2 sm:grid-cols-3 gap-3',
  4: 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3',
  5: 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3',
};

export const VideoListBody = ({ items, orders, isLoading, columns = 4 }: VideoListBodyProps) => {
  const { layoutMode } = useVideoListStore();
  switch (layoutMode) {
    case 'grid':
      return <VideoGridViewer items={items} orders={orders} isLoading={isLoading} columns={columns} />;
    default:
      return <div>Not Supported</div>;
  }
};

function VideoGridViewer({ items, orders, isLoading, columns = 4 }: VideoListBodyProps) {
  const gridClassName = GRID_CLASSES[columns] || GRID_CLASSES[4];
  return !isLoading && items && orders ? (
    <>
      {orders.length === 0 && (
        <div className='flex items-center justify-center w-full min-h-[40vh] py-10'>
          <span className='text-3xl text-muted-foreground opacity-50 select-none'>Empty</span>
        </div>
      )}
      <VirtuosoGrid
        useWindowScroll
        style={{ height: '100%', width: '100%' }}
        data={orders}
        listClassName={gridClassName}
        itemClassName=''
        itemContent={(index, uuid) => <VideoGridItemWithMemo key={uuid} video={items[uuid]} />}
      />
    </>
  ) : (
    <div className={gridClassName}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className='rounded-lg overflow-hidden bg-card-nested'>
          <Skeleton className='aspect-video w-full rounded-none' />
          <div className='p-2 space-y-1.5'>
            <Skeleton className='h-3.5 w-full' />
            <Skeleton className='h-3.5 w-3/4' />
            <Skeleton className='h-7 w-full mt-1' />
          </div>
        </div>
      ))}
    </div>
  );
}

const VideoGridItemWithMemo = memo(VideoGridItem, isPropsEquals);