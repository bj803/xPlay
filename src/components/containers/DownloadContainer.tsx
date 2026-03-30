/* eslint-disable react/no-unescaped-entities */
'use client';

import React, { memo, useRef, useState, useEffect, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import axios from 'axios';
import { toast } from 'react-toastify';
import { IoClose } from 'react-icons/io5';
import {
  AiOutlineCloudDownload,
  AiOutlineLink,
  AiOutlineLoading3Quarters,
  AiOutlineSearch,
  AiOutlineSetting,
  AiOutlineUnorderedList
} from 'react-icons/ai';
import { HiOutlineBarsArrowDown, HiOutlineBarsArrowUp, HiOutlinePencil } from 'react-icons/hi2';
import { MdContentPaste, MdExpandLess, MdGridView } from 'react-icons/md';
import { LuLogOut } from 'react-icons/lu';
import type { PlaylistMetadata, SelectQuality, VideoMetadata } from '@/types/video';
import { useDownloadFormStore } from '@/store/downloadForm';
import { CookiesEditor } from '@/components/modules/CookiesEditor';
import { ShareManager } from '@/components/modules/ShareManager';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { shallow } from 'zustand/shallow';
import { useVideoListStore } from '@/store/videoList';
import { VscRefresh } from 'react-icons/vsc';
import { PatternFormat } from 'react-number-format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  PlaylistDownloadForm,
  VideoDownloadForm
} from '@/components/download-form/OptionalDownloadForm';
import { FcRemoveImage } from 'react-icons/fc';
import { RiArrowUpSLine } from 'react-icons/ri';
import { Divider } from '@/components/Divider';
import { isPropsEquals } from '@/lib/utils';
import numeral from 'numeral';
import { Progress } from '@/components/ui/progress';
import type { DiskSpace } from '@/types/types';

type AllMetadata = VideoMetadata | PlaylistMetadata | null;

// ── Storage bar (inside panel) ────────────────────────────────
function YtDlpVersionInline() {
  const { data: ver, isValidating } = useSWR<string>(
    '/api/v/yt-dlp',
    (url: string) => axios.get(url).then((r) => r.data),
    { revalidateOnFocus: false, errorRetryCount: 1 }
  );
  return (
    <p>
      yt-dlp version:{' '}
      {isValidating ? '...' : ver ? (
        <a className='hover:underline' href={`https://github.com/yt-dlp/yt-dlp/releases/tag/${ver}`} rel='noopener noreferrer' target='_blank'>{ver}</a>
      ) : 'unknown'}
    </p>
  );
}
function StorageBar() {
  const { data: space } = useSWR<DiskSpace>(
    '/api/stat/storage',
    (url) => axios.get(url).then((r) => r.data),
    { revalidateOnFocus: true, refreshInterval: 30 * 1000, errorRetryCount: 1 }
  );
  if (!space) return null;
  const pct = space.usageInPercentage;
  return (
    <div className='flex items-center gap-2 py-1 px-1'>
      <span className='text-xs text-muted-foreground shrink-0'>存储</span>
      <div className='flex-1 h-1.5 rounded-full bg-muted overflow-hidden'>
        <div
          className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-error-foreground' : pct > 75 ? 'bg-warning-foreground' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className='text-xs text-muted-foreground shrink-0'>
        {numeral(space.usage).format('0.0b')} / {numeral(space.total).format('0.0b')}
      </span>
    </div>
  );
}

// ── Auth sign-out (client-side, only shows when logged in) ────
function SignOutRow() {
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => {
      if (s?.user?.name || s?.user?.email) setUser(s.user.name || s.user.email);
    }).catch(() => {});
  }, []);
  if (!user) return null;
  return (
    <div className='flex items-center justify-between px-1 py-1'>
      <span className='text-xs text-muted-foreground'>{user}</span>
      <form action='/api/auth/signout' method='POST'>
        <Button type='submit' variant='ghost' size='sm' className='h-7 text-xs gap-1 text-muted-foreground'>
          <LuLogOut className='text-sm' /> 登出
        </Button>
      </form>
    </div>
  );
}

// ── Playlist Panel (inside settings) ─────────────────────────
interface PlaylistItem { index:number; id:string; title:string; thumbnail:string; duration:number; url:string; uploader:string; }

