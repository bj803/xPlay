/* eslint-disable react/no-unescaped-entities */
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { mutate } from 'swr';
import numeral from 'numeral';
import { toast } from 'react-toastify';
import { useVideoPlayerStore } from '@/store/videoPlayer';
import { CircleLoader } from '@/components/modules/CircleLoader';
import { PingSvg } from '@/components/modules/PingSvg';
import { isMobile } from '@/client/utils';
import { FcRemoveImage } from 'react-icons/fc';
import { AiOutlineCloudDownload, AiOutlineInfoCircle } from 'react-icons/ai';
import { VscRefresh, VscWarning } from 'react-icons/vsc';
import { MdOutlineVideocamOff, MdStop, MdBookmark } from 'react-icons/md';
import { CgPlayListSearch } from 'react-icons/cg';
import type { VideoInfo } from '@/types/video';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LinkIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { BsCheckCircleFill } from 'react-icons/bs';
import { useVideoListStore } from '@/store/videoList';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { shallow } from 'zustand/shallow';
import { FolderSelectDialog } from '@/components/modules/FolderSelectDialog';
import { PlaylistViewer } from './PlaylistViewer';
import { DownloadOptionsInfoDialog } from './DownloadOptionsInfoDialog';

export type VideoGridItemProps = {
  video: VideoInfo;
};

