'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

export type MediaItem = { src: string; name: string; isImage: boolean };

// ─────────────────────────────────────────────
// MediaViewer — swipeable full-screen player
// Up/down: switch prev/next (exit at boundary)
// Left/right: close; Image: tap to close
// ─────────────────────────────────────────────
export function MediaViewer({
  playlist, startIndex, onClose,
}: {
  playlist: { src: string; name: string; isImage: boolean }[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx]         = useState(startIndex);
  const [animDir, setAnimDir] = useState<'up'|'down'|null>(null);
  const [dragX, setDragX]     = useState(0);
  const [dismissing, setDismissing] = useState<'left'|'right'|null>(null);
  const [loop, setLoop]       = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY  = useRef(0);
  const touchStartX  = useRef(0);
  const dragging     = useRef(false);
  const axis         = useRef<'h'|'v'|null>(null);

  const [showBar, setShowBar] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    setShowBar(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowBar(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [idx, resetHideTimer]);

  const goTo = (next: number, dir: 'up'|'down') => {
    setAnimDir(dir);
    setTimeout(() => { setIdx(next); setAnimDir(null); }, 200);
  };
  const dismiss = (dir: 'left'|'right') => {
    setDragX(0); setDismissing(dir);
    setTimeout(() => onClose(), 220);
  };

  // Declare these early so onTouchEnd and keyboard handler can reference them
  const item    = playlist[idx];
  const hasPrev = idx > 0;
  const hasNext = idx < playlist.length - 1;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    dragging.current = true; axis.current = null; setDragX(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (!axis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8))
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (axis.current === 'h') { e.preventDefault(); setDragX(dx); }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (axis.current === 'h') {
      setDragX(0);
      if (Math.abs(dx) > 80) dismiss(dx > 0 ? 'right' : 'left');
      return;
    }
    if (Math.abs(dy) < 40) return;
    if (dy > 0) { if (hasNext) goTo(idx + 1, 'up'); else dismiss('left'); }
    if (dy < 0) { if (hasPrev) goTo(idx - 1, 'down'); else dismiss('right'); }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onClose();
      if (e.key === 'ArrowDown' && hasNext) goTo(idx + 1, 'up');
      if (e.key === 'ArrowUp'   && hasPrev) goTo(idx - 1, 'down');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [idx, hasPrev, hasNext]);

  // Mouse wheel: scroll down = next, scroll up = prev (or exit at boundary)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        if (hasNext) goTo(idx + 1, 'up'); else dismiss('left');
      } else if (e.deltaY < 0) {
        if (hasPrev) goTo(idx - 1, 'down'); else dismiss('right');
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [idx, hasPrev, hasNext]);

  const slideClass   = animDir === 'up' ? 'translate-y-[-6%] opacity-0'
                     : animDir === 'down' ? 'translate-y-[6%] opacity-0' : 'translate-y-0 opacity-100';
  const dismissClass = dismissing === 'left' ? 'translate-x-[-110%] opacity-0'
                     : dismissing === 'right' ? 'translate-x-[110%] opacity-0' : '';
  const dragStyle    = dragX !== 0
    ? { transform: `translateX(${dragX}px)`, opacity: Math.max(0.3, 1 - Math.abs(dragX) / 400) } : {};
  const bgOpacity    = dragX !== 0 ? Math.max(0.3, 1 - Math.abs(dragX) / 350) : 1;

  return (
    <div ref={containerRef}
      className='fixed inset-0 z-[200] select-none'
      style={{ backgroundColor: `rgba(0,0,0,${bgOpacity})` }}
      onTouchStart={e => { onTouchStart(e); resetHideTimer(); }}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseMove={resetHideTimer}
      onClick={() => { resetHideTimer(); if (item.isImage && dragX === 0 && !dismissing) onClose(); }}>

      {/* Media — fills entire screen, maintains aspect ratio */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black
                       transition-all duration-200 ${slideClass} ${dismissClass}`}
        style={dragX !== 0 ? dragStyle : {}}>
        {item.isImage
          ? <img src={item.src} alt={item.name}
              className='max-w-full max-h-full object-contain pointer-events-none' draggable={false} />
          : <video ref={videoRef} key={item.src} src={item.src}
              controls autoPlay playsInline loop={loop}
              className='max-w-full max-h-full'
              onClick={e => e.stopPropagation()} />
        }
      </div>

      {/* Top bar — absolute overlay, auto-hides, never takes space */}
      <div className={`absolute top-0 left-0 right-0 flex items-center gap-1 px-2 py-2
                       bg-gradient-to-b from-black/80 to-transparent z-10
                       transition-opacity duration-500
                       ${showBar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={onClose}
          className='text-white/80 hover:text-white w-9 h-9 flex items-center justify-center
                     rounded-full hover:bg-white/15 transition-colors text-xl shrink-0'>←</button>
        <span className='text-white text-sm flex-1 truncate min-w-0 px-1'>{item.name}</span>
        {!item.isImage && (
          <>
            <button onClick={() => { const v = videoRef.current; if (v) { v.loop = !loop; } setLoop(l => !l); }}
              title={loop ? '取消循环' : '循环'}
              className={`w-8 h-8 flex items-center justify-center rounded-full text-lg transition-colors shrink-0
                         ${loop ? 'text-primary bg-primary/20' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
              ↺
            </button>
            <button onClick={toggleFullscreen} title={isFullscreen ? '退出全屏' : '全屏'}
              className='w-8 h-8 flex items-center justify-center rounded-full text-sm
                         text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0'>
              {isFullscreen ? '⊡' : '⛶'}
            </button>
          </>
        )}
        {playlist.length > 1 && (
          <span className='text-white/50 text-xs shrink-0 px-1'>{idx + 1}/{playlist.length}</span>
        )}
      </div>

      {/* Edge swipe hints */}
      {dragX === 0 && !dismissing && (
        <>
          <div className='absolute left-0 top-1/2 -translate-y-1/2 h-16 w-1 rounded-r-full bg-white/10 pointer-events-none' />
          <div className='absolute right-0 top-1/2 -translate-y-1/2 h-16 w-1 rounded-l-full bg-white/10 pointer-events-none' />
        </>
      )}
      {item.isImage && dragX === 0 && !showBar && (
        <div className='absolute bottom-4 left-1/2 -translate-x-1/2 text-white/35 text-xs pointer-events-none'>
          点击或左右滑动关闭
        </div>
      )}
      {hasPrev && (
        <button onClick={e => { e.stopPropagation(); goTo(idx - 1, 'down'); }}
          className='absolute top-12 left-1/2 -translate-x-1/2 text-white/30 hover:text-white/70
                     transition-colors text-2xl leading-none pointer-events-auto z-20'>︿</button>
      )}
      {hasNext && (
        <button onClick={e => { e.stopPropagation(); goTo(idx + 1, 'up'); }}
          className='absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 hover:text-white/70
                     transition-colors text-2xl leading-none pointer-events-auto z-20'>﹀</button>
      )}
    </div>
  );
}
