import React, { memo, useState, useCallback, useEffect } from 'react';
import { mutate } from 'swr';
import { toast } from 'react-toastify';
import numeral from 'numeral';
import { PingSvg } from '@/components/modules/PingSvg';
import { HiOutlineBarsArrowDown, HiOutlineBarsArrowUp } from 'react-icons/hi2';
import { DownloadRequestParams, useDownloadFormStore } from '@/store/downloadForm';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Divider } from '@/components/Divider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn, isPropsEquals } from '@/lib/utils';
import { BsLink45Deg } from 'react-icons/bs';
import type { PlaylistMetadata, VideoFormat, VideoMetadata } from '@/types/video';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

type VideoDownloadFormProps = { metadata: VideoMetadata };

type SelectedFormats = {
  audio: VideoFormat | null;
  video: VideoFormat | null;
  subtitles: VideoMetadata['subtitles'];
};

export const VideoDownloadForm = memo(({ metadata }: VideoDownloadFormProps) => {
  const audioFormat: Array<VideoFormat> = [];
  const videoFormat: Array<VideoFormat> = [];
  for (const format of metadata?.formats) {
    if (format.resolution === 'audio only') {
      audioFormat.unshift(format);
    } else if (format.videoExt !== 'none') {
      videoFormat.unshift(format);
    }
  }
  const [isOpen, setOpen] = useState(false);
  const [isValidating, setValidating] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<SelectedFormats>({
    audio: null,
    video: null,
    subtitles: {}
  });

  const handleClickRadio = (type: 'audio' | 'video', format: VideoFormat) => () => {
    if (!['audio', 'video'].includes(type) || !format) {
      return;
    }
    if (selectedFormats[type] === format) {
      return;
    }
    setSelectedFormats({
      ...selectedFormats,
      [type]: format
    });
  };

  const handleClickSubtitleCheckbox =
    (lang: string, subtitle: VideoMetadata['subtitles'][string]) => () => {
      if (selectedFormats.subtitles[lang]) {
        const { [lang]: _, ...newSubtitles } = selectedFormats.subtitles;
        setSelectedFormats({
          ...selectedFormats,
          subtitles: newSubtitles
        });
      } else {
        setSelectedFormats({
          ...selectedFormats,
          subtitles: {
            ...selectedFormats.subtitles,
            [lang]: subtitle
          }
        });
      }
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isValidating) {
      return;
    }
    if (!selectedFormats.video && !selectedFormats.audio) {
      toast.warn('Please select a formats');
      return;
    }

    const subLangs = Object.keys(selectedFormats.subtitles);

    await requestDownload({
      url: metadata.originalUrl,
      videoId: selectedFormats?.video?.formatId,
      audioId: selectedFormats?.audio?.formatId,
      embedSubs: Boolean(subLangs.length),
      subLangs: subLangs
    });
  };

  const handleClickBestButton = async () => {
    await requestDownload({
      url: metadata.originalUrl
    });
  };

  const handleClickAllCheck = (type: 'subtitles') => () => {
    if (!type) {
      return;
    }
    switch (type) {
      case 'subtitles': {
        setSelectedFormats({
          ...selectedFormats,
          [type]: {
            ...metadata.subtitles
          }
        });
        break;
      }
    }
  };

  const handleClickUncheck = (type: 'audio' | 'video' | 'subtitles') => () => {
    if (!type) {
      return;
    }
    switch (type) {
      case 'audio':
      case 'video': {
        setSelectedFormats({
          ...selectedFormats,
          [type]: null
        });
        break;
      }
      case 'subtitles': {
        setSelectedFormats({
          ...selectedFormats,
          [type]: {}
        });
        break;
      }
    }
  };

  const requestDownload = async (params: NonNullable<DownloadRequestParams>) => {
    if (isValidating) {
      return;
    }
    setValidating(true);
    const { requestDownload } = useDownloadFormStore.getState();
    try {
      const result = await requestDownload(params);

      if (result?.error) {
        toast.error(result?.error || 'Download Failed');
      } else if (result?.success) {
        if (result?.status === 'already') {
          toast.info('Already been downloaded');
          return;
        }
        if (result?.status === 'standby') {
          toast.success('Download requested!');
        } else if (result?.status === 'downloading') {
          toast.success('Download requested!');
        } else if (result?.status === 'restart') {
          toast.success('Download restart');
        }
        mutate('/api/list');
      }
    } catch (e) {}
    setValidating(false);
  };

  const langs = Object.keys(metadata?.subtitles ?? {});

  let bestVideo = metadata.best?.height ? metadata.best?.height + 'p' : metadata.best?.resolution;
  let bestAudio = metadata.best?.acodec;
  const selectVideo = selectedFormats.video;
  const selectAudio = selectedFormats.audio;

  if (metadata.best?.fps) bestVideo += ' ' + metadata.best?.fps + 'fps';
  if (metadata.best?.dynamicRange) bestVideo += ' ' + metadata.best?.dynamicRange;
  if (metadata.best?.vcodec) bestVideo += ' ' + metadata.best?.vcodec;

  return (
    <section className='my-6 mb-2'>
      <div className='text-center'>
        <Button
          className={cn(
            'rounded-full',
            metadata.isLive && 'text-white gradient-background border-0'
          )}
          size='sm'
          onClick={handleClickBestButton}
          title='Download immediately in the best quality'
          disabled={isValidating}
        >
          {isValidating && <Loader2 className='h-4 w-4 animate-spin' />}
          {metadata.isLive && (
            <div className='inline-flex items-center align-text-top text-xl text-rose-600'>
              <PingSvg />
            </div>
          )}
          BEST: {bestVideo} {bestVideo && bestAudio && '+'} {bestAudio}
        </Button>
        {metadata.isLive && (
          <div className='mt-1 text-center text-xs text-base-content/60'>Live Stream!</div>
        )}
      </div>
      <div className={'pt-6'}>
        {audioFormat.length || videoFormat.length ? (
          <form
            onSubmit={handleSubmit}
            className='rounded-b-md'
            style={
              !isOpen
                ? {
                    maxHeight: 120,
                    overflow: 'hidden',
                    background: 'linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.15))'
                  }
                : undefined
            }
          >
            <Divider className='mb-4 select-none'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='border-primary bg-transparent rounded-full opacity-80 gap-x-1'
                onClick={() => setOpen((prev) => !prev)}
                title={isOpen ? 'Close format list' : 'Open format list'}
              >
                {isOpen ? (
                  <HiOutlineBarsArrowUp className='inline' />
                ) : (
                  <HiOutlineBarsArrowDown className='inline' />
                )}
                Optional
              </Button>
            </Divider>
            {isOpen && (
              <div className='my-4 text-center'>
                <OptionalDownloadButton
                  selectVideo={selectVideo}
                  selectAudio={selectAudio}
                  isLive={metadata.isLive}
                  isValidating={isValidating}
                />
              </div>
            )}
            <div className={cn(!isOpen && 'pointer-events-none select-none opacity-60')}>
              <div className='grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] lg:grid-cols-1 gap-2'>
                <div className='overflow-hidden'>
                  <div className='flex items-center justify-between'>
                    <b className='shrink-0'>{metadata.isLive ? 'Stream' : 'Video'}</b>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='h-[1.75em] py-1 px-2'
                      onClick={handleClickUncheck('video')}
                    >
                      Uncheck
                    </Button>
                  </div>
                  {/* grid는 너비 오류가 생김. flex로 변경 */}
                  <RadioGroup
                    className='flex flex-col gap-0'
                    key={selectedFormats.video?.formatId || 'uncheked'}
                  >
                    {videoFormat.map((format) => (
                      <VideoDownloadRadio
                        key={format.formatId}
                        type='video'
                        format={format}
                        checked={format.formatId === selectVideo?.formatId}
                        onClickRadio={handleClickRadio('video', format)}
                      />
                    ))}
                  </RadioGroup>
                </div>
                <Divider variant='horizontal' className='hidden sm:flex' />
                <div className='overflow-hidden'>
                  <div className='flex items-center justify-between'>
                    <b className='shrink-0'>Audio</b>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='h-[1.75em] py-1 px-2'
                      onClick={handleClickUncheck('audio')}
                    >
                      Uncheck
                    </Button>
                  </div>
                  {/* grid는 너비 오류가 생김. flex로 변경 */}
                  <RadioGroup
                    className='flex flex-col gap-0'
                    value={selectedFormats.audio?.formatId || ''}
                    key={selectedFormats.audio?.formatId || 'uncheked'}
                  >
                    {audioFormat.map((format) => (
                      <VideoDownloadRadio
                        key={format.formatId}
                        type='audio'
                        format={format}
                        checked={format.formatId === selectAudio?.formatId}
                        onClickRadio={handleClickRadio('audio', format)}
                      />
                    ))}
                  </RadioGroup>
                </div>
                {langs && (
                  <div className='overflow-hidden sm:col-span-3 lg:col-span-1'>
                    <div className='flex gap-x-1 items-center justify-between'>
                      <b className='grow shrink-0'>Subtitles</b>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='h-[1.75em] py-1 px-2'
                        onClick={handleClickAllCheck('subtitles')}
                        disabled={langs.length === 0}
                      >
                        All
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='h-[1.75em] py-1 px-2'
                        onClick={handleClickUncheck('subtitles')}
                        disabled={langs.length === 0}
                      >
                        Uncheck
                      </Button>
                    </div>
                    {/* grid는 너비 오류가 생김. flex로 변경 */}
                    {langs.map((lang) => {
                      const formats = metadata.subtitles[lang];
                      const checked = Boolean(selectedFormats.subtitles[lang]);
                      const name = formats?.[formats.length - 1]?.name || lang;
                      return (
                        <div key={lang} className='flex my-1'>
                          <Label
                            className='flex items-center pl-1 gap-x-1 cursor-pointer'
                            title='select lang'
                          >
                            <Checkbox
                              name={'subLangs'}
                              checked={checked}
                              onClick={handleClickSubtitleCheckbox(lang, formats)}
                            />
                            <span className='text-sm'>{name}</span>
                          </Label>
                        </div>
                      );
                    })}
                    {langs.length === 0 && (
                      <div className='text-zinc-400 text-center'>No subtitles</div>
                    )}
                  </div>
                )}
              </div>
              <div className='my-4 text-center'>
                <OptionalDownloadButton
                  selectVideo={selectVideo}
                  selectAudio={selectAudio}
                  isLive={metadata.isLive}
                  isValidating={isValidating}
                />
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}, isPropsEquals);

VideoDownloadForm.displayName = 'VideoDownloadForm';

type VideoDownloadRadioProps = {
  type: 'audio' | 'video';
  format: VideoFormat;
  checked: boolean;
  onClickRadio: () => void;
};

const VideoDownloadRadio = ({ type, format, checked, onClickRadio }: VideoDownloadRadioProps) => {
  const content = formatToFormatDescription(type, format);

  const handleEventStopPropagation = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div className='my-0.5 whitespace-nowrap' onClick={onClickRadio}>
      <label className='flex items-center px-1 gap-x-1 cursor-pointer rounded-md hover:bg-foreground/5'>
        <RadioGroupItem value={format.formatId} checked={checked} className='shrink-0' />
        <span className='grow shrink text-sm overflow-hidden text-ellipsis'>{content}</span>
        {format?.filesize && (
          <span className='shrink-0 text-sm overflow-hidden'>
            {numeral(format.filesize).format('0.0b')}
          </span>
        )}
        {format?.url && (
          <a
            className='shrink-0 text-right'
            href={format.url}
            rel='noopener noreferrer'
            target='_blank'
            title='Open Original Media Url'
            onClick={handleEventStopPropagation}
          >
            <BsLink45Deg />
          </a>
        )}
      </label>
    </div>
  );
};

// ── Playlist entry type (from yt-dlp flat-playlist entries) ───
interface PlaylistEntry {
  id: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  url?: string;
  webpage_url?: string;
  uploader?: string;
}

type PlaylistDownloadFormProps = {
  metadata: PlaylistMetadata;
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const PlaylistDownloadForm = memo(({ metadata }: PlaylistDownloadFormProps) => {
  const [isValidating, setValidating] = useState(false);

  // entries 来自 yt-dlp 返回的播放列表元数据（flat-playlist 格式）
  // metadata.entries 可能是 PlaylistEntry[] 也可能不存在（后端裁剪了）
  const metaEntries: PlaylistEntry[] = (metadata as any)?.entries ?? [];

  // 如果 metadata 里没有 entries，则通过 /api/playlist-info 懒加载
  const [lazyEntries, setLazyEntries] = useState<PlaylistEntry[]>([]);
  const [lazyLoading, setLazyLoading] = useState(false);
  const [lazyError, setLazyError] = useState('');
  const [lazyLoaded, setLazyLoaded] = useState(false);

  const loadLazy = useCallback(async () => {
    if (lazyLoaded || lazyLoading || !metadata?.originalUrl) return;
    setLazyLoading(true);
    setLazyError('');
    try {
      const res = await fetch(`/api/playlist-info?url=${encodeURIComponent(metadata.originalUrl)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLazyEntries(data.items ?? []);
      setLazyLoaded(true);
      // 懒加载完成后默认全选
      setSelected(new Set((data.items ?? []).map((_: any, i: number) => i)));
    } catch (e: any) {
      setLazyError(e.message || '加载失败');
    }
    setLazyLoading(false);
  }, [metadata?.originalUrl, lazyLoaded, lazyLoading]);

  // 合并：优先使用 metadata 里的 entries，否则用懒加载的
  const entries: PlaylistEntry[] = metaEntries.length > 0 ? metaEntries : lazyEntries;
  const hasEntries = entries.length > 0;
  const needsLazyLoad = metaEntries.length === 0;

  // 默认全选所有视频（metaEntries 存在时立即设置；懒加载后在 loadLazy 里设置）
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(metaEntries.map((_, i) => i))
  );

  const toggleItem = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === entries.length
        ? new Set()
        : new Set(entries.map((_, i) => i))
    );
  }, [entries]);

  const selectedCount = selected.size;
  const allSelected = entries.length > 0 && selectedCount === entries.length;
  const someSelected = selectedCount > 0 && selectedCount < entries.length;

  // 下载全部（旧逻辑，当没有 entries 时的 fallback）
  const handleDownloadAll = async () => {
    if (isValidating || !metadata?.originalUrl) return;
    setValidating(true);
    const { requestDownload } = useDownloadFormStore.getState();
    try {
      const result = await requestDownload({ url: metadata.originalUrl });
      if (result?.error) {
        toast.error(result?.error || 'Download Failed');
      } else if (result?.success) {
        if (result?.status === 'already') { toast.info('Already been downloaded'); return; }
        toast.success('Download requested!');
        mutate('/api/list');
      }
    } catch (e) {}
    setValidating(false);
  };

  // 下载选中的视频（逐个提交）
  const handleDownloadSelected = async () => {
    if (isValidating || selectedCount === 0) return;
    setValidating(true);

    const selectedEntries = entries.filter((_, i) => selected.has(i));
    const { requestDownload } = useDownloadFormStore.getState();

    let successCount = 0;
    let failCount = 0;

    for (const entry of selectedEntries) {
      // 优先使用 webpage_url，其次 url，最后用 id 拼 YouTube URL
      const videoUrl =
        entry.webpage_url ||
        entry.url ||
        (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);

      if (!videoUrl) { failCount++; continue; }

      try {
        const result = await requestDownload({ url: videoUrl });
        if (result?.error) failCount++;
        else if (result?.success) successCount++;
      } catch {
        failCount++;
      }
      // 避免并发过高
      await new Promise((r) => setTimeout(r, 150));
    }

    mutate('/api/list');
    if (successCount > 0) toast.success(`✓ 已提交 ${successCount} 个下载任务`);
    if (failCount > 0) toast.error(`✗ ${failCount} 个视频提交失败`);

    setValidating(false);
  };

  // ── 有 entries 或需要懒加载：显示带封面的卡片选择列表 ──────
  if (hasEntries || needsLazyLoad) {
    return (
      <div className='my-2'>
        {/* 懒加载触发区（当 metadata 里没有 entries 时显示） */}
        {needsLazyLoad && !lazyLoaded && (
          <div className='text-center mb-3'>
            {lazyLoading ? (
              <div className='flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>正在获取视频列表…</span>
              </div>
            ) : lazyError ? (
              <div className='text-sm text-destructive py-2'>
                ⚠ {lazyError}
                <Button size='sm' variant='outline' className='ml-2 h-6 px-2 text-xs' onClick={loadLazy}>
                  重试
                </Button>
              </div>
            ) : (
              <Button
                size='sm'
                variant='outline'
                className='rounded-full gap-1'
                onClick={loadLazy}
              >
                <HiOutlineBarsArrowDown className='inline' />
                展开视频列表（{metadata?.playlistCount ?? '?'} 个）
              </Button>
            )}
          </div>
        )}

        {/* 有视频数据时显示卡片 */}
        {hasEntries && (
          <>
            {/* 工具栏：全选 + 计数 */}
            <div className='flex items-center justify-between mb-3 px-1'>
              <label className='flex items-center gap-2 cursor-pointer select-none'>
                <input
                  type='checkbox'
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  className='accent-primary w-3.5 h-3.5 cursor-pointer'
                />
                <span className='text-xs text-muted-foreground'>
                  {allSelected ? '取消全选' : '全选'}
                </span>
              </label>
              <span className='text-xs font-medium text-primary'>
                已选 {selectedCount} / {entries.length}
              </span>
            </div>

            {/* 视频卡片网格（2列） */}
            <div className='grid grid-cols-2 gap-2 mb-3'>
              {entries.map((entry, idx) => {
                const isChecked = selected.has(idx);
                const thumb = entry.thumbnail || '';
                const dur = formatDuration(entry.duration ?? 0);
                return (
                  <div
                    key={entry.id || idx}
                    onClick={() => toggleItem(idx)}
                    className='cursor-pointer rounded-lg overflow-hidden select-none transition-all'
                    style={{
                      background: isChecked
                        ? 'color-mix(in srgb, var(--primary) 8%, var(--card))'
                        : 'var(--card-nested, var(--card))',
                      border: `2px solid ${isChecked ? 'hsl(var(--primary))' : 'transparent'}`,
                    }}
                  >
                    {/* 封面 */}
                    <div
                      className='relative w-full overflow-hidden'
                      style={{ aspectRatio: '16/9', background: 'var(--muted)' }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={entry.title || ''}
                          className='w-full h-full object-cover block'
                          loading='lazy'
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className='w-full h-full flex items-center justify-center text-2xl text-muted-foreground/30'>
                          ▶
                        </div>
                      )}
                      {/* 时长标签 */}
                      {dur && (
                        <span
                          className='absolute bottom-1 right-1 text-white text-[10px] font-semibold px-1 py-0.5 rounded'
                          style={{ background: 'rgba(0,0,0,0.82)' }}
                        >
                          {dur}
                        </span>
                      )}
                      {/* 序号 */}
                      <span
                        className='absolute top-1 left-1 text-[10px] px-1 py-0.5 rounded'
                        style={{ background: 'rgba(0,0,0,0.60)', color: '#bbb' }}
                      >
                        {idx + 1}
                      </span>
                      {/* 选中覆盖层 */}
                      {isChecked && (
                        <div
                          className='absolute inset-0 flex items-center justify-center'
                          style={{ background: 'rgba(var(--primary-rgb, 99,102,241), 0.18)' }}
                        >
                          <div
                            className='w-6 h-6 rounded-full flex items-center justify-center text-sm font-black'
                            style={{
                              background: 'hsl(var(--primary))',
                              color: 'hsl(var(--primary-foreground))',
                            }}
                          >
                            ✓
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 标题 */}
                    <div
                      className='px-2 pt-1.5 pb-0.5 text-[11px] leading-snug line-clamp-2'
                      style={{ color: isChecked ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
                    >
                      {entry.title || entry.id || `视频 ${idx + 1}`}
                    </div>
                    {entry.uploader && (
                      <div className='px-2 pb-1.5 text-[10px] truncate text-muted-foreground'>
                        {entry.uploader}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 下载按钮 */}
            <div className='text-center'>
              <Button
                size='sm'
                className='rounded-full w-full'
                disabled={isValidating || selectedCount === 0}
                onClick={handleDownloadSelected}
              >
                {isValidating && <Loader2 className='h-4 w-4 animate-spin mr-1' />}
                {selectedCount === 0
                  ? '请选择视频'
                  : `下载选中的 ${selectedCount} 个视频`}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 没有 entries（旧版 fallback）：显示原来的一键下载全部 ──
  return (
    <div className='my-2'>
      <div className='text-zinc-400 text-sm text-center'>
        <p>This url is a playlist.</p>
        <p>Live is excluded and all are downloaded in the best quality.</p>
        <Button
          size='sm'
          className={cn('rounded-full my-2', isValidating && 'loading')}
          onClick={handleDownloadAll}
          disabled={isValidating}
        >
          {isValidating && <Loader2 className='h-4 w-4 animate-spin mr-1' />}
          Download&nbsp;<b>{metadata?.playlistCount || 'Unknown'}</b>&nbsp;items from a playlist
        </Button>
      </div>
    </div>
  );
}, isPropsEquals);

PlaylistDownloadForm.displayName = 'PlaylistDownloadForm';

function formatToFormatDescription(type: 'audio' | 'video', format: VideoFormat) {
  switch (type) {
    case 'audio': {
      return `${format.formatNote || format.formatId} ${format.acodec}`;
    }
    case 'video': {
      let text = format.height ? format.height + 'p' : format.resolution;
      if (format.fps) text += ' ' + format.fps + 'fps';
      if (format.dynamicRange) text += ' ' + format.dynamicRange;
      if (format.vcodec) text += ' ' + format.vcodec;

      return text;
    }
    default: {
      return '';
    }
  }
}

type OptionalDownloadButtonProps = {
  selectVideo: VideoFormat | null;
  selectAudio: VideoFormat | null;
  isLive: boolean;
  isValidating: boolean;
};
function OptionalDownloadButton({
  isLive,
  selectAudio,
  selectVideo,
  isValidating
}: OptionalDownloadButtonProps) {
  return (
    <>
      <Button
        className={cn(
          'bg-info rounded-full hover:bg-info/90 px-3',
          isLive && 'text-white gradient-background border-0'
        )}
        size='sm'
        type='submit'
        title='Download with selected option'
        disabled={isValidating}
      >
        {isValidating && <Loader2 className='h-4 w-4 animate-spin' />}
        {isLive && (
          <div className='inline-flex items-center align-text-top text-xl text-rose-600'>
            <PingSvg />
          </div>
        )}
        {selectVideo && formatToFormatDescription('video', selectVideo)}
        {selectVideo && selectAudio && ' + '}
        {selectAudio && formatToFormatDescription('audio', selectAudio)}
        {!selectVideo && !selectAudio ? <span>Optional Download</span> : null}
      </Button>
      <div className='text-xs text-muted-foreground'></div>
      <div className='text-xs text-muted-foreground'>
        {selectVideo && !selectAudio
          ? 'Video only'
          : !selectVideo && selectAudio
          ? 'Audio only'
          : selectVideo && selectAudio
          ? 'Video + Audio Download'
          : ''}
      </div>
    </>
  );
}
