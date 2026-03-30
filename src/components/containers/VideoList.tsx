'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { VideoListBody } from '@/components/video-list/VideoListBody';
import { LocalVideoGrid } from '@/components/video-list/LocalVideoGrid';
import { GetVideoList } from '@/server/yt-dlp-web';
import { MdFolder, MdChevronRight, MdGridView } from 'react-icons/md';
import { useVideoListStore } from '@/store/videoList';
import { FileBrowser } from '@/components/containers/FileBrowser';
import { VscRefresh } from 'react-icons/vsc';
import { AiOutlineSearch } from 'react-icons/ai';
import { setNavPlaylist } from '@/components/modules/VideoPlayer';

const MAX_INTERVAL_TIME = 120 * 1000;
const MIN_INTERVAL_TIME = 3 * 1000;
const COLUMN_OPTIONS = [2, 3, 4, 5];
const FAVORITES_ROOT = '/additional-browse';

export type VideoListProps = Partial<GetVideoList>;
type TabMode = 'downloads' | 'favorites';
type Folder   = { name: string; path: string };
type LocalFile = { path: string; title?: string | null; name: string; size?: number; mtime?: string };
type SortKey   = 'newest' | 'oldest' | 'name_az' | 'name_za' | 'size_asc' | 'size_desc';

const DEFAULT_SORT: SortKey = 'newest';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest',    label: '最新优先' },
  { key: 'oldest',   label: '最旧优先' },
  { key: 'name_az',  label: '名称 A→Z' },
  { key: 'name_za',  label: '名称 Z→A' },
  { key: 'size_asc', label: '大小 ↑'   },
  { key: 'size_desc',label: '大小 ↓'   },
];

// ── Style tokens ──────────────────────────────────────────────
const tabActive:    React.CSSProperties = { height:28, padding:'0 12px', borderRadius:999, border:'1.5px solid hsl(var(--primary))', background:'hsl(var(--primary))', color:'hsl(var(--primary-foreground))', fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 };
const tabInactive:  React.CSSProperties = { height:28, padding:'0 12px', borderRadius:999, border:'1px solid hsl(var(--border))', background:'transparent', color:'hsl(var(--foreground))', fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 };
const pillActive:   React.CSSProperties = { height:28, padding:'0 10px', borderRadius:999, border:'1.5px solid hsl(var(--primary))', background:'hsl(var(--primary) / 0.12)', color:'hsl(var(--primary))', fontSize:12, fontWeight:500, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 };
const pillInactive: React.CSSProperties = { height:28, padding:'0 10px', borderRadius:999, border:'1px solid hsl(var(--border))', background:'hsl(var(--muted) / 0.5)', color:'hsl(var(--muted-foreground))', fontSize:12, fontWeight:500, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 };
// Siblings: same as inactive but more faded
const pillSibling:  React.CSSProperties = { ...pillInactive, opacity: 0.55 };
const sepStyle:     React.CSSProperties = { fontSize:13, color:'hsl(var(--muted-foreground))', flexShrink:0, userSelect:'none', padding:'0 1px' };
const dotStyle:     React.CSSProperties = { fontSize:16, color:'hsl(var(--muted-foreground))', flexShrink:0, userSelect:'none', padding:'0 3px', lineHeight:1 };

function iconBtn(active = false): React.CSSProperties {
  return { width:28, height:28, borderRadius:6, border: active ? '1.5px solid hsl(var(--primary))' : '1px solid hsl(var(--border))', background: active ? 'hsl(var(--primary) / 0.1)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', position:'relative' };
}

// ── Nav level: tracks one layer of the folder tree ───────────
type NavLevel = {
  selected: Folder;          // the folder chosen at this level
  siblings: Folder[];        // all folders at this level (including selected)
  children: Folder[];        // subfolders of selected
};

