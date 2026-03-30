'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { LinkIcon } from 'lucide-react';
import { TiArrowLoop } from 'react-icons/ti';
import { TbPin, TbPinnedOff, TbViewportNarrow, TbViewportWide } from 'react-icons/tb';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import { AiOutlineFullscreen } from 'react-icons/ai';
import { CgClose } from 'react-icons/cg';
import { MdPlayArrow, MdPause, MdVolumeUp, MdVolumeOff, MdSkipNext, MdSkipPrevious } from 'react-icons/md';

import type { WithoutNullableKeys } from '@/types/types';
import type { VideoInfo } from '@/types/video';
import type { VideoPlayerStore } from '@/store/videoPlayer';
import { cn } from '@/lib/utils';
import { useVideoPlayerStore } from '@/store/videoPlayer';
import { Button } from '@/components/ui/button';

export type VideoPlayerVideoInfo = {
  uuid: string;
  title?: string | null;
  url: string;
  playlistVideoUuid?: string;
  size?: number;
  type: VideoInfo['type'];
};

export type VideoPlayerProps = {
  videoInfo: VideoPlayerVideoInfo;
} & Pick<VideoPlayerStore,
  | 'isLoopVideo'
  | 'isNotSupportedCodec'
  | 'isTopSticky'
  | 'isWideScreen'
  | 'volume'
>;

type NavPlaylist = {
  uuids: string[];
  items: Record<string, {
    title?: string | null;
    url: string;
    type: VideoInfo['type'];
    uuid: string;
  }>;
} | null;

let _navPlaylist: NavPlaylist = null;
export function setNavPlaylist(playlist: NavPlaylist) {
  _navPlaylist = playlist;
}

