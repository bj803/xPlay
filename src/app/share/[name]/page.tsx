'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { VscRefresh, VscSettingsGear } from 'react-icons/vsc';
import { MdSwapVert } from 'react-icons/md';
import { FcRemoveImage } from 'react-icons/fc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import type { FileItem } from './_types';
import { GRID_CLASSES } from './_types';
import { MediaViewer } from './_MediaViewer';
import { SettingsModal } from './_SettingsModal';
import { ShareVideoItem } from './_ShareVideoItem';

// ─────────────────────────────────────────────
// Main Share Page
// ─────────────────────────────────────────────
export default function SharePage() {
  const params    = useParams();
  const shareName = params?.name as string;

  const [mode, setMode]     = useState<'loading' | 'password' | 'folder' | 'single' | 'error'>('loading');
  const [data, setData]     = useState<any>(null);
  const [pwd, setPwd]       = useState('');
  const [pwdInput, setPwdInput] = useState('');
  const [pwdErr, setPwdErr]   = useState('');
  const [sub, setSub]       = useState('');
  const [player, setPlayer] = useState<{ src: string; name: string } | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{
    playlist: { src: string; name: string; isImage: boolean }[];
    startIndex: number;
  } | null>(null);
  const [columns, setColumns]         = useState(4);
  const [showColPicker, setShowColPicker] = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [sort, setSort] = useState<'newest'|'oldest'|'nameAZ'|'nameZA'|'sizeAsc'|'sizeDesc'>('newest');
  const [showSortPicker, setShowSortPicker] = useState(false);

  // ── load ─────────────────────────────────
  const load = useCallback(async (password = '', subPath = '') => {
    setMode('loading');
    const qs = new URLSearchParams();
    if (password) qs.set('pwd', password);
    if (subPath)  qs.set('sub', subPath);
    const r = await fetch(`/api/share-folder/${shareName}?${qs}`);

    if (r.status === 401) { const d = await r.json(); setData(d); setMode('password'); return; }
    if (r.status === 403) { setPwdErr('密码错误'); setMode('password'); return; }
    if (r.ok)             { const d = await r.json(); setData(d); setMode('folder'); return; }

    if (r.status === 404) {
      const r2 = await fetch(`/api/share/${shareName}${password ? '?pwd=' + encodeURIComponent(password) : ''}`);
      if (r2.status === 401) { const d = await r2.json(); setData(d); setMode('password'); return; }
      if (r2.status === 403) { setPwdErr('密码错误'); setMode('password'); return; }
      if (r2.ok) {
        const d = await r2.json();
        if (d.error) { setData(d); setMode('error'); return; }
        setData({ ...d, isSingle: true }); setMode('single'); return;
      }
    }
    setData({ error: '链接无效或已过期' }); setMode('error');
  }, [shareName]);

  useEffect(() => { load(); }, [load]);

  const submitPwd = async (e: React.FormEvent) => {
    e.preventDefault(); setPwdErr('');
    await load(pwdInput, sub);
    // If load succeeded mode will no longer be 'password'; save the pwd
    setPwd(pwdInput);
  };

  const openFolder = (f: FileItem) => {
    const ns = sub ? sub + '/' + f.name : f.name;
    setSub(ns); load(pwd, ns);
  };
  const goUp = () => {
    const parts = sub.split('/'); parts.pop();
    const ns = parts.join('/'); setSub(ns); load(pwd, ns);
  };

  const files: FileItem[]   = data?.files || [];
  const streamUrlSingle     = data?.streamUrl || '';

  const sortedFiles = [...files].sort((a, b) => {
    if (sort === 'newest')  return b.mtime - a.mtime;
    if (sort === 'oldest')  return a.mtime - b.mtime;
    if (sort === 'nameAZ')  return a.name.localeCompare(b.name);
    if (sort === 'nameZA')  return b.name.localeCompare(a.name);
    if (sort === 'sizeAsc') return a.size - b.size;
    if (sort === 'sizeDesc')return b.size - a.size;
    return 0;
  });

  const SORT_LABELS: Record<string, string> = {
    newest: '最新', oldest: '最旧', nameAZ: '名称A-Z', nameZA: '名称Z-A', sizeAsc: '大小↑', sizeDesc: '大小↓',
  };

  // Build ordered media playlist (videos + images, no dirs)
  const mediaPlaylist = sortedFiles
    .filter(f => !f.isDir && (f.isVideo || f.isAudio || f.isImage))
    .map(f => ({
      src: `/api/share-folder/${shareName}/file?path=${encodeURIComponent(f.path)}${pwd ? '&pwd=' + encodeURIComponent(pwd) : ''}`,
      name: f.name,
      isImage: f.isImage,
    }));

  const openMedia = (file: FileItem) => {
    const idx = mediaPlaylist.findIndex(p => p.name === file.name);
    setMediaViewer({ playlist: mediaPlaylist, startIndex: Math.max(0, idx) });
  };

  if (mediaViewer) return (
    <MediaViewer
      playlist={mediaViewer.playlist}
      startIndex={mediaViewer.startIndex}
      onClose={() => setMediaViewer(null)}
    />
  );

  if (player) return <MediaViewer
    playlist={[{ src: player.src, name: player.name, isImage: /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i.test(player.name) }]}
    startIndex={0}
    onClose={() => setPlayer(null)}
  />;

  // ── Settings full-page mode ──────────────────
  if (showSettings) return (
    <SettingsModal
      open={true}
      onClose={() => setShowSettings(false)}
      shareName={shareName}
      pwd={pwd}
      onPwdChanged={newP => setPwd(newP)}
      onDone={() => load(pwd, sub)}
    />
  );

  return (
    <div className='min-h-screen bg-background text-foreground'>

      {/* ── 顶部栏 — 严格对齐收藏目录，max-w-7xl ── */}
      <div className='sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50'>
        <div className='max-w-7xl mx-auto'>

          {/* 行1：面包屑 pills（收藏目录风格，可横向滚动）+ 刷新 + 设置 */}
          <div className='flex items-center gap-0 px-3 py-2 border-b border-border/30 min-w-0'>
            {/* Scrollable breadcrumb pills */}
            <div className='flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0 pr-2'>
              {/* Root pill — always shown */}
              <button
                onClick={() => { setSub(''); load(pwd, ''); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                             transition-colors shrink-0 whitespace-nowrap
                             ${!sub
                               ? 'bg-primary text-primary-foreground'
                               : 'border border-border/70 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5'}`}>
                {shareName}
              </button>
              {/* Ancestor segment pills */}
              {sub.split('/').filter(Boolean).map((part, i, arr) => {
                const p = arr.slice(0, i + 1).join('/');
                const isCurrent = i === arr.length - 1;
                return (
                  <span key={i} className='flex items-center gap-1.5 shrink-0'>
                    <span className='text-muted-foreground/50 text-xs'>›</span>
                    <button
                      onClick={() => { setSub(p); load(pwd, p); }}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium
                                   transition-colors whitespace-nowrap
                                   ${isCurrent
                                     ? 'bg-primary text-primary-foreground'
                                     : 'border border-border/70 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5'}`}>
                      📁 {part}
                    </button>
                  </span>
                );
              })}
            </div>
            {/* Refresh + Settings — always visible right side */}
            {mode === 'folder' && (
              <div className='flex items-center gap-0.5 shrink-0'>
                <Button variant='ghost' size='icon' className='h-7 w-7 text-base text-muted-foreground'
                  title='刷新' onClick={() => load(pwd, sub)}>
                  <VscRefresh />
                </Button>
                <Button variant='ghost' size='icon' className='h-7 w-7 text-base text-muted-foreground'
                  title='设置' onClick={() => setShowSettings(true)}>
                  <VscSettingsGear />
                </Button>
              </div>
            )}
          </div>

          {/* 行2：子目录pills（左，横向滚动）| 工具组（右）*/}
          {mode === 'folder' && (
            <div className='flex items-center gap-2 px-3 py-1.5 min-w-0'>
              <div className='flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0'>
                {files.filter(f => f.isDir).map((f, i) => (
                  <button key={i} onClick={() => openFolder(f)}
                    className='flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/70
                               text-xs text-muted-foreground hover:border-primary hover:text-primary
                               hover:bg-primary/5 transition-colors shrink-0 whitespace-nowrap'>
                    📁 {f.name}
                  </button>
                ))}
              </div>

              {/* Right tools */}
              <div className='flex items-center gap-1 shrink-0'>
                <span className='text-xs text-muted-foreground px-1'>
                  共 {files.filter(f => !f.isDir).length} 个
                </span>

                {/* 列数 */}
                <div className='relative'>
                  <Button variant='ghost' size='icon' className='h-7 w-7 text-muted-foreground'
                    title='列数' onClick={() => { setShowColPicker(v => !v); setShowSortPicker(false); }}>
                    <svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
                      <rect x='1'  y='1' width='4' height='14' rx='1' opacity='.7' />
                      <rect x='6'  y='1' width='4' height='14' rx='1' opacity='.7' />
                      <rect x='11' y='1' width='4' height='14' rx='1' opacity='.7' />
                    </svg>
                  </Button>
                  {showColPicker && (
                    <div className='absolute right-0 top-8 bg-card border border-border rounded-xl
                                    shadow-xl p-2 z-50 flex gap-1'>
                      {[2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => { setColumns(n); setShowColPicker(false); }}
                          className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors
                            ${columns === n ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 排序 — icon only, shows current sort as tooltip */}
                <div className='relative'>
                  <Button variant='ghost' size='icon' className='h-7 w-7 text-muted-foreground'
                    title={SORT_LABELS[sort]}
                    onClick={() => { setShowSortPicker(v => !v); setShowColPicker(false); }}>
                    <MdSwapVert className='text-base' />
                  </Button>
                  {showSortPicker && (
                    <div className='absolute right-0 top-8 bg-card border border-border rounded-xl
                                    shadow-xl p-1.5 z-50 flex flex-col gap-0.5 w-28'>
                      {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map(k => (
                        <button key={k} onClick={() => { setSort(k as any); setShowSortPicker(false); }}
                          className={`px-3 py-2 rounded-lg text-xs text-left transition-colors
                            ${sort === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}>
                          {SORT_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Page body — max-w-7xl 与 header 对齐 ── */}
      <div className='max-w-7xl mx-auto p-3'>

        {/* Loading skeleton */}
        {mode === 'loading' && (
          <div className={GRID_CLASSES[columns] || GRID_CLASSES[4]}>
            {Array.from({ length: columns * 2 }).map((_, i) => (
              <div key={i} className='rounded-lg overflow-hidden bg-card-nested'>
                <Skeleton className='w-full aspect-video rounded-none' />
                <div className='p-2 space-y-1.5'>
                  <Skeleton className='h-3.5 w-full' />
                  <Skeleton className='h-3.5 w-2/3' />
                  <Skeleton className='h-7 w-full mt-1' />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {mode === 'error' && (
          <div className='flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground'>
            <span className='text-5xl'>⚠</span>
            <p className='text-base'>{data?.error}</p>
            <p className='text-sm'>此链接可能已过期或被删除</p>
          </div>
        )}

        {/* Password */}
        {mode === 'password' && (
          <div className='max-w-sm mx-auto mt-20'>
            <div className='bg-card border border-border rounded-2xl p-7 shadow-xl'>
              <p className='text-base font-semibold mb-1'>🔒 需要密码</p>
              <p className='text-sm text-muted-foreground mb-5'>{data?.title || shareName}</p>
              <form onSubmit={submitPwd}>
                <input type='password' placeholder='请输入访问密码' value={pwdInput}
                  onChange={e => setPwdInput(e.target.value)} autoFocus
                  className={`w-full bg-muted px-3 py-2.5 rounded-lg border text-sm outline-none mb-2
                    ${pwdErr ? 'border-error' : 'border-border focus:border-primary'}`} />
                {pwdErr && <p className='text-xs text-error-foreground mb-2'>{pwdErr}</p>}
                <button type='submit'
                  className='w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm mt-1'>
                  确认访问
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Single file */}
        {mode === 'single' && streamUrlSingle && (
          <div className='max-w-2xl mx-auto mt-6'>
            <div className='rounded-lg overflow-hidden bg-card-nested cursor-pointer'
              onClick={() => setMediaViewer({
                playlist: [{ src: streamUrlSingle, name: data.fileName || shareName, isImage: /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(data.fileName || '') }],
                startIndex: 0,
              })}>
              <div className='relative w-full aspect-video bg-neutral-900 flex items-center justify-center'>
                <div className='w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center text-3xl text-black'>▶</div>
              </div>
              <div className='p-3'>
                <p className='text-sm font-semibold'>{data.fileName}</p>
                <p className='text-xs text-muted-foreground mt-1'>点击播放</p>
              </div>
            </div>
          </div>
        )}

        {/* Folder — 去掉 返回上级 和 body pills，都在 toolbar 里了 */}
        {mode === 'folder' && (
          <div>
            {sortedFiles.filter(f => !f.isDir).length === 0 && files.every(f => f.isDir) && (
              <div className='flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground'>
                <FcRemoveImage className='text-5xl' />
                <p className='text-sm'>此文件夹为空，点击上方文件夹进入</p>
              </div>
            )}
            {sortedFiles.filter(f => !f.isDir).length === 0 && files.filter(f => !f.isDir).length === 0 && files.every(f => f.isDir) === false && (
              <div className='flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground'>
                <FcRemoveImage className='text-5xl' />
                <p className='text-sm'>此文件夹为空</p>
              </div>
            )}

            {/* Video/image grid */}
            <div className={GRID_CLASSES[columns] || GRID_CLASSES[4]}>
              {sortedFiles.filter(f => !f.isDir).map((f, i) => (
                <ShareVideoItem
                  key={i}
                  file={f}
                  shareName={shareName}
                  pwd={pwd}
                  columns={columns}
                  onDeleted={() => load(pwd, sub)}
                  onRenamed={() => load(pwd, sub)}
                  onMoved={() => load(pwd, sub)}
                  onOpen={openMedia}
                />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