export function VideoList() {
  const refreshIntervalTimeRef = useRef(MIN_INTERVAL_TIME);
  // tabMode lives in shared store so DownloadContainer can read/write it too
  const { tabMode, setTabMode,
          favColumns, setFavColumns,
          favSortKey, setFavSortKey,
          favSearch, setFavSearch,
          favVideoCount, setFavVideoCount,
          favRefreshKey, bumpFavRefresh,
          favBrowsePath } = useVideoListStore();
  const [columns, setColumns]   = useState(4);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showSortPicker,   setShowSortPicker]   = useState(false);
  const [sortKey, setSortKey]   = useState<SortKey>(DEFAULT_SORT);
  const [dlSearch,  setDlSearch]  = useState('');
  const [showFavSearch, setShowFavSearch] = useState(false);

  // Root-level folders
  const [rootFolders, setRootFolders] = useState<Folder[]>([]);
  // Stack of nav levels — empty = at root
  const [navStack, setNavStack] = useState<NavLevel[]>([]);

  // Favorites files (raw, from API)
  const [allFavFiles,  setAllFavFiles]  = useState<LocalFile[]>([]);
  const [favLoading,   setFavLoading]   = useState(false);
  // Key to force LocalVideoGrid remount on refresh
  const [favKey, setFavKey] = useState(0);

  const navRowRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  // browsePath comes from store (set by DownloadContainer nav)
  const browsePath = favBrowsePath;

  // ── Fetch helpers ─────────────────────────────────────────
  const fetchSubdirs = useCallback(async (path: string): Promise<Folder[]> => {
    try {
      const r = await fetch(`/api/local-files?path=${encodeURIComponent(path)}&listDirs=true`);
      const d = await r.json();
      return d.subdirs || [];
    } catch { return []; }
  }, []);

  useEffect(() => {
    if (tabMode !== 'favorites') return;
    fetchSubdirs(FAVORITES_ROOT).then(setRootFolders);
  }, [tabMode, fetchSubdirs]);

  // Overflow detection
  useEffect(() => {
    const el = navRowRef.current;
    if (!el) { setHasOverflow(false); return; }
    const check = () => setHasOverflow(Math.round(el.scrollWidth) > Math.round(el.clientWidth));
    const t = setTimeout(check, 30);
    const ro = new ResizeObserver(() => { clearTimeout(t); setTimeout(check, 30); });
    ro.observe(el);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [navStack, rootFolders, tabMode]);

  // ── SWR for downloads ────────────────────────────────────
  const { data, isValidating, isLoading, mutate } = useSWR<GetVideoList>(
    '/api/list',
    async () => {
      const d = await axios.get<GetVideoList>('/api/list').then(r => r.data);
      if (!d) return { orders: [], items: {} };
      let next = Math.min(Math.max(MIN_INTERVAL_TIME, refreshIntervalTimeRef.current * 2), MAX_INTERVAL_TIME);
      for (const v of Object.values(d.items)) {
        if (['downloading','recording','merging','standby'].includes(v.status)) { next = 3000; break; }
      }
      refreshIntervalTimeRef.current = next;
      return d;
    },
    { refreshInterval: refreshIntervalTimeRef.current, errorRetryCount: 1 },
  );

  // Inject nav playlist
  useEffect(() => {
    if (tabMode === 'downloads' && data?.orders && data?.items) {
      setNavPlaylist({ uuids: data.orders, items: data.items as any });
    } else if (tabMode !== 'favorites') {
      setNavPlaylist(null);
    }
  }, [data, tabMode]);

  // Called by LocalVideoGrid when files load
  const handleFavFilesLoaded = useCallback((files: LocalFile[]) => {
    setFavLoading(false);
    setAllFavFiles(files);
    setFavVideoCount(files.length);
    if (!files.length) { setNavPlaylist(null); return; }
    const uuids = files.map(f => f.path);
    const items: Record<string, any> = {};
    files.forEach(f => {
      items[f.path] = { uuid:f.path, title:f.title || f.name.replace(/\.[^/.]+$/,''), url:`/api/local-stream?path=${encodeURIComponent(f.path)}`, type:'video' };
    });
    setNavPlaylist({ uuids, items });
  }, []);

  useEffect(() => { if (tabMode !== 'favorites') setNavPlaylist(null); }, [tabMode]);

  // ── Sorted + filtered downloads ───────────────────────────
  const sortedDlOrder = useMemo(() => {
    if (!data?.orders || !data?.items) return data?.orders ?? [];
    const items = data.items;
    return [...data.orders].sort((a, b) => {
      const va = items[a], vb = items[b];
      if (!va || !vb) return 0;
      switch (sortKey) {
        case 'newest':    return (vb.createdAt??0) - (va.createdAt??0);
        case 'oldest':    return (va.createdAt??0) - (vb.createdAt??0);
        case 'name_az':   return (va.title||va.file?.name||'').localeCompare(vb.title||vb.file?.name||'');
        case 'name_za':   return (vb.title||vb.file?.name||'').localeCompare(va.title||va.file?.name||'');
        case 'size_asc':  return (va.file?.size??0) - (vb.file?.size??0);
        case 'size_desc': return (vb.file?.size??0) - (va.file?.size??0);
        default: return 0;
      }
    });
  }, [data, sortKey]);

  const dlFilteredOrder = useMemo(() => {
    if (!dlSearch.trim()) return sortedDlOrder;
    const q = dlSearch.trim().toLowerCase();
    return sortedDlOrder.filter(uuid => {
      const item = data?.items[uuid];
      return item?.title?.toLowerCase().includes(q) || item?.file?.name?.toLowerCase().includes(q);
    });
  }, [sortedDlOrder, dlSearch, data]);

  // ── Sorted + filtered favorites ───────────────────────────
  const sortedFavPaths = useMemo(() => {
    const files = [...allFavFiles].sort((a, b) => {
      switch (favSortKey) {
        case 'newest':    return new Date(b.mtime||0).getTime() - new Date(a.mtime||0).getTime();
        case 'oldest':    return new Date(a.mtime||0).getTime() - new Date(b.mtime||0).getTime();
        case 'name_az':   return (a.title||a.name).localeCompare(b.title||b.name);
        case 'name_za':   return (b.title||b.name).localeCompare(a.title||a.name);
        case 'size_asc':  return (a.size??0) - (b.size??0);
        case 'size_desc': return (b.size??0) - (a.size??0);
        default: return 0;
      }
    });
    const q = favSearch.trim().toLowerCase();
    const filtered = q ? files.filter(f => f.name.toLowerCase().includes(q) || (f.title||'').toLowerCase().includes(q)) : files;
    return filtered.map(f => f.path);
  }, [allFavFiles, favSortKey, favSearch]);

  const videoCount = tabMode === 'downloads' ? (dlFilteredOrder?.length ?? 0) : favVideoCount;
  const sortActive  = sortKey !== DEFAULT_SORT;

  // ── Refresh ───────────────────────────────────────────────
  const handleRefresh = () => {
    if (tabMode === 'downloads') {
      mutate();
    } else {
      // Remount LocalVideoGrid by bumping key, reset state
      setFavLoading(true);
      setAllFavFiles([]);
      setNavPlaylist(null);
      setFavKey(k => k + 1);
    }
  };

  // ── Folder navigation ─────────────────────────────────────
  // Click a root folder
  const handleRootClick = async (folder: Folder) => {
    const children = await fetchSubdirs(folder.path);
    setNavStack([{ selected: folder, siblings: rootFolders, children }]);
  };

  // Click a child of the current deepest level
  const handleChildClick = async (folder: Folder) => {
    const top = navStack[navStack.length - 1];
    const children = await fetchSubdirs(folder.path);
    setNavStack(prev => [...prev, { selected: folder, siblings: top.children, children }]);
  };

  // Click a sibling at the current level (same depth as selected)
  const handleSiblingClick = async (folder: Folder, levelIdx: number) => {
    const children = await fetchSubdirs(folder.path);
    const newStack = navStack.slice(0, levelIdx);
    newStack.push({ selected: folder, siblings: navStack[levelIdx].siblings, children });
    setNavStack(newStack);
  };

  // Click an ancestor (go back up)
  const handleAncestorClick = async (folder: Folder, levelIdx: number) => {
    const siblings = navStack[levelIdx].siblings;
    const children = await fetchSubdirs(folder.path);
    setNavStack(navStack.slice(0, levelIdx + 1).map((l, i) =>
      i === levelIdx ? { selected: folder, siblings, children } : l
    ));
  };

  const handleFavReset = () => {
    setTabMode('favorites');
    setNavStack([]);
  };

  // Go back one level in favorites nav (used by row2 green pill)
  const handleGoBack = () => {
    if (navStack.length <= 1) { handleFavReset(); return; }
    const parentIdx = navStack.length - 2;
    handleAncestorClick(navStack[parentIdx].selected, parentIdx);
  };

  // ── Row 1: tabs + chain(n-1 levels) + root siblings when chain≤2 ────────
  const renderRow1Pills = () => {
    const n = navStack.length;
    if (n === 0) {
      return rootFolders.map(f => (
        <button key={f.path} type='button' style={pillInactive} onClick={() => handleRootClick(f)}>
          <FolderIcon color='hsl(var(--muted-foreground))' />{f.name}
        </button>
      ));
    }
    // Chain = navStack[0..max(0,n-2)] — always at least navStack[0]
    const chainEnd = Math.max(1, n - 1);
    const chain = navStack.slice(0, chainEnd);
    const showSiblings = chain.length <= 2;
    const rootSiblings = rootFolders.filter(f => f.path !== navStack[0].selected.path);
    return (
      <>
        {chain.map((level, i) => (
          <span key={level.selected.path} style={{ display:'inline-flex', alignItems:'center', gap:5, flexShrink:0 }}>
            {i > 0 && <span style={sepStyle}>/</span>}
            <button type='button' style={pillActive}
              onClick={() => handleAncestorClick(level.selected, i)}>
              <FolderIcon color='hsl(var(--primary))' />{level.selected.name}
            </button>
          </span>
        ))}
        {showSiblings && rootSiblings.length > 0 && (
          <>
            <span style={dotStyle}>·</span>
            {rootSiblings.map(f => (
              <button key={f.path} type='button' style={pillSibling}
                onClick={() => handleRootClick(f)}>
                <FolderIcon color='hsl(var(--muted-foreground))' />{f.name}
              </button>
            ))}
          </>
        )}
      </>
    );
  };

  // ── Row 2: deepest selected(green) + children(gray) + · + siblings(gray) ──
  const renderRow2Pills = () => {
    const n = navStack.length;
    if (n === 0) return null;
    if (n === 1) {
      // n=1: just children, all gray, no green pill
      return navStack[0].children.map(c => (
        <button key={c.path} type='button' style={pillInactive} onClick={() => handleChildClick(c)}>
          <FolderIcon color='hsl(var(--muted-foreground))' />{c.name}
        </button>
      ));
    }
    // n≥2: deepest selected (green, go-back) + children (gray) + · + siblings (gray)
    const deepest = navStack[n - 1];
    const siblings = deepest.siblings.filter(s => s.path !== deepest.selected.path);
    return (
      <>
        <button type='button' style={pillActive} onClick={handleGoBack} title='返回上一层'>
          <FolderIcon color='hsl(var(--primary))' />{deepest.selected.name}
        </button>
        {deepest.children.map(c => (
          <button key={c.path} type='button' style={pillInactive} onClick={() => handleChildClick(c)}>
            <FolderIcon color='hsl(var(--muted-foreground))' />{c.name}
          </button>
        ))}
        {siblings.length > 0 && (
          <>
            <span style={dotStyle}>·</span>
            {siblings.map(s => (
              <button key={s.path} type='button' style={pillSibling}
                onClick={() => handleSiblingClick(s, n - 1)}>
                <FolderIcon color='hsl(var(--muted-foreground))' />{s.name}
              </button>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <Card className='relative p-3 overflow-hidden border-none shadow-md'>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* ── Downloads mode: nav tabs + toolbar + list ── */}
      {tabMode === 'downloads' && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, overflowX:'auto', scrollbarWidth:'none' }}>
            <button type='button' style={tabActive} onClick={() => setTabMode('downloads')}>下载目录</button>
            <button type='button' style={tabInactive} onClick={() => setTabMode('favorites')}>收藏目录</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:13, fontWeight:500, color:'hsl(var(--foreground))', whiteSpace:'nowrap', flexShrink:0 }}>
              共 {videoCount} 个视频
            </span>
            <div style={{ flex:1, minWidth:0, height:32, borderRadius:999, border:'1px solid hsl(var(--border))', background:'hsl(var(--muted) / 0.4)', display:'flex', alignItems:'center', padding:'0 10px', gap:6 }}>
              <AiOutlineSearch style={{ fontSize:14, color:'hsl(var(--muted-foreground))', flexShrink:0 }} />
              <input type='text' value={dlSearch} onChange={e => setDlSearch(e.target.value)} placeholder=''
                style={{ background:'transparent', border:'none', outline:'none', fontSize:12, color:'hsl(var(--foreground))', flex:1, minWidth:0 }} />
              {dlSearch && (
                <button type='button' onClick={() => setDlSearch('')}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:'hsl(var(--muted-foreground))', fontSize:16, lineHeight:1, flexShrink:0 }}>×</button>
              )}
            </div>
            {/* Columns */}
            <div style={iconBtn()}>
              <button type='button' style={{ all:'unset', display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', cursor:'pointer' }}
                onClick={() => { setShowColumnPicker(v=>!v); setShowSortPicker(false); }}>
                <MdGridView style={{ fontSize:15, color:'hsl(var(--muted-foreground))' }} />
              </button>
              {showColumnPicker && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setShowColumnPicker(false)} />
                  <div style={{ position:'absolute', right:0, top:32, zIndex:50, display:'flex', gap:4, background:'hsl(var(--card))', border:'1px solid hsl(var(--border))', borderRadius:10, padding:6, boxShadow:'0 4px 12px rgba(0,0,0,.15)' }}>
                    {COLUMN_OPTIONS.map(n => (
                      <button key={n} type='button' onClick={() => { setColumns(n); setShowColumnPicker(false); }}
                        style={{ width:28, height:28, borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:500, background: columns===n ? 'hsl(var(--primary))' : 'transparent', color: columns===n ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Sort */}
            <div style={iconBtn(sortActive)}>
              <button type='button' style={{ all:'unset', display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', cursor:'pointer' }}
                onClick={() => { setShowSortPicker(v=>!v); setShowColumnPicker(false); }}>
                <SortIcon color={sortActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
              </button>
              {showSortPicker && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setShowSortPicker(false)} />
                  <div style={{ position:'absolute', right:0, top:32, zIndex:50, background:'hsl(var(--card))', border:'1px solid hsl(var(--border))', borderRadius:10, padding:4, boxShadow:'0 4px 12px rgba(0,0,0,.15)', minWidth:130 }}>
                    {SORT_OPTIONS.map((opt, i) => {
                      const active = sortKey === opt.key;
                      return (
                        <div key={opt.key}>
                          {i === 4 && <div style={{ height:'0.5px', background:'hsl(var(--border))', margin:'4px 8px' }} />}
                          <button type='button' onClick={() => { setSortKey(opt.key); setShowSortPicker(false); }}
                            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 10px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight: active ? 500 : 400, background: active ? 'hsl(var(--primary) / 0.08)' : 'transparent', color: active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))', textAlign:'left' as const }}>
                            {opt.label}
                            {active && <span style={{ marginLeft:'auto', color:'hsl(var(--primary))' }}>✓</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {/* Refresh */}
            <div style={iconBtn()}>
              <button type='button' style={{ all:'unset', display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', cursor:'pointer' }}
                onClick={handleRefresh}>
                <VscRefresh style={{ fontSize:14, color:'hsl(var(--muted-foreground))', animation: isValidating ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
          </div>
          <VideoListBody orders={dlFilteredOrder} items={data?.items} isLoading={isLoading} columns={columns} />
        </>
      )}

      {/* ── Browse mode ── */}
      {tabMode === 'browse' && (
        <FileBrowser />
      )}

      {/* ── Favorites mode: nav is in DownloadContainer sticky header, only grid here ── */}
      {tabMode === 'favorites' && !false && (
        <LocalVideoGrid
          key={`${browsePath}-${favKey}-${favRefreshKey}`}
          browsePath={browsePath}
          columns={favColumns}
          columnOptions={COLUMN_OPTIONS}
          onColumnChange={setColumns}
          showColumnPicker={showColumnPicker}
          onToggleColumnPicker={() => setShowColumnPicker(v=>!v)}
          onCloseColumnPicker={() => setShowColumnPicker(false)}
          onFilesLoaded={handleFavFilesLoaded}
          sortedPaths={sortedFavPaths}
        />
      )}
    </Card>
  );
}

// ── Icons ─────────────────────────────────────────────────────
function FolderIcon({ color }: { color: string }) {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill={color} style={{ flexShrink:0 }}><path d="M2 4a1 1 0 011-1h4l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>;
}
function SortIcon({ color }: { color: string }) {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5"><path d="M2 4h12M4 8h8M6 12h4"/></svg>;
}