function fmtDur(sec:number):string {
  if(!sec||sec<=0) return '';
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
  if(h>0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

const PAGE_SIZE = 10;

function PlaylistPanel({ url }: { url: string }) {
  const hasListParam = /[?&]list=/.test(url);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'video'|'audio'>('video');
  const loadedUrl = useRef('');

  // 打开时自动加载
  const handleOpen = useCallback(() => {
    setOpen(true);
    if (loadedUrl.current === url && items.length > 0) return;
    loadedUrl.current = url;
    setLoading(true); setError(''); setItems([]); setSelected(new Set()); setPage(0);
    fetch(`/api/playlist-info?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        const loaded: PlaylistItem[] = data.items || [];
        setItems(loaded);
        setSelected(new Set(loaded.map((_:any,i:number)=>i)));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [url, items.length]);

  const toggle = useCallback((i:number) => {
    setSelected(prev => { const n=new Set(prev); n.has(i)?n.delete(i):n.add(i); return n; });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected(prev => prev.size===items.length ? new Set() : new Set(items.map((_,i)=>i)));
  }, [items]);

  const handleDownload = useCallback(async (audioOnly = false) => {
    const sel = items.filter((_,i) => selected.has(i));
    if (!sel.length) return;
    setSubmitting(true); setConfirmOpen(false);
    const { requestDownload } = useDownloadFormStore.getState();
    let ok=0, fail=0;
    for (const item of sel) {
      try {
        const params: any = { url: item.url };
        if (audioOnly) params.audioOnly = true;
        const r = await requestDownload(params);
        if(r?.error) fail++; else ok++;
      }
      catch { fail++; }
      await new Promise(r=>setTimeout(r,150));
    }
    mutate('/api/list');
    if (ok) toast.success(`✓ 已提交 ${ok} 个${audioOnly?'音频':'视频'}下载任务`);
    if (fail) toast.error(`✗ ${fail} 个提交失败`);
    setSubmitting(false);
  }, [items, selected]);

  if (!hasListParam) return null;

  const selCount = selected.size;
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE);
  const allSel = items.length > 0 && selCount === items.length;
  const someSel = selCount > 0 && selCount < items.length;

  return (
    <Card className='p-2 rounded-md bg-card-nested border-none'>
      <div className='flex items-center justify-between'>
        <CardDescription className='text-muted-foreground text-xs flex items-center gap-1'>
          <AiOutlineUnorderedList />
          播放列表选择下载
        </CardDescription>
        <Button type='button' size='sm' variant='outline'
          className='h-6 px-2 text-xs rounded-full gap-1'
          onClick={open ? ()=>setOpen(false) : handleOpen}
          disabled={loading}>
          {loading ? <Loader2 className='h-3 w-3 animate-spin'/> :
            open ? <HiOutlineBarsArrowUp className='inline'/> : <HiOutlineBarsArrowDown className='inline'/>}
          {open ? '收起' : '展开列表'}
        </Button>
      </div>

      {open && (
        <div className='mt-2'>
          {loading && (
            <div className='flex items-center gap-2 py-4 justify-center text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin'/> 正在获取列表…
            </div>
          )}
          {error && <div className='text-destructive text-xs py-2 text-center'>⚠ {error}</div>}

          {!loading && items.length > 0 && (
            <>
              {/* 工具栏 */}
              <div className='flex items-center justify-between mb-2 mt-1'>
                <label className='flex items-center gap-1.5 cursor-pointer select-none'>
                  <input type='checkbox' checked={allSel}
                    ref={el => { if(el) el.indeterminate=someSel; }}
                    onChange={toggleAll}
                    className='accent-primary w-3.5 h-3.5'/>
                  <span className='text-xs text-muted-foreground'>{allSel?'取消全选':'全选'}</span>
                </label>
                <span className='text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full'>
                  已选 {selCount}/{items.length}
                </span>
              </div>

              {/* 视频列表（当前页） */}
              <div className='flex flex-col gap-1'>
                {pageItems.map((item) => {
                  const globalIdx = page * PAGE_SIZE + pageItems.indexOf(item);
                  const checked = selected.has(globalIdx);
                  // 优先用返回的 thumbnail，fallback 到 ytimg 标准地址
                  const thumbSrc = item.thumbnail ||
                    (item.id ? `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg` : '');
                  return (
                    <div key={item.id||globalIdx} onClick={()=>toggle(globalIdx)}
                      className='flex items-center gap-2 cursor-pointer rounded-md px-1 py-1 hover:bg-foreground/5 select-none'
                      style={{ background: checked ? 'color-mix(in srgb,var(--primary) 6%,transparent)' : undefined }}>
                      {/* 封面 */}
                      <div className='relative shrink-0 rounded overflow-hidden bg-muted'
                        style={{ width:64, height:36 }}>
                        {thumbSrc
                          ? <img src={thumbSrc} alt='' className='w-full h-full object-cover'
                              loading='lazy' onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                          : <div className='w-full h-full flex items-center justify-center text-muted-foreground/30'>▶</div>
                        }
                        {fmtDur(item.duration) && (
                          <span className='absolute bottom-0 right-0 text-white text-[9px] px-0.5 rounded-tl'
                            style={{background:'rgba(0,0,0,0.8)'}}>
                            {fmtDur(item.duration)}
                          </span>
                        )}
                      </div>
                      {/* 标题 */}
                      <div className='flex-1 min-w-0'>
                        <div className={`text-xs leading-snug line-clamp-2 ${checked?'text-primary':'text-foreground'}`}>
                          <span className='text-muted-foreground mr-1'>{globalIdx+1}.</span>
                          {item.title||item.id}
                        </div>
                        {item.uploader && <div className='text-[10px] text-muted-foreground truncate'>{item.uploader}</div>}
                      </div>
                      {/* 勾选框 */}
                      <input type='checkbox' checked={checked} onChange={()=>toggle(globalIdx)}
                        onClick={e=>e.stopPropagation()}
                        className='accent-primary w-4 h-4 shrink-0'/>
                    </div>
                  );
                })}
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className='flex items-center justify-between mt-2 pt-2 border-t border-border/30'>
                  <Button type='button' size='sm' variant='outline' className='h-6 px-2 text-xs'
                    disabled={page===0} onClick={()=>setPage(p=>p-1)}>← 上页</Button>
                  <span className='text-xs text-muted-foreground'>{page+1} / {totalPages}</span>
                  <Button type='button' size='sm' variant='outline' className='h-6 px-2 text-xs'
                    disabled={page===totalPages-1} onClick={()=>setPage(p=>p+1)}>下页 →</Button>
                </div>
              )}

              {/* 下载按钮区 */}
              {!confirmOpen ? (
                <div className='flex gap-2 mt-2'>
                  <Button type='button' size='sm' className='flex-1 rounded-lg text-xs'
                    disabled={selCount===0||submitting}
                    onClick={()=>{ setConfirmMode('video'); setConfirmOpen(true); }}>
                    ↓ 视频 {selCount > 0 && `×${selCount}`}
                  </Button>
                  <Button type='button' size='sm' variant='outline' className='flex-1 rounded-lg text-xs'
                    disabled={selCount===0||submitting}
                    onClick={()=>{ setConfirmMode('audio'); setConfirmOpen(true); }}>
                    ♪ 音频 MP3 {selCount > 0 && `×${selCount}`}
                  </Button>
                </div>
              ) : (
                <div className='mt-2 p-2 rounded-lg border border-warning-foreground/30 bg-warning-foreground/5'>
                  <p className='text-xs text-warning-foreground mb-2 text-center'>
                    确认将 <b>{selCount}</b> 个{confirmMode==='audio'?'音频（MP3）':'视频'}加入下载队列？
                  </p>
                  <div className='flex gap-2'>
                    <Button type='button' size='sm' variant='outline' className='flex-1 rounded-lg text-xs h-7'
                      onClick={()=>setConfirmOpen(false)}>取消</Button>
                    <Button type='button' size='sm' className='flex-1 rounded-lg text-xs h-7'
                      disabled={submitting} onClick={()=>handleDownload(confirmMode==='audio')}>
                      {submitting && <Loader2 className='h-3 w-3 animate-spin mr-1'/>}
                      确认下载
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────
function FolderIconDC({ color }: { color: string }) {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill={color} style={{ flexShrink:0 }}><path d="M2 4a1 1 0 011-1h4l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>;
}

export function DownloadContainer() {
  const [videoMetadata, setVideoMetadata] = useState<AllMetadata>(null);
  const [expanded, setExpanded] = useState(false);

  const { isFetching, setFetching, url, setUrl } = useDownloadFormStore(
    ({ isFetching, setFetching, url, setUrl }) => ({
      isFetching, setFetching, url, setUrl
    }),
    shallow
  );
  const { tabMode, setTabMode,
          favColumns, setFavColumns,
          favSortKey, setFavSortKey,
          favSearch, setFavSearch,
          favVideoCount,
          bumpFavRefresh, setFavBrowsePath } = useVideoListStore();

  // 当 URL 含 list= 时自动展开设置面板
  useEffect(() => {
    if (/[?&]list=/.test(url)) setExpanded(true);
  }, [url]);

  const handleCloseMetadata = () => {
    setVideoMetadata(null);
    const { setOutputFilename, setEnableOutputFilename } = useDownloadFormStore.getState();
    setOutputFilename('%(title).40s (%(id).5s)');
    setEnableOutputFilename(true);
  };

  // ── 直接下载（主按钮）──────────────────────────────────────
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isFetching) return;
    if (!url || !/^https?:\/?\/?\/?/i.test(url)) {
      toast.warn('请检查链接格式\n例如：https://www.youtube.com/xxxxx', { autoClose: 5000 });
      return;
    }
    setFetching(true);
    setVideoMetadata(null);
    const { requestDownload } = useDownloadFormStore.getState();
    try {
      const result = await requestDownload();
      if (result?.error) {
        toast.error(result?.error || '下载失败');
      } else if (result?.success) {
        if (result?.status === 'already') { toast.info('该视频已下载过'); return; }
        toast.success('下载请求已提交！');
        mutate('/api/list');
      }
    } finally {
      setFetching(false);
    }
  };

  // ── 预览（获取元数据，填入文件名，打开设置面板）──────────
  const handlePreview = async () => {
    if (isFetching) return;
    if (!url || !/^https?:\/?\/?\/?/i.test(url)) {
      toast.warn('请检查链接格式\n例如：https://www.youtube.com/xxxxx', { autoClose: 5000 });
      return;
    }
    setFetching(true);
    setVideoMetadata(null);
    const { getMetadata, setOutputFilename, setEnableOutputFilename } = useDownloadFormStore.getState();
    try {
      const metadata = await getMetadata();
      if (metadata?.error) {
        toast.error(metadata?.error || '预览失败');
      } else if (metadata?.id) {
        setVideoMetadata(metadata);
        setExpanded(true);
        // 把真实标题填入文件名（截断到40字符）
        if (metadata?.title) {
          const safe = metadata.title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40);
          setOutputFilename(`${safe} (${metadata.id.slice(0, 5)})`);
          setEnableOutputFilename(true);
        }
      }
    } catch (err) {
      if (typeof err === 'string') toast.error(err);
    } finally {
      setFetching(false);
    }
  };

  // ── Favorites nav state (lifted here for sticky header) ────────────────
  const FAVORITES_ROOT_DC = '/additional-browse';
  type FavSortKey = 'newest'|'oldest'|'name_az'|'name_za'|'size_asc'|'size_desc';
  type FavFolder = { name: string; path: string };
  type FavNavLevel = { selected: FavFolder; siblings: FavFolder[]; children: FavFolder[] };
  const FAV_SORT_OPTIONS: { key: FavSortKey; label: string }[] = [
    { key: 'newest', label: '最新优先' }, { key: 'oldest', label: '最旧优先' },
    { key: 'name_az', label: '名称 A→Z' }, { key: 'name_za', label: '名称 Z→A' },
    { key: 'size_asc', label: '大小 ↑' },  { key: 'size_desc', label: '大小 ↓' },
  ];
  const FAV_COL_OPTIONS = [2, 3, 4, 5];

  const [rootFoldersDC, setRootFoldersDC] = useState<FavFolder[]>([]);
  const [navStackDC, setNavStackDC] = useState<FavNavLevel[]>([]);
  const [showFavColPicker, setShowFavColPicker] = useState(false);
  const [showFavSortPicker, setShowFavSortPicker] = useState(false);
  const [showFavSearch, setShowFavSearch] = useState(false);

  const fetchSubdirsDC = useCallback(async (path: string): Promise<FavFolder[]> => {
    try {
      const r = await fetch(`/api/local-files?path=${encodeURIComponent(path)}&listDirs=true`);
      const d = await r.json();
      return d.subdirs || [];
    } catch { return []; }
  }, []);

  useEffect(() => {
    if (tabMode === 'favorites') fetchSubdirsDC(FAVORITES_ROOT_DC).then(setRootFoldersDC);
  }, [tabMode, fetchSubdirsDC]);

  const handleFavResetDC = () => { setNavStackDC([]); setFavBrowsePath('/additional-browse'); };
  const handleRootClickDC = async (f: FavFolder) => {
    const children = await fetchSubdirsDC(f.path);
    setNavStackDC([{ selected: f, siblings: rootFoldersDC, children }]);
    setFavBrowsePath(f.path);
  };
  const handleChildClickDC = async (f: FavFolder) => {
    const top = navStackDC[navStackDC.length - 1];
    const children = await fetchSubdirsDC(f.path);
    setNavStackDC(prev => [...prev, { selected: f, siblings: top.children, children }]);
    setFavBrowsePath(f.path);
  };
  const handleSiblingClickDC = async (f: FavFolder, idx: number) => {
    const children = await fetchSubdirsDC(f.path);
    const stack = navStackDC.slice(0, idx);
    stack.push({ selected: f, siblings: navStackDC[idx].siblings, children });
    setNavStackDC(stack);
    setFavBrowsePath(f.path);
  };
  const handleAncestorClickDC = async (f: FavFolder, idx: number) => {
    const children = await fetchSubdirsDC(f.path);
    setNavStackDC(navStackDC.slice(0, idx + 1).map((l, i) =>
      i === idx ? { selected: f, siblings: l.siblings, children } : l
    ));
    setFavBrowsePath(f.path);
  };
  const handleGoBackDC = () => {
    if (navStackDC.length <= 1) { handleFavResetDC(); return; }
    const pi = navStackDC.length - 2;
    handleAncestorClickDC(navStackDC[pi].selected, pi);
  };

  const pillA: React.CSSProperties = { height:26, padding:'0 10px', borderRadius:999, border:'1.5px solid hsl(var(--primary))', background:'hsl(var(--primary) / 0.12)', color:'hsl(var(--primary))', fontSize:12, fontWeight:500, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 };
  const pillI: React.CSSProperties = { height:26, padding:'0 10px', borderRadius:999, border:'1px solid hsl(var(--border))', background:'hsl(var(--muted) / 0.5)', color:'hsl(var(--muted-foreground))', fontSize:12, fontWeight:500, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 };
  const pillS: React.CSSProperties = { ...pillI, opacity:0.5 };
  const pillC: React.CSSProperties = { height:26, padding:'0 10px', borderRadius:999, border:'1px solid hsl(var(--border) / 0.8)', background:'hsl(var(--background))', color:'hsl(var(--foreground))', fontSize:12, fontWeight:500, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 };
  const sepSt: React.CSSProperties = { fontSize:13, color:'hsl(var(--muted-foreground))', flexShrink:0, userSelect:'none', padding:'0 1px' };
  const dotSt: React.CSSProperties = { fontSize:16, color:'hsl(var(--muted-foreground))', flexShrink:0, userSelect:'none', padding:'0 3px', lineHeight:1 };
  const iBtn = (active=false): React.CSSProperties => ({ width:28, height:28, borderRadius:6, border: active ? '1.5px solid hsl(var(--primary))' : '1px solid hsl(var(--border))', background: active ? 'hsl(var(--primary) / 0.1)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', position:'relative' });

  const renderFavRow1DC = () => {
    const n = navStackDC.length;
    // chain = ancestors shown in row1 (all but deepest)
    const chainEnd = Math.max(1, n - 1);
    const chain = navStackDC.slice(0, chainEnd);
    const selectedRootPath = chain.length > 0 ? chain[0].selected.path : null;

    if (chain.length >= 3) {
      // Deep path: show only the chain, no root siblings
      return (<>
        {chain.map((level, i) => (
          <span key={level.selected.path} style={{ display:'inline-flex', alignItems:'center', gap:5, flexShrink:0 }}>
            {i > 0 && <span style={sepSt}>/</span>}
            <button type='button' style={pillA} onClick={() => handleAncestorClickDC(level.selected, i)}>
              <FolderIconDC color='hsl(var(--primary))' />{level.selected.name}
            </button>
          </span>
        ))}
      </>);
    }

    // chain≤2: show ALL root folders in ORIGINAL ORDER
    // Replace the selected root folder inline with the chain
    return (<>
      {rootFoldersDC.map(f => {
        if (f.path === selectedRootPath) {
          // Inline replace: show the full chain at this folder's position
          return (
            <span key={f.path} style={{ display:'inline-flex', alignItems:'center', gap:5, flexShrink:0 }}>
              {chain.map((level, i) => (
                <span key={level.selected.path} style={{ display:'inline-flex', alignItems:'center', gap:5, flexShrink:0 }}>
                  {i > 0 && <span style={sepSt}>/</span>}
                  <button type='button' style={pillA} onClick={() => handleAncestorClickDC(level.selected, i)}>
                    <FolderIconDC color='hsl(var(--primary))' />{level.selected.name}
                  </button>
                </span>
              ))}
            </span>
          );
        }
        // Other root folders: grey, dimmed when something is selected
        return (
          <button key={f.path} type='button'
            style={{ ...pillI, opacity: selectedRootPath ? 0.5 : 1 }}
            onClick={() => handleRootClickDC(f)}>
            <FolderIconDC color='hsl(var(--muted-foreground))' />{f.name}
          </button>
        );
      })}
    </>);
  };

  const renderFavRow2DC = () => {
    const n = navStackDC.length;
    // depth=0: nothing
    if (n === 0) return null;
    // depth=1: only children of selected root (white/bright, no current pill)
    if (n === 1) return navStackDC[0].children.map(c => (
      <button key={c.path} type='button' style={pillC} onClick={() => handleChildClickDC(c)}>
        <FolderIconDC color='hsl(var(--foreground))' />{c.name}
      </button>
    ));
    // depth>=2: left-siblings(dim) · current(active-green) · dot · children(bright-white) · dot · right-siblings(dim)
    const deepest = navStackDC[n - 1];
    const allSiblings = deepest.siblings; // ordered list including selected
    const curPath = deepest.selected.path;
    const curIdx = allSiblings.findIndex(s => s.path === curPath);
    const leftSibs = curIdx > 0 ? allSiblings.slice(0, curIdx) : [];
    const rightSibs = curIdx >= 0 ? allSiblings.slice(curIdx + 1) : allSiblings;
    return (<>
      {leftSibs.map(sib => (
        <button key={sib.path} type='button' style={pillS} onClick={() => handleSiblingClickDC(sib, n - 1)}>
          <FolderIconDC color='hsl(var(--muted-foreground))' />{sib.name}
        </button>
      ))}
      <button type='button' style={pillA}>
        <FolderIconDC color='hsl(var(--primary))' />{deepest.selected.name}
      </button>
      {deepest.children.length > 0 && (<>
        <span style={dotSt}>·</span>
        {deepest.children.map(c => (
          <button key={c.path} type='button' style={pillC} onClick={() => handleChildClickDC(c)}>
            <FolderIconDC color='hsl(var(--foreground))' />{c.name}
          </button>
        ))}
      </>)}
      {rightSibs.length > 0 && (<>
        <span style={dotSt}>·</span>
        {rightSibs.map(sib => (
          <button key={sib.path} type='button' style={pillS} onClick={() => handleSiblingClickDC(sib, n - 1)}>
            <FolderIconDC color='hsl(var(--muted-foreground))' />{sib.name}
          </button>
        ))}
      </>)}
    </>);
  };

  return (
    <div className='flex flex-col gap-2'>
      {/* ── DOWNLOADS: URL bar unchanged ── */}
      {tabMode === 'downloads' && (
        <form onSubmit={handleSubmit} className='flex items-center gap-2'>
          <div className='flex items-center flex-1 min-w-0 rounded-full shadow-sm bg-card border border-border/50'>
            <UrlInput />
          </div>
          <SubmitButton />
          <Button type='button' size='sm' variant='outline'
            className='h-8 px-3 rounded-full shrink-0 gap-1'
            disabled={isFetching} onClick={handlePreview} title='预览视频信息并填入文件名'>
            {isFetching ? <Loader2 className='h-4 w-4 animate-spin' /> : <AiOutlineSearch className='h-4 w-4' />}
            <span className='hidden sm:inline text-xs'>预览</span>
          </Button>
          <Button type='button' size='icon' variant='ghost' className='h-8 w-8 rounded-full shrink-0'
            onClick={() => setExpanded(!expanded)} title={expanded ? '收起选项' : '展开选项'}>
            {expanded ? <MdExpandLess className='text-lg' /> : <AiOutlineSetting className='text-base' />}
          </Button>
        </form>
      )}

      {/* ── BROWSE: single tab row only ── */}
      {tabMode === 'browse' && (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button type='button'
            style={{ height:28, padding:'0 12px', borderRadius:999, border:'1px solid hsl(var(--border))', background:'transparent', color:'hsl(var(--foreground))', fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}
            onClick={() => setTabMode('downloads')}>下载目录</button>
          <button type='button'
            style={{ height:28, padding:'0 12px', borderRadius:999, border:'1px solid hsl(var(--border))', background:'transparent', color:'hsl(var(--foreground))', fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}
            onClick={() => setTabMode('favorites')}>收藏目录</button>
          <button type='button'
            style={{ height:28, padding:'0 12px', borderRadius:999, border:'1.5px solid hsl(var(--primary))', background:'hsl(var(--primary))', color:'hsl(var(--primary-foreground))', fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}
            onClick={() => {}}>浏览</button>
        </div>
      )}

      {/* ── FAVORITES: two-row sticky toolbar ── */}
      {tabMode === 'favorites' && (
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {/* Row 1 */}
          <div style={{ display:'flex', alignItems:'center', paddingBottom:6, borderBottom:'1px solid hsl(var(--border) / 0.4)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0, overflowX:'auto', scrollbarWidth:'none', paddingRight:8 }}>
              <button type='button'
                style={{ height:28, padding:'0 12px', borderRadius:999, border:'1px solid hsl(var(--border))', background:'transparent', color:'hsl(var(--foreground))', fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}
                onClick={() => setTabMode('downloads')}>下载目录</button>
              <button type='button'
                style={{ height:28, padding:'0 12px', borderRadius:999,
                  border:'1.5px solid hsl(var(--primary))',
                  background:'hsl(var(--primary))',
                  color:'hsl(var(--primary-foreground))',
                  fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}
                onClick={handleFavResetDC}>收藏目录</button>
              {tabMode === 'favorites' && <>
                <span style={{ ...sepSt, padding:'0 2px', opacity: navStackDC.length > 0 ? 1 : 0 }}>|</span>
                {renderFavRow1DC()}
              </>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, paddingLeft:8, borderLeft:'1px solid hsl(var(--border) / 0.4)' }}>
              {tabMode === 'favorites' && <span style={{ fontSize:12, color:'hsl(var(--muted-foreground))', whiteSpace:'nowrap' }}>共 {favVideoCount} 个</span>}
              <div style={iBtn()}>
                <button type='button' style={{ all:'unset', display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', cursor:'pointer' }}
                  onClick={() => { setShowFavColPicker(v=>!v); setShowFavSortPicker(false); }}>
                  <MdGridView style={{ fontSize:15, color:'hsl(var(--muted-foreground))' }} />
                </button>
                {showFavColPicker && (
                  <>
                    <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setShowFavColPicker(false)} />
                    <div style={{ position:'absolute', right:0, top:32, zIndex:50, display:'flex', gap:4, background:'hsl(var(--card))', border:'1px solid hsl(var(--border))', borderRadius:10, padding:6, boxShadow:'0 4px 12px rgba(0,0,0,.15)' }}>
                      {FAV_COL_OPTIONS.map(n => (
                        <button key={n} type='button' onClick={() => { setFavColumns(n); setShowFavColPicker(false); }}
                          style={{ width:28, height:28, borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:500, background: favColumns===n ? 'hsl(var(--primary))' : 'transparent', color: favColumns===n ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <Button type='button' variant='ghost'
                className={`h-7 px-2 rounded shrink-0 gap-1 text-xs transition-colors ${
                  tabMode === 'browse' ? 'text-primary bg-primary/10 hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setTabMode(tabMode === 'browse' ? 'favorites' : 'browse')} title='文件浏览器'>
                <svg width='13' height='13' viewBox='0 0 16 16' fill='currentColor' style={{flexShrink:0}}><path d='M2 3a1 1 0 0 0-1 1v1h14V4a1 1 0 0 0-1-1H8.5l-1-1H2zm-1 4v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7H1z'/></svg>
                浏览
              </Button>
            </div>
          </div>
          {/* Row 2 */}
          <div style={{ display:'flex', alignItems:'center', marginTop:6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0, overflowX:'auto', scrollbarWidth:'none', paddingRight:8 }}>
              {tabMode === 'favorites' && renderFavRow2DC()}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, paddingLeft:8, borderLeft:'1px solid hsl(var(--border) / 0.4)' }}>
              <div style={iBtn()}>
                <button type='button' style={{ all:'unset', display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', cursor:'pointer' }}
                  onClick={() => setShowFavSearch(v=>!v)}>
                  <AiOutlineSearch style={{ fontSize:14, color:'hsl(var(--muted-foreground))' }} />
                </button>
              </div>
              <div style={iBtn(favSortKey !== 'newest')}>
                <button type='button' style={{ all:'unset', display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', cursor:'pointer' }}
                  onClick={() => { setShowFavSortPicker(v=>!v); setShowFavColPicker(false); }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
                    stroke={favSortKey !== 'newest' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                    strokeWidth="1.5"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
                </button>
                {showFavSortPicker && (
                  <>
                    <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setShowFavSortPicker(false)} />
                    <div style={{ position:'absolute', right:0, top:32, zIndex:50, background:'hsl(var(--card))', border:'1px solid hsl(var(--border))', borderRadius:10, padding:4, boxShadow:'0 4px 12px rgba(0,0,0,.15)', minWidth:130 }}>
                      {FAV_SORT_OPTIONS.map((opt, i) => {
                        const active = favSortKey === opt.key;
                        return (
                          <div key={opt.key}>
                            {i === 4 && <div style={{ height:'0.5px', background:'hsl(var(--border))', margin:'4px 8px' }} />}
                            <button type='button' onClick={() => { setFavSortKey(opt.key); setShowFavSortPicker(false); }}
                              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 10px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight: active ? 500 : 400, background: active ? 'hsl(var(--primary) / 0.08)' : 'transparent', color: active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))', textAlign:'left' as const }}>
                              {opt.label}{active && <span style={{ marginLeft:'auto', color:'hsl(var(--primary))' }}>✓</span>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div style={iBtn()}>
                <button type='button' style={{ all:'unset', display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', cursor:'pointer' }}
                  onClick={bumpFavRefresh}>
                  <VscRefresh style={{ fontSize:14, color:'hsl(var(--muted-foreground))' }} />
                </button>
              </div>
            </div>
          </div>
          {showFavSearch && (
            <div style={{ display:'flex', alignItems:'center', height:30, borderRadius:999, border:'1px solid hsl(var(--border))', background:'hsl(var(--muted) / 0.4)', padding:'0 10px', gap:6, marginTop:8 }}>
              <AiOutlineSearch style={{ fontSize:13, color:'hsl(var(--muted-foreground))', flexShrink:0 }} />
              <input type='text' autoFocus placeholder='搜索...' value={favSearch}
                onChange={e => setFavSearch(e.target.value)}
                style={{ background:'transparent', border:'none', outline:'none', fontSize:12, color:'hsl(var(--foreground))', flex:1, minWidth:0 }} />
            </div>
          )}
        </div>
      )}

      {/* ── Collapsible settings panel ── */}
      {expanded && (
        <>
          <div className='fixed inset-0 z-[200]' onClick={() => setExpanded(false)} />
          <div className='fixed top-12 right-2 z-[201] w-[min(400px,calc(100vw-16px))]'>
            <Card className='px-4 py-3 shadow-xl border border-border/50 max-h-[85vh] overflow-y-auto'>
              <div className='flex items-center gap-2 mb-2 pb-2 border-b border-border/40'>
                <div className='flex-1 min-w-0'><StorageBar /></div>
                <ThemeToggle />
                <SignOutRow />
              </div>
              <OptionsPanel url={url} />
              {!isFetching && videoMetadata && (
                <SearchResult videoMetadata={videoMetadata} onClose={handleCloseMetadata} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ── URL input ─────────────────────────────────────────────────
const UrlInput = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { hydrated, url, setUrl } = useDownloadFormStore(
    ({ hydrated, url, setUrl }) => ({ hydrated, url, setUrl }),
    shallow
  );
  return (
    <>
      <Input
        ref={inputRef}
        name='url'
        type='text'
        className='h-8 px-3 flex-auto rounded-full rounded-r-none border-none shadow-none bg-transparent'
        value={url}
        disabled={!hydrated}
        placeholder='https://...'
        onChange={(e) => setUrl(e.target.value || '')}
      />
      {hydrated && (url || !navigator?.clipboard) ? (
        <Button
          type='button' variant='ghost' size='icon'
          className='h-8 w-8 rounded-full rounded-l-none border-none text-muted-foreground'
          onClick={() => { setUrl(''); inputRef?.current?.focus?.(); }}
        >
          <IoClose className='w-4 h-4' />
        </Button>
      ) : (
        <Button
          type='button' variant='ghost' size='icon'
          className='h-8 w-8 rounded-full rounded-l-none border-none text-muted-foreground'
          onClick={async () => {
            if (!navigator?.clipboard) return;
            const t = await navigator.clipboard.readText();
            setUrl(t);
          }}
        >
          <MdContentPaste className='w-4 h-4' />
        </Button>
      )}
    </>
  );
};

// ── Submit button ─────────────────────────────────────────────
const SubmitButton = () => {
  const { hydrated, isFetching } = useDownloadFormStore(
    ({ hydrated, isFetching }) => ({ hydrated, isFetching }),
    shallow
  );
  return (
    <Button
      type='submit'
      size='sm'
      className='h-8 px-3 rounded-full shrink-0 gap-1'
      disabled={!hydrated || isFetching}
    >
      {isFetching
        ? <Loader2 className='h-4 w-4 animate-spin' />
        : <AiOutlineCloudDownload className='h-4 w-4' />}
      <span className='hidden sm:inline text-xs'>下载</span>
    </Button>
  );
};

// ── Options panel ─────────────────────────────────────────────
const OptionsPanel = memo(({ url }: { url: string }) => {
  return (
    <div className='flex flex-col gap-y-2'>
      <ResolutionAndCodecOptions />
      <CookieOption />
      <Card className='p-2 rounded-md bg-card-nested border-none'>
        <CardDescription className='text-warning-foreground text-sm mb-1'>
          以下选项对<b>直播</b>和<b>播放列表</b>下载无效。
        </CardDescription>
        <div className='flex flex-col gap-y-2'>
          <FileNameOption />
          <CutVideoOption />
          <EmbedSubtitlesOption />
          <EmbedChapterMarkersOption />
        </div>
      </Card>
      <LiveFromStartOption />
      <ProxyOption />
      <EnhancedOptionsSection />
      <PlaylistPanel url={url} />
      <ShareManager />
      <div className='pt-2 border-t border-border/40 text-center text-xs text-muted-foreground/60 space-y-1'>
        <p>Powered By <a className='hover:underline' href='https://bj803.top:13033/' rel='noopener noreferrer' target='_blank'>Benny</a></p>
        <YtDlpVersionInline />
      </div>
    </div>
  );
}, isPropsEquals);
OptionsPanel.displayName = 'OptionsPanel';

// ── Resolution ────────────────────────────────────────────────
const ResolutionAndCodecOptions = () => {
  const { hydrated, selectQuality, setSelectQuality } =
    useDownloadFormStore(
      ({ hydrated, selectQuality, setSelectQuality }) => ({
        hydrated, selectQuality, setSelectQuality
      }),
      shallow
    );
  const optionSuffix = selectQuality === 'audiomp3' ? 'MP3' : '画质';
  return (
    <div className='flex items-center gap-x-2 pl-1'>
      <span className='text-sm'>下载</span>
      <Select
        value={!hydrated ? 'best' : selectQuality}
        disabled={!hydrated}
        onValueChange={(q) => { if (hydrated) setSelectQuality(q as SelectQuality); }}
      >
          <SelectTrigger className='w-auto h-auto py-1 px-2 capitalize'>
            <SelectValue placeholder='选择画质' />
          </SelectTrigger>
          <SelectContent align='start'>
            <SelectGroup>
              <SelectItem value='best'>最佳视频</SelectItem>
              <SelectItem value='audiomp3'>仅音频</SelectItem>
              <SelectItem value='4320p'>4320p</SelectItem>
              <SelectItem value='2160p'>2160p（4K）</SelectItem>
              <SelectItem value='1440p'>1440p（2K）</SelectItem>
              <SelectItem value='1080p'>1080p（全高清）</SelectItem>
              <SelectItem value='720p'>720p（高清）</SelectItem>
              <SelectItem value='480p'>480p</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className='text-sm text-muted-foreground'>{optionSuffix}</span>
    </div>
  );
};

// ── Cookie ────────────────────────────────────────────────────
const CookieOption = () => {
  const { hydrated, usingCookies, setUsingCookies } = useDownloadFormStore(
    ({ hydrated, usingCookies, setUsingCookies }) => ({ hydrated, usingCookies, setUsingCookies }),
    shallow
  );
  const [openCookiesEditor, setOpenCookiesEditor] = useState(false);
  return (
    <div className='flex items-center'>
      <Label className='flex items-center pl-1 gap-x-1 cursor-pointer'>
        <Checkbox name='usingCookies' checked={usingCookies} disabled={!hydrated}
          onClick={() => setUsingCookies(!usingCookies)} />
        <span className='text-sm'>使用 Cookies</span>
      </Label>
      <AlertDialog open={openCookiesEditor} onOpenChange={setOpenCookiesEditor}>
        <AlertDialogTrigger disabled={!hydrated} type='button' className='flex items-center text-sm h-auto p-0.5'>
          <HiOutlinePencil />
        </AlertDialogTrigger>
        <AlertDialogContent className='min-w-[300px] max-w-3xl max-h-full bg-card overflow-auto outline-none'>
          <CookiesEditor open={openCookiesEditor} onClose={() => setOpenCookiesEditor(false)} />
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── Filename ──────────────────────────────────────────────────
const FileNameOption = () => {
  const { hydrated, enableOutputFilename, outputFilename, setOutputFilename, setEnableOutputFilename } =
    useDownloadFormStore(
      ({ hydrated, enableOutputFilename, outputFilename, setOutputFilename, setEnableOutputFilename }) => ({
        hydrated, enableOutputFilename, outputFilename, setOutputFilename, setEnableOutputFilename
      }),
      shallow
    );
  return (
    <div className='flex flex-col gap-y-1'>
      <Label className='flex items-center pl-1 gap-x-1 shrink-0 cursor-pointer'>
        <Checkbox name='enableOutputFilename' checked={enableOutputFilename} disabled={!hydrated}
          onClick={() => setEnableOutputFilename(!enableOutputFilename)} />
        <span className='text-sm'>输出文件名</span>
      </Label>
      <div className='flex items-center pl-6'>
        <Input
          className='h-auto w-full max-w-[220px] px-1 py-0.5 leading-[1]'
          name='outputFileName'
          value={!enableOutputFilename ? '' : outputFilename}
          disabled={!enableOutputFilename}
          placeholder='%(title).40s (%(id).5s)'
          onChange={(e) => setOutputFilename(e.target.value || '')}
        />

      </div>
    </div>
  );
};

// ── Cut video ─────────────────────────────────────────────────
const CutVideoOption = () => {
  const {
    hydrated, cutVideo, cutStartTime, cutEndTime, enableForceKeyFramesAtCuts,
    setCutVideo, setCutStartTime, setCutEndTime, setForceKeyFramesAtCuts
  } = useDownloadFormStore(
    ({ hydrated, cutVideo, cutStartTime, cutEndTime, setCutVideo, setCutStartTime, setCutEndTime,
       enableForceKeyFramesAtCuts, setForceKeyFramesAtCuts }) => ({
      hydrated, cutVideo, cutStartTime, cutEndTime, setCutVideo, setCutStartTime, setCutEndTime,
      enableForceKeyFramesAtCuts, setForceKeyFramesAtCuts
    }),
    shallow
  );
  return (
    <div className='flex flex-col gap-y-1'>
      <Label className='flex items-center pl-1 gap-x-1 shrink-0 cursor-pointer'>
        <Checkbox name='cutVideo' checked={cutVideo} disabled={!hydrated}
          onClick={() => setCutVideo(!cutVideo)} />
        <span className='text-sm'>剪切视频</span>
      </Label>
      <div className='flex items-center gap-x-1 pl-6'>
        <PatternFormat displayType='input' customInput={Input}
          className='h-auto max-w-[120px] px-1 py-0.5 leading-[1]'
          name='cutStartTime' value={!cutVideo ? '' : cutStartTime} disabled={!cutVideo}
          onChange={(e) => setCutStartTime(e.target.value || '')}
          format='##:##:##.##' placeholder='00:00:00.00' mask='_' />
        <span>~</span>
        <PatternFormat displayType='input' customInput={Input}
          className='h-auto max-w-[120px] px-1 py-0.5 leading-[1]'
          name='cutEndTime' value={!cutVideo ? '' : cutEndTime} disabled={!cutVideo}
          onChange={(e) => setCutEndTime(e.target.value || '')}
          format='##:##:##.##' placeholder='00:00:00.00' mask='_' />
      </div>
      {hydrated && cutVideo && (
        <div className='flex flex-col pl-5 gap-y-1 text-sm'>
          <div className='text-warning-foreground'>
            注意：剪切视频可能导致<b>音画不同步</b>。启用"强制关键帧"可改善同步，但<b>速度很慢</b>。
          </div>
          <Label className='inline-flex items-center pl-1 gap-x-1 shrink-0 cursor-pointer'>
            <Checkbox name='enableForceKeyFramesAtCuts' checked={enableForceKeyFramesAtCuts}
              disabled={!hydrated} onClick={() => setForceKeyFramesAtCuts(!enableForceKeyFramesAtCuts)} />
            <span>强制关键帧（慢）</span>
          </Label>
        </div>
      )}
    </div>
  );
};

// ── Subtitles ─────────────────────────────────────────────────
const EmbedSubtitlesOption = () => {
  const [open, setOpen] = useState(false);
  const { url, hydrated, embedSubs, subLangs, setEmbedSubs } = useDownloadFormStore(
    ({ url, hydrated, embedSubs, subLangs, setEmbedSubs }) => ({ url, hydrated, embedSubs, subLangs, setEmbedSubs }),
    shallow
  );
  return (
    <div>
      <Label className='flex items-center w-fit pl-1 gap-x-1 cursor-pointer'>
        <Checkbox name='embedSubs' checked={embedSubs} disabled={!hydrated}
          onClick={() => setEmbedSubs(!embedSubs)} />
        <span className='flex-auto shrink-0 text-sm'>嵌入字幕</span>
        {embedSubs && (
          <Button type='button' size='sm' variant='outline' className='w-auto h-auto px-2 gap-x-1'
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
            选择字幕语言
            {open ? <HiOutlineBarsArrowUp className='inline' /> : <HiOutlineBarsArrowDown className='inline' />}
          </Button>
        )}
      </Label>
      {embedSubs && (
        <div className='pl-6 flex-auto'>
          {open ? <SubtitleList url={url} /> : (
            <span className='text-sm p-0.5'>
              {Boolean(subLangs?.length) ? `已选：${subLangs.join(', ')}` : '已选全部字幕'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

function SubtitleList({ url }: { url: string }) {
  const { subLangs, setSubLangs } = useDownloadFormStore(
    ({ subLangs, setSubLangs }) => ({ subLangs, setSubLangs }),
    shallow
  );
  const { data: subtitles, isLoading, isValidating, error, mutate } = useSWR(
    `/api/info?url=${encodeURIComponent(url)}`,
    async () => {
      const getSubtitles = useDownloadFormStore.getState().getSubtitles;
      const subtitles = await getSubtitles();
      return Object.keys(subtitles)
        .map((lang) => ({ name: subtitles?.[lang]?.[0]?.name || lang, lang }))
        .filter((l) => Boolean(l.name));
    },
    { errorRetryCount: 1, revalidateOnFocus: false }
  );
  if (isLoading || isValidating) return (
    <div className='flex items-center py-1 gap-x-1 text-sm animate-pulse'>
      加载字幕中... <AiOutlineLoading3Quarters className='animate-spin' />
    </div>
  );
  if (!subtitles || subtitles.length === 0 || error) return (
    <div>
      <span className='text-zinc-400 text-sm'>该链接没有字幕。</span>
      <div><Button type='button' size='sm' variant='outline' className='w-auto h-auto px-2' onClick={() => mutate()}>重试</Button></div>
    </div>
  );
  return (
    <div className='mt-2'>
      <div className='text-zinc-400 text-sm'>不选则下载全部字幕。</div>
      <div className='flex justify-between my-1 gap-x-1'>
        <div className='space-x-1'>
          <Button type='button' size='sm' variant='outline' className='w-auto h-auto px-2' onClick={() => setSubLangs(subtitles.map((s) => s.lang))}>全选</Button>
          <Button type='button' size='sm' variant='outline' className='w-auto h-auto px-2' onClick={() => setSubLangs([])}>取消全选</Button>
        </div>
        <Button type='button' size='sm' variant='outline' className='w-auto h-auto px-2' onClick={() => mutate()}>重试</Button>
      </div>
      {subtitles.map(({ lang, name }) => (
        <div key={lang} className='flex my-1'>
          <Label className='flex items-center pl-1 gap-x-1 cursor-pointer'>
            <Checkbox name='subLangs' checked={subLangs.includes(lang)}
              onClick={() => {
                if (subLangs.includes(lang)) setSubLangs(subLangs.filter((l) => l !== lang));
                else setSubLangs([...subLangs, lang]);
              }} />
            <span className='text-sm'>{name}</span>
          </Label>
        </div>
      ))}
    </div>
  );
}

// ── Chapters ──────────────────────────────────────────────────
const EmbedChapterMarkersOption = () => {
  const { hydrated, embedChapters, setEmbedChapters } = useDownloadFormStore(
    ({ hydrated, embedChapters, setEmbedChapters }) => ({ hydrated, embedChapters, setEmbedChapters }),
    shallow
  );
  return (
    <Label className='inline-flex items-center w-fit pl-1 gap-x-1 cursor-pointer'>
      <Checkbox name='embedChapters' checked={embedChapters} disabled={!hydrated}
        onClick={() => setEmbedChapters(!embedChapters)} />
      <span className='text-sm'>嵌入章节标记</span>
    </Label>
  );
};

// ── Live from start ───────────────────────────────────────────
const LiveFromStartOption = () => {
  const { hydrated, enableLiveFromStart, setEnableLiveFromStart } = useDownloadFormStore(
    ({ hydrated, enableLiveFromStart, setEnableLiveFromStart }) => ({ hydrated, enableLiveFromStart, setEnableLiveFromStart }),
    shallow
  );
  return (
    <Label className='flex items-center pl-1 gap-x-1 cursor-pointer'>
      <Checkbox name='enableLiveFromStart' checked={enableLiveFromStart} disabled={!hydrated}
        onClick={() => setEnableLiveFromStart(!enableLiveFromStart)} />
      <span className='text-sm'>从头下载直播（仅支持 YouTube）</span>
    </Label>
  );
};

// ── Proxy ─────────────────────────────────────────────────────
const ProxyOption = () => {
  const { hydrated, enableProxy, proxyAddress, setEnableProxy, setProxyAddress } =
    useDownloadFormStore(
      ({ hydrated, enableProxy, proxyAddress, setEnableProxy, setProxyAddress }) => ({
        hydrated, enableProxy, proxyAddress, setEnableProxy, setProxyAddress
      }),
      shallow
    );
  return (
    <div className='flex items-center gap-x-1'>
      <Label className='inline-flex items-center pl-1 gap-x-1 shrink-0 cursor-pointer'>
        <Checkbox name='enableProxy' checked={enableProxy} disabled={!hydrated}
          onClick={() => setEnableProxy(!enableProxy)} />
        <span className='text-sm'>代理</span>
      </Label>
      <Input className='h-auto max-w-[300px] px-1 py-0.5 leading-[1]' name='proxyAddress'
        value={!enableProxy ? '' : proxyAddress} disabled={!enableProxy}
        placeholder='代理地址 HTTP/HTTPS/SOCKS'
        onChange={(e) => setProxyAddress(e.target.value || '')} />
    </div>
  );
};

// ── Enhanced options ──────────────────────────────────────────
const EnhancedOptionsSection = memo(() => {
  const {
    hydrated, embedThumbnail, embedMetadata, sponsorBlock, sponsorBlockCategories,
    setEmbedThumbnail, setEmbedMetadata, setSponsorBlock, setSponsorBlockCategories,
    audioOnly, setAudioOnly, splitChapters, setSplitChapters,
    concurrentFragments, setConcurrentFragments,
  } = useDownloadFormStore(
    ({ hydrated, embedThumbnail, embedMetadata, sponsorBlock, sponsorBlockCategories,
       setEmbedThumbnail, setEmbedMetadata, setSponsorBlock, setSponsorBlockCategories,
       audioOnly, setAudioOnly, splitChapters, setSplitChapters,
       concurrentFragments, setConcurrentFragments }) => ({
      hydrated, embedThumbnail, embedMetadata, sponsorBlock, sponsorBlockCategories,
      setEmbedThumbnail, setEmbedMetadata, setSponsorBlock, setSponsorBlockCategories,
      audioOnly, setAudioOnly, splitChapters, setSplitChapters,
      concurrentFragments, setConcurrentFragments,
    }),
    shallow
  );

  const CATEGORIES = [
    { key: 'sponsor', label: '赞助商' },
    { key: 'intro', label: '片头' },
    { key: 'outro', label: '片尾' },
    { key: 'selfpromo', label: '自我推广' },
    { key: 'interaction', label: '点赞提醒' },
    { key: 'music_offtopic', label: '非音乐段' },
  ];

  const selected = sponsorBlockCategories
    ? sponsorBlockCategories.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <Card className='p-2 rounded-md bg-card-nested border-none'>
      <CardDescription className='text-muted-foreground text-xs mb-2'>增强选项</CardDescription>
      <div className='flex flex-col gap-y-2'>
        <Label className='inline-flex items-center w-fit pl-1 gap-x-1 cursor-pointer'>
          <Checkbox name='embedThumbnail' checked={embedThumbnail} disabled={!hydrated}
            onClick={() => setEmbedThumbnail(!embedThumbnail)} />
          <span className='text-sm'>嵌入封面</span>
        </Label>
        <Label className='inline-flex items-center w-fit pl-1 gap-x-1 cursor-pointer'>
          <Checkbox name='embedMetadata' checked={embedMetadata} disabled={!hydrated}
            onClick={() => setEmbedMetadata(!embedMetadata)} />
          <span className='text-sm'>嵌入元数据</span>
        </Label>
        <Label className='inline-flex items-center w-fit pl-1 gap-x-1 cursor-pointer'>
          <Checkbox name='splitChapters' checked={splitChapters} disabled={!hydrated}
            onClick={() => setSplitChapters(!splitChapters)} />
          <span className='text-sm'>按章节分开保存</span>
        </Label>
        <div className='flex items-center gap-x-2 pl-1'>
          <span className='text-sm text-muted-foreground shrink-0'>并行下载</span>
          <div className='flex gap-1'>
            {[1,2,4,8].map(n => (
              <button key={n} type='button' disabled={!hydrated}
                onClick={() => setConcurrentFragments(n)}
                className={`w-8 h-6 text-xs rounded border transition-colors ${concurrentFragments === n ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className='flex flex-col gap-y-1'>
          <Label className='inline-flex items-center w-fit pl-1 gap-x-1 cursor-pointer'>
            <Checkbox name='sponsorBlock' checked={sponsorBlock} disabled={!hydrated}
              onClick={() => setSponsorBlock(!sponsorBlock)} />
            <span className='text-sm'>跳过广告</span>
          </Label>
          {sponsorBlock && (
            <div className='pl-6 flex flex-wrap gap-1 mt-0.5'>
              {CATEGORIES.map(({ key, label }) => {
                const active = selected.includes(key);
                return (
                  <button key={key} type='button'
                    onClick={() => {
                      const next = active
                        ? selected.filter((k: string) => k !== key)
                        : [...selected, key];
                      setSponsorBlockCategories(next.join(','));
                    }}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}, isPropsEquals);
EnhancedOptionsSection.displayName = 'EnhancedOptionsSection';

// ── Search result ─────────────────────────────────────────────
const SearchResult = ({ videoMetadata, onClose }: { videoMetadata: AllMetadata; onClose: () => void }) => (
  <section>
    <Divider className='mt-4 mb-6'>
      <Button type='button' variant='outline' size='sm'
        className='border-primary bg-transparent rounded-full opacity-80 gap-x-1'
        onClick={onClose}>
        <RiArrowUpSLine /> 关闭
      </Button>
    </Divider>
    {videoMetadata?.type === 'video' ? (
      <div className='mb-2'>
        <SearchedMetadataCard key={`${videoMetadata?.id}-video`} metadata={videoMetadata} />
        <VideoDownloadForm key={`${videoMetadata?.id}-video-dl`} metadata={videoMetadata} />
      </div>
    ) : videoMetadata?.type === 'playlist' ? (
      <div className='mb-2'>
        <SearchedMetadataCard key={`${videoMetadata?.id}-playlist`} metadata={videoMetadata as unknown as VideoMetadata} />
        <PlaylistDownloadForm key={`${videoMetadata?.id}-playlist-dl`} metadata={videoMetadata as PlaylistMetadata} />
      </div>
    ) : null}
  </section>
);

const SearchedMetadataCard = memo(({ metadata }: { metadata: VideoMetadata }) => {
  const [isImageError, setImageError] = useState(false);
  return (
    <Card className='flex flex-col bg-card-nested rounded-xl border-none overflow-hidden sm:flex-row-reverse sm:h-[220px] lg:flex-col lg:h-auto'>
      <div className='relative flex items-center basis-[40%] shrink-0 grow-0 min-w-[100px] max-h-[220px] overflow-hidden sm:max-w-[40%] lg:max-w-none'>
        {!isImageError && metadata.thumbnail ? (
          <figure className='w-full h-full'>
            <img className='w-full h-full object-cover' src={metadata.thumbnail} alt='thumbnail'
              onError={() => setImageError(true)} loading='lazy' />
          </figure>
        ) : (
          <div className='w-full h-full min-h-[100px] flex items-center justify-center text-4xl select-none bg-neutral-950/10'>
            <FcRemoveImage />
          </div>
        )}
        {Boolean(metadata?.duration) && (
          <div className='absolute right-1.5 bottom-1.5 text-xs text-white bg-black/80 py-0.5 px-1.5 rounded-md'>
            {numeral(metadata.duration).format('00:00:00')}
          </div>
        )}
      </div>
      <CardContent className='flex flex-col basis-[60%] grow shrink p-4 gap-y-1 overflow-hidden'>
        <CardTitle className='text-lg line-clamp-2' title={metadata.title}>{metadata.title}</CardTitle>
        <p className='line-clamp-3 grow-0 text-sm text-muted-foreground' title={metadata.description}>{metadata.description}</p>
        <CardDescription className='mt-auto line-clamp-2 break-all'>
          <a href={metadata.originalUrl} rel='noopener noreferrer' target='_blank'>
            <AiOutlineLink className='inline' />{metadata.originalUrl}
          </a>
        </CardDescription>
      </CardContent>
    </Card>
  );
}, isPropsEquals);
SearchedMetadataCard.displayName = 'SearchedMetadataCard';
