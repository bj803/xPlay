'use client';
import { useState, useRef } from 'react';
import { MdOutlineVideocamOff } from 'react-icons/md';
import { FcRemoveImage } from 'react-icons/fc';

export function ThumbWithHoverPlay({ thumbUrl, streamUrl }: { thumbUrl: string; streamUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef     = useRef<HTMLVideoElement | null>(null);
  const [imgLoaded, setImgLoaded]   = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [imgError, setImgError]     = useState(false);

  const handleMouseEnter = () => {
    if (!containerRef.current || videoRef.current) return;
    const v = document.createElement('video');
    v.src = `${streamUrl}#t=3`;
    v.className = 'absolute inset-0 w-full h-full object-cover';
    v.muted = true; v.playsInline = true; v.preload = 'none';
    containerRef.current.appendChild(v);
    videoRef.current = v;
    v.play().catch(() => {});
  };
  const handleMouseLeave = () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 3; }
  };
  const handleImgError = () => {
    if (retryCount < 2) setTimeout(() => setRetryCount(n => n + 1), 1500 * (retryCount + 1));
    else setImgError(true);
  };

  const imgSrc = retryCount > 0 ? `${thumbUrl}&r=${retryCount}` : thumbUrl;

  return (
    <div ref={containerRef} className='relative w-full h-full'
      onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {!imgError ? (
        <img key={imgSrc} src={imgSrc} alt='' loading='lazy' decoding='async'
          className={`w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImgLoaded(true)}
          onError={handleImgError}
        />
      ) : (
        <div className='w-full h-full flex items-center justify-center text-4xl bg-neutral-800'>
          <FcRemoveImage />
        </div>
      )}
      {!imgLoaded && !imgError && <div className='absolute inset-0 bg-neutral-800 animate-pulse' />}
    </div>
  );
}