export const VideoGridItem = ({ video }: VideoGridItemProps) => {
  const [isValidating, setValidating] = useState(false);
  const [isMouseEntered, setMouseEntered] = useState(false);
  const [isThumbnailImageError, setThumbnailImageError] = useState(false);
  const [proxyThumbnailUrl, setProxyThumbnailUrl] = useState('');
  const [isProxyThumbnailImageError, setProxyThumbnailImageError] = useState(false);
  const [isNotSupportedCodec, setNotSupportedCodec] = useState(false);
  const [recommendedDownloadRetry, setRecommendedDownloadRetry] = useState(false);
  const [openPlaylistView, setOpenPlaylistView] = useState(false);
  const { isSelectMode, addUuid, deleteUuid } = useVideoListStore(
    ({ isSelectMode, addUuid, deleteUuid }) => ({ isSelectMode, addUuid, deleteUuid }),
    shallow
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevVideoRef = useRef(video);
  const isCompleted = video.status === 'completed';
  const isDownloading = video.status === 'downloading';
  const isStandby = video.status === 'standby';
  const isFailed = video.status === 'failed';
  const isRecording = video.status === 'recording';
  const isAlready = video.status === 'already';
  const [isSelected, setSelected] = useState(false);
  const [openDeleteFile, setOpenDeleteFile] = useState(false);
  const [openMoveDialog, setOpenMoveDialog] = useState(false);
  const [isMoveToFav, setIsMoveToFav] = useState(false);

  const handleCloseDeleteFile = () => setOpenDeleteFile(false);

  const handleClickDelete = (video: VideoInfo) => async () => {
    if (!isCompleted) {
      toast.warn(video?.isLive ? '请停止录制后再删除' : '下载中无法删除文件');
      return;
    }
    const deleteApiPath = video.type === 'playlist' ? '/api/playlist/file' : '/api/file';
    const result = await axios
      .delete(deleteApiPath, { params: { uuid: video.uuid, deleteFile: true } })
      .then((res) => res.data)
      .catch((res) => res.response.data);
    if (result.success) {
      toast.success('已删除文件和列表记录。');
      handleCloseDeleteFile();
    } else {
      toast.error(result.error || '删除失败。');
    }
    mutate('/api/list');
  };

  const handleMoveToFavorites = async (targetSubdir: string) => {
    if (!isCompleted || isMoveToFav) return;
    setIsMoveToFav(true);
    try {
      const res = await fetch('/api/move-to-favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: video.uuid, targetSubdir: targetSubdir || undefined }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(targetSubdir ? `已移动到收藏 / ${targetSubdir} ★` : '已移动到收藏目录 ★');
        setOpenMoveDialog(false);
        mutate('/api/list');
      } else {
        toast.error(result.error || '移动失败');
      }
    } catch {
      toast.error('移动失败');
    } finally {
      setIsMoveToFav(false);
    }
  };

  const handleMouseLeave = () => {
    if (!isCompleted) return;
    if (!document.fullscreenElement) {
      setMouseEntered(false);
      videoRef.current?.pause?.();
    }
  };

  const handleMouseEnter = async () => {
    if (!isCompleted || video?.type === 'playlist' || !video?.file?.duration) return;
    const videoEl = videoRef.current;
    if (videoEl) {
      try {
        if (!isMobile()) await videoEl.play?.();
        setMouseEntered(true);
      } catch {}
    }
  };

  const handleClickRestartDownload = async () => {
    if (isValidating || !video.uuid) return;
    setValidating(true);
    setRecommendedDownloadRetry(false);
    const result = await axios
      .get('/api/r', { params: { uuid: video.uuid } })
      .then((res) => res.data)
      .catch((res) => res.response.data);
    setValidating(false);
    if (!result?.success || result?.error) toast.error(result?.error || '重试失败');
    else if (result?.status === 'already') toast.info('该视频已下载过');
    else if (result?.status === 'downloading') { toast.success('已重新开始下载'); mutate('/api/list'); }
  };

  const handleClickStopRecording = async () => {
    if (isValidating || !video.uuid) return;
    setValidating(true);
    const result = await axios.patch('/api/recording', { uuid: video.uuid })
      .then((res) => res.data).catch((res) => res.response.data);
    if (result?.error) toast.error('停止录制失败');
    else if (result?.success) toast.success('已停止录制');
    setValidating(false);
  };

  const handleImageError = () => {
    setThumbnailImageError(true);
    if (typeof video.thumbnail === 'string' && video.thumbnail.startsWith('http')) {
      setProxyThumbnailUrl(`/api/image?url=${encodeURIComponent(video.thumbnail)}`);
    }
  };

  const handleClickVideo = async () => {
    if (!isCompleted) return;
    if (video?.type === 'playlist') { setOpenPlaylistView(true); return; }
    const NOT_SUPPORTED = 'not supported';
    const videoEl = videoRef.current;
    if (videoEl) {
      try {
        if (!isMobile() && video?.file?.duration) {
          try { await videoEl.play?.(); setNotSupportedCodec(false); } catch { throw NOT_SUPPORTED; }
          if (!videoEl.played) videoEl.pause();
        }
        const openVideo = useVideoPlayerStore.getState().open;
        setMouseEntered(false);
        openVideo({ title: video.title, type: video.type, url: video.url, uuid: video.uuid, size: video?.file?.size });
      } catch (e) { if (e === NOT_SUPPORTED) setNotSupportedCodec(true); }
    }
  };

  const [openDownloadOptionsInfo, setOpenDownloadOptionsInfo] = useState(false);

  useEffect(() => {
    if (video?.uuid) setSelected(useVideoListStore.getState().selectedUuids.has(video.uuid));
    const unsub = useVideoListStore.subscribe((state) => {
      if (video?.uuid) setSelected(state.selectedUuids.has(video.uuid));
    });
    return () => unsub();
  }, [video]);

  useEffect(() => {
    if (video.status === 'completed' || video.download.progress === '1' || video.updatedAt !== prevVideoRef.current.updatedAt) {
      setRecommendedDownloadRetry(false);
      return () => { prevVideoRef.current = video; };
    }
    const init = { at: prevVideoRef.current.updatedAt, prog: prevVideoRef.current.download?.progress };
    const t = setTimeout(() => {
      if (prevVideoRef.current.download?.progress === init.prog && prevVideoRef.current.updatedAt === init.at)
        setRecommendedDownloadRetry(true);
    }, 10000);
    return () => { prevVideoRef.current = video; clearTimeout(t); };
  }, [video]);

  return (
    <div className={cn('flex flex-col h-full group', isSelectMode && 'select-none')}>
      {/*
        Deep card background matching LocalVideoGrid, rounded-xl, no border.
        Using bg-card-nested (same as LocalVideoGrid cards) for visual consistency.
      */}
      <div className='flex flex-col h-full rounded-lg overflow-hidden bg-card-nested'>

        {/* ── Thumbnail (fills top, no extra radius needed — parent clips) ── */}
        <div
          className={cn(
            'relative flex items-center shrink-0 grow-0 w-full overflow-hidden aspect-video',
            isCompleted && 'cursor-pointer'
          )}
          onClick={handleClickVideo}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={handleMouseEnter}
        >
          {/* Playing state */}
          <div className={cn('w-full h-full place-items-center bg-black', isMouseEntered ? 'flex' : 'hidden')}>
            {isCompleted && (
              <video key={video.status} ref={videoRef} className='w-full h-full outline-none'
                src={`/api/file?uuid=${video.uuid}`} muted playsInline loop preload='none' />
            )}
          </div>

          {/* Static thumbnail */}
          <div className={cn('w-full h-full', isMouseEntered ? 'hidden' : 'block')} onClick={handleMouseEnter}>
            <figure className='relative w-full h-full bg-black'>
              {isCompleted && video.file?.path && !isThumbnailImageError ? (
                <img className='w-full h-full object-contain'
                  src={`/api/local-thumb?path=${encodeURIComponent(video.file.path)}`}
                  alt='thumbnail'
                  onError={handleImageError}
                  loading='lazy' />
              ) : isThumbnailImageError && proxyThumbnailUrl && !isProxyThumbnailImageError ? (
                <img className='w-full h-full object-contain' src={proxyThumbnailUrl} alt='thumbnail'
                  onError={() => setProxyThumbnailImageError(true)} loading='lazy' />
              ) : (
                <div className='w-full h-full min-h-[80px] flex items-center justify-center text-4xl bg-neutral-800 select-none'>
                  <FcRemoveImage />
                </div>
              )}
              {isNotSupportedCodec && (
                <div className='absolute flex top-0 left-0 items-center text-center w-full h-full overflow-hidden cursor-auto'
                  onClick={(e) => e.stopPropagation()}>
                  <div className='w-full bg-black/70 text-white text-sm py-2'>文件不存在或无法播放</div>
                </div>
              )}
            </figure>

            {/* Downloading overlay */}
            {!isCompleted && (
              <div className='absolute top-0 left-0 w-full h-full flex flex-col p-3 gap-y-2 items-center justify-center bg-black/80 text-2xl text-white break-words'>
                {isStandby || isFailed || isAlready ? (
                  <span className={cn('font-bold capitalize', isFailed && 'text-error-foreground', isAlready && 'text-warning-foreground')}>
                    {video.status}
                  </span>
                ) : recommendedDownloadRetry ? (
                  <VscWarning className='text-3xl text-yellow-500' />
                ) : (
                  <CircleLoader className='text-xl' />
                )}
                {video.createdAt !== video.updatedAt && (
                  <div className='text-xs text-center'>运行时间 ≈ {numeral((video.updatedAt - video.createdAt) / 1000).format('00:00:00')}</div>
                )}
                {video.download.playlist && (
                  <div className='text-xs text-center'>{video.download.playlist?.current}/{video.download.playlist?.count}</div>
                )}
                <div className={cn('text-sm text-center animate-pulse', isFailed && 'overflow-y-auto')}>
                  {isAlready ? '文件名已存在，请修改输出文件名后重试'
                    : isFailed && video.error ? video.error
                    : recommendedDownloadRetry ? '下载似乎卡住了，请点击刷新重试'
                    : `${video.status}...`}
                </div>
              </div>
            )}
          </div>

          {/* Badges */}
          {isCompleted && video?.type === 'playlist' && (
            <div className='absolute top-1.5 left-1.5 text-xs text-white bg-black/80 py-0.5 px-1.5 rounded-md'>
              播放列表 {video.download.playlist?.count && `(${video.download.playlist?.count})`}
            </div>
          )}
          {video?.type === 'video' && (
            <div className='absolute top-1 right-1'>
              <Button variant='ghost' size='icon'
                className='w-[1.75em] h-[1.75em] bg-black/20 text-white text-sm rounded-full'
                onClick={(e) => { e.stopPropagation(); setOpenDownloadOptionsInfo(true); }}>
                <AiOutlineInfoCircle />
              </Button>
            </div>
          )}
          {!isMouseEntered && typeof video.file.height === 'number' && video.file.height > 0 && (
            <div className='absolute left-1.5 top-1.5 text-xs text-white bg-black/80 py-0.5 px-1.5 rounded-md'>
              {video.file.height}p
              {typeof video.file.rFrameRate === 'number' && video.file.rFrameRate > 0 ? Math.round(video.file.rFrameRate) : ''}
              {video.file.codecName ? ' ' + video.file.codecName : ''}
              {video.file.colorPrimaries === 'bt2020' ? ' HDR' : ''}
            </div>
          )}
          {!isMouseEntered && typeof video.file.size === 'number' && (
            <div className='absolute left-1.5 bottom-1.5 text-xs text-white bg-black/80 py-0.5 px-1.5 rounded-md'>
              {numeral(video.file.size).format('0.0b')}
            </div>
          )}
          {!isMouseEntered && video.file.duration && (
            <div className='absolute right-1.5 bottom-1.5 text-xs text-white bg-black/80 py-0.5 px-1.5 rounded-md'>
              {numeral(video.file.duration).format('00:00:00')}
            </div>
          )}
        </div>

        {/* ── Progress bar (downloading) ── */}
        {isDownloading ? (
          <Progress className='w-full h-1 rounded-none'
            value={Number(numeral(video.download.progress).format('0.00') || 0) * 100} />
        ) : isRecording ? (
          <div className='h-1 gradient-background' />
        ) : isStandby ? (
          <div className='h-1 bg-zinc-500/50' />
        ) : (
          <div className='h-0' />
        )}

        {/* ── Info + buttons ── */}
        <div className='flex flex-col flex-1 p-2 gap-1.5'>
          {/* Title — flex-1 pushes buttons to bottom */}
          <p className='line-clamp-2 text-sm font-semibold break-all flex-1 cursor-pointer'
            title={video.title || undefined}
            onClick={handleClickVideo}>
            {video.isLive && isRecording && (
              <span className='inline-flex items-center align-text-top text-xl text-error-foreground'><PingSvg /></span>
            )}
            <span className={(isStandby || isFailed) && !video.title ? 'text-xs font-normal' : ''}>
              {video.title || video.url}
            </span>
          </p>

          {/* ── Button row: 删除 | 链接 | 移动 | 下载(最宽) ── */}
          <div className='flex items-center gap-1'>
            {/* 删除 */}
            {!(isStandby || isFailed || !isCompleted) ? (
              <DropdownMenu open={openDeleteFile} onOpenChange={setOpenDeleteFile}>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='icon'
                    className='h-7 w-7 shrink-0 text-base text-error-foreground hover:text-error-foreground/90 border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40'
                    title='删除文件'>
                    <MdOutlineVideocamOff />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' className='max-w-xs'>
                  <DropdownMenuLabel className='text-sm'>确认删除文件和列表记录？</DropdownMenuLabel>
                  <DropdownMenuLabel className='flex items-center justify-end gap-x-2'>
                    <Button variant='outline' size='sm' className='grow' onClick={handleCloseDeleteFile}>取消</Button>
                    <Button size='sm' className='grow bg-error hover:bg-error/90 text-foreground' onClick={handleClickDelete(video)}>确认删除</Button>
                  </DropdownMenuLabel>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className='h-7 w-7 shrink-0' />
            )}

            {/* 链接 */}
            <Button size='icon' variant='outline'
              className='h-7 w-7 shrink-0 text-base border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40'
              title='打开原始链接' asChild>
              <a href={video.url || ''} rel='noopener noreferrer' target='_blank'>
                <LinkIcon size='1em' />
              </a>
            </Button>

            {/* 移动到收藏 */}
            <Button variant='outline' size='icon'
              className='h-7 w-7 shrink-0 text-base text-primary hover:text-primary/80 border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40'
              title='移动到收藏目录'
              disabled={!isCompleted || isMoveToFav}
              onClick={() => setOpenMoveDialog(true)}>
              <MdBookmark />
            </Button>

            {/* 下载（最宽，flex-1） */}
            {isCompleted ? (
              video.type === 'playlist' ? (
                <Button size='sm' variant='outline'
                  className='flex-1 h-7 text-base border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40'
                  disabled={isValidating} onClick={() => setOpenPlaylistView(true)} title='播放列表'>
                  <CgPlayListSearch />
                </Button>
              ) : (
                <Button size='sm' variant='outline'
                  className='flex-1 h-7 text-base p-0 border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40' title='下载到本地' asChild>
                  <a href={`/api/file?uuid=${video.uuid}&download=true`} rel='noopener noreferrer' target='_blank'
                    download={video.file.name || false}>
                    <AiOutlineCloudDownload />
                  </a>
                </Button>
              )
            ) : (
              <div className={cn('flex-1', recommendedDownloadRetry && 'animate-pulse')}>
                <Button size='sm' variant='outline'
                  className='w-full h-7 text-base border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40'
                  disabled={isValidating || video?.isLive}
                  onClick={handleClickRestartDownload} title={video?.isLive ? '' : '重试下载'}>
                  {video?.isLive
                    ? <AiOutlineCloudDownload />
                    : <VscRefresh className={cn(isValidating && 'animate-spin')} />
                  }
                </Button>
              </div>
            )}

            {/* 停止录制 */}
            {video.isLive && isRecording && (
              <Button variant='outline' size='icon'
                className='h-7 w-7 shrink-0 rounded-full text-error-foreground text-base border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40'
                onClick={handleClickStopRecording} title='停止录制'>
                <MdStop />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Select overlay */}
      {isSelectMode && (
        <div className={cn(
          'absolute top-0 left-0 w-full h-full flex items-center justify-center rounded-xl overflow-hidden border-4 isolate will-change-transform cursor-pointer',
          isSelected && 'border-primary'
        )}
          onClick={() => { if (video?.uuid) (isSelected ? deleteUuid : addUuid)(video.uuid); }}>
          <BsCheckCircleFill className={cn('absolute top-2 right-2 text-2xl', isSelected ? 'text-primary' : 'opacity-30')} />
        </div>
      )}

      <FolderSelectDialog
        open={openMoveDialog}
        onClose={() => setOpenMoveDialog(false)}
        onConfirm={handleMoveToFavorites}
        title='移动到收藏目录'
        description={video.title || video.url}
        loading={isMoveToFav}
      />
      {openPlaylistView && video.type === 'playlist' && video.playlist?.length && (
        <PlaylistViewer open={openPlaylistView} video={video} onClose={() => setOpenPlaylistView(false)} />
      )}
      {openDownloadOptionsInfo && video.type === 'video' && (
        <DownloadOptionsInfoDialog open={openDownloadOptionsInfo} video={video} onClose={() => setOpenDownloadOptionsInfo(false)} />
      )}
    </div>
  );
};

VideoGridItem.displayName = 'VideoGridItem';
