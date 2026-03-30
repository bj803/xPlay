import { DownloadContainer } from '@/components/containers/DownloadContainer';
import { VideoList } from '@/components/containers/VideoList';
import { UrlParameterWatcher } from '@/components/UrlParameterWatcher';

export default async function Home() {
  return (
    <main className='flex flex-col min-h-screen'>
      <UrlParameterWatcher />
      {/* Sticky top bar - URL input always visible */}
      <div className='sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border/50 shadow-sm'>
        <div className='max-w-8xl mx-auto px-3 py-2'>
          <DownloadContainer />
        </div>
      </div>
      {/* Video browsing area - fills rest of screen */}
      <div className='flex-1 max-w-8xl mx-auto w-full px-3 py-3'>
        <VideoList />
      </div>
    </main>
  );
}