export function VideoPlayer({
  videoInfo,
  isLoopVideo,
  isNotSupportedCodec,
  isTopSticky,
  isWideScreen,
  volume,
}: WithoutNullableKeys<VideoPlayerProps>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const mouseStartX = useRef<number | null>(null);
  const lastTapRef = useRef<{ x: number; t: number } | null>(null);
  // Suppress the synthetic click that browsers fire ~300ms after touchend
  const suppressNextClickRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTimeState] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [seekFlash, setSeekFlash] = useState<'left' | 'right' | null>(null);

  const {
    close, setVolume, setCurrentTime, setNotSupportedCodec,
    setWideScreen, setTopSticky, setLoopVideo, open,
  } = useVideoPlayerStore.getState();

  const videoFileUrl = videoInfo.uuid.startsWith('/')
    ? `/api/local-stream?path=${encodeURIComponent(videoInfo.uuid)}`
    : videoInfo.type === 'playlist' && videoInfo.playlistVideoUuid
      ? `/api/playlist/file?uuid=${videoInfo.uuid}&itemUuid=${videoInfo.playlistVideoUuid}`
      : `/api/file?uuid=${videoInfo.uuid}`;

  // Show controls and reset auto-hide timer
  const showControlsTemp = useCallback((ms = 3000) => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), ms);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = typeof volume === 'number' ? volume : 0.75;
    const { currentTime: saved } = useVideoPlayerStore.getState();
    if (saved > 0) v.currentTime = saved;
    v.play().then(() => setPlaying(true)).catch(() => {});
    showControlsTemp(4000);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [videoInfo.uuid]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
    showControlsTemp();
  }, [showControlsTemp]);

  const seekBy = useCallback((seconds: number, side: 'left' | 'right') => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
    setSeekFlash(side);
    setTimeout(() => setSeekFlash(null), 500);
    showControlsTemp();
  }, [showControlsTemp]);

  const navigateTo = useCallback((dir: 'prev' | 'next') => {
    const pl = _navPlaylist;
    if (!pl) return;
    const idx = pl.uuids.indexOf(videoInfo.uuid);
    if (idx === -1) return;
    const ni = dir === 'next' ? idx + 1 : idx - 1;
    // At boundary: close player instead of ignoring
    if (ni < 0 || ni >= pl.uuids.length) { close(); return; }
    const next = pl.items[pl.uuids[ni]];
    if (!next) return;
    const v = videoRef.current;
    if (v) { v.pause(); setCurrentTime(0); }
    open({ uuid: next.uuid, title: next.title, url: next.url, type: next.type });
  }, [videoInfo.uuid, open, close, setCurrentTime]);

  // ── Touch handling ──────────────────────────────────────────
  // Rules:
  //   swipe:       absDy > 50 AND absDy > absDx * 1.5 AND dt < 400ms → prev/next
  //   double-tap:  2 taps < 300ms apart, < 80px apart → seek ±5s
  //   single-tap:  anything else → toggle play immediately
  //
  // e.preventDefault() in touchend stops the browser from generating
  // a synthetic click event ~300ms later, which would double-fire togglePlay.
  // suppressNextClickRef is a second guard for browsers that ignore preventDefault.

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.t;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    touchStartRef.current = null;

    // Prevent browser from firing a synthetic click after this touch
    e.preventDefault();
    suppressNextClickRef.current = true;
    // Clear the suppress flag after the click-delay window
    setTimeout(() => { suppressNextClickRef.current = false; }, 500);

    // 1a. Left/right swipe → close player
    if (absDx > 60 && absDx > absDy * 1.5 && dt < 400) {
      lastTapRef.current = null;
      close();
      return;
    }

    // 1b. Up/down swipe → prev/next (lowered threshold to 50px, ratio 1.5x)
    if (absDy > 50 && absDy > absDx * 1.5 && dt < 400) {
      lastTapRef.current = null;
      dy < 0 ? navigateTo('next') : navigateTo('prev');
      return;
    }

    // 2. Not a tap (too much movement)
    if (absDx > 12 || absDy > 12) return;

    // 3. Double tap → seek
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.t < 300 && Math.abs(touch.clientX - last.x) < 80) {
      lastTapRef.current = null;
      const w = (e.currentTarget as HTMLElement).clientWidth || window.innerWidth;
      seekBy(touch.clientX < w / 2 ? -5 : 5, touch.clientX < w / 2 ? 'left' : 'right');
      return;
    }

    // 4. Single tap → immediately toggle play/pause
    lastTapRef.current = { x: touch.clientX, t: now };
    togglePlay();
  };

  // Desktop click — skip if touch already handled this gesture
  const handleVideoAreaClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    if (suppressNextClickRef.current) return;
    togglePlay();
  };

  // Progress bar interaction (click or touch)
  const handleProgressInteraction = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !duration) return;
    let clientX: number;
    if ('changedTouches' in e) {
      clientX = e.changedTouches[0]?.clientX ?? 0;
    } else {
      clientX = e.clientX;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
    showControlsTemp();
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleClose = () => {
    const v = videoRef.current;
    if (v) { v.pause(); setCurrentTime(v.currentTime); }
    close();
  };

  const navIdx = _navPlaylist ? _navPlaylist.uuids.indexOf(videoInfo.uuid) : -1;
  const hasPrev = navIdx > 0;
  const hasNext = _navPlaylist ? navIdx < _navPlaylist.uuids.length - 1 : false;

  return (
    <div className='relative flex flex-col w-full h-full bg-black select-none overflow-hidden'>

      {/* ── Top bar ── */}
      <div
        data-controls
        className={cn(
          'absolute top-0 left-0 right-0 z-20',
          'flex items-center gap-x-1 px-2 pt-2 pb-5',
          'bg-gradient-to-b from-black/80 to-transparent',
          'transition-opacity duration-200',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <Button variant='ghost' size='icon'
          className='w-8 h-8 text-white rounded-full shrink-0'
          onClick={handleClose}>
          <HiOutlineArrowLeft />
        </Button>

        <p className='flex-1 min-w-0 text-white text-sm font-medium truncate px-1'>
          {videoInfo.title || ''}
        </p>

        <div className='flex items-center gap-0.5 shrink-0'>
          <Button variant='ghost' size='icon' className='w-8 h-8 text-white rounded-full' asChild>
            <a href={videoInfo.url || ''} rel='noopener noreferrer' target='_blank'>
              <LinkIcon size='1em' />
            </a>
          </Button>

          {videoInfo.type !== 'playlist' && (
            <>
              <Button variant='ghost' size='icon' className='w-8 h-8 text-white rounded-full'
                onClick={() => setTopSticky(!isTopSticky)}>
                {isTopSticky ? <TbPinnedOff /> : <TbPin />}
              </Button>
              <Button variant='ghost' size='icon' className='w-8 h-8 text-white rounded-full'
                onClick={() => setWideScreen(!isWideScreen)}>
                {isWideScreen ? <TbViewportNarrow /> : <TbViewportWide />}
              </Button>
            </>
          )}

          <Button variant='ghost' size='icon' className='w-8 h-8 text-white rounded-full'
            onClick={() => setLoopVideo(!isLoopVideo)}>
            <TiArrowLoop className={isLoopVideo ? 'text-primary' : ''} />
          </Button>

          <Button variant='ghost' size='icon' className='w-8 h-8 text-white rounded-full'
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              document.fullscreenElement
                ? document.exitFullscreen()
                : v.requestFullscreen?.();
            }}>
            <AiOutlineFullscreen />
          </Button>

          <Button variant='ghost' size='icon' className='w-8 h-8 text-white rounded-full'
            onClick={handleClose}>
            <CgClose />
          </Button>
        </div>
      </div>

      {/* ── Video + touch area ── */}
      <div
        className='relative flex-auto flex items-center justify-center overflow-hidden'
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => { mouseStartX.current = e.clientX; }}
        onMouseUp={(e) => {
          if (mouseStartX.current === null) return;
          const dx = e.clientX - mouseStartX.current;
          mouseStartX.current = null;
          if (Math.abs(dx) > 80) { close(); }
        }}
        onMouseLeave={() => { mouseStartX.current = null; }}
        onWheel={(e) => { if (Math.abs(e.deltaY) > 30) { e.preventDefault(); e.deltaY > 0 ? navigateTo('next') : navigateTo('prev'); } }}
        onClick={handleVideoAreaClick}
      >
        <video
          ref={videoRef}
          className={cn(
            'max-w-full max-h-full object-contain outline-none',
            isWideScreen && 'w-full',
          )}
          src={videoFileUrl}
          playsInline
          onVolumeChange={() => {
            const v = videoRef.current;
            if (v) { setVolume(v.volume); setMuted(v.muted); }
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (!v) return;
            setCurrentTimeState(v.currentTime);
            setProgress(v.duration > 0 ? v.currentTime / v.duration : 0);
            setCurrentTime(v.currentTime);
          }}
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (!v) return;
            setDuration(v.duration || 0);
            const { currentTime: saved } = useVideoPlayerStore.getState();
            if (saved > 0 && saved < v.duration) v.currentTime = saved;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            if (isLoopVideo) {
              videoRef.current?.play().catch(() => {});
              setPlaying(true);
            } else {
              navigateTo('next');
            }
          }}
          muted={muted}
        />

        {/* Not supported overlay */}
        {isNotSupportedCodec && (
          <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
            <div className='bg-black/70 text-white text-sm px-4 py-2 rounded'>
              文件不存在或无法播放
            </div>
          </div>
        )}

        {/* Seek flash */}
        {seekFlash && (
          <div className={cn(
            'absolute inset-y-0 w-1/2 flex items-center justify-center pointer-events-none bg-white/10',
            seekFlash === 'left' ? 'left-0' : 'right-0',
          )}>
            <span className='text-white text-2xl font-bold drop-shadow'>
              {seekFlash === 'left' ? '‹‹ 5s' : '5s ››'}
            </span>
          </div>
        )}

        {/* Paused indicator */}
        {!playing && !seekFlash && (
          <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
            <div className='bg-black/40 rounded-full w-16 h-16 flex items-center justify-center'>
              <MdPlayArrow className='text-white text-4xl ml-1' />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div
        data-controls
        className={cn(
          'absolute bottom-0 left-0 right-0 z-20 px-3 pt-8',
          'pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]',
          'bg-gradient-to-t from-black/90 to-transparent',
          'transition-opacity duration-200',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          className='w-full py-2.5 cursor-pointer'
          onClick={handleProgressInteraction}
          onTouchEnd={handleProgressInteraction as any}
        >
          <div className='w-full h-1 bg-white/30 rounded-full relative'>
            <div
              className='h-full bg-white rounded-full'
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className='absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md'
              style={{ left: `calc(${progress * 100}% - 7px)` }}
            />
          </div>
        </div>

        {/* Button row */}
        <div className='flex items-center gap-1'>
          <button
            className='text-white p-2 disabled:opacity-30 touch-manipulation'
            disabled={!hasPrev}
            onClick={() => navigateTo('prev')}
          >
            <MdSkipPrevious className='text-2xl' />
          </button>

          <button className='text-white p-2 touch-manipulation' onClick={togglePlay}>
            {playing ? <MdPause className='text-2xl' /> : <MdPlayArrow className='text-2xl' />}
          </button>

          <button
            className='text-white p-2 disabled:opacity-30 touch-manipulation'
            disabled={!hasNext}
            onClick={() => navigateTo('next')}
          >
            <MdSkipNext className='text-2xl' />
          </button>

          <span className='text-white text-xs tabular-nums ml-1'>
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div className='flex-1' />

          <button
            className='text-white p-2 touch-manipulation'
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
          >
            {muted ? <MdVolumeOff className='text-xl' /> : <MdVolumeUp className='text-xl' />}
          </button>
        </div>
      </div>
    </div>
  );
}
