'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { VscRefresh } from 'react-icons/vsc';
import { AiOutlineSearch } from 'react-icons/ai';
import { MdCreateNewFolder, MdDriveFileMove, MdEdit, MdDelete, MdClose, MdCheck } from 'react-icons/md';
import { IoFolderOpenOutline } from 'react-icons/io5';

// ── Types ──────────────────────────────────────────────────────────────────
type FBEntry = {
  name: string;
  path: string;       // absolute path on server
  isDir: boolean;
  isVideo: boolean;
  size: number;
  mtime: string;
};

type NavLevel = {
  selected: { name: string; path: string };
  siblings: { name: string; path: string }[];
  children: { name: string; path: string }[];
};

// ── Style tokens (match DownloadContainer / favorites toolbar) ─────────────
const pillA: React.CSSProperties = {
  height: 26, padding: '0 10px', borderRadius: 999,
  border: '1.5px solid hsl(var(--primary))',
  background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
  whiteSpace: 'nowrap', flexShrink: 0,
};
const pillI: React.CSSProperties = {
  height: 26, padding: '0 10px', borderRadius: 999,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--muted) / 0.5)', color: 'hsl(var(--muted-foreground))',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
  whiteSpace: 'nowrap', flexShrink: 0,
};
const pillS: React.CSSProperties = { ...pillI, opacity: 0.5 };
const sepSt: React.CSSProperties = {
  fontSize: 13, color: 'hsl(var(--muted-foreground))',
  flexShrink: 0, userSelect: 'none', padding: '0 1px',
};
const dotSt: React.CSSProperties = {
  fontSize: 16, color: 'hsl(var(--muted-foreground))',
  flexShrink: 0, userSelect: 'none', padding: '0 3px', lineHeight: 1,
};
const iBtn = (active = false): React.CSSProperties => ({
  width: 28, height: 28, borderRadius: 6,
  border: active ? '1.5px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
  background: active ? 'hsl(var(--primary) / 0.1)' : 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, cursor: 'pointer', position: 'relative',
});
const actionBtn = (danger = false, disabled = false): React.CSSProperties => ({
  height: 28, padding: '0 10px', borderRadius: 6,
  border: `1px solid ${danger ? 'hsl(var(--destructive) / 0.4)' : 'hsl(var(--border))'}`,
  background: 'transparent',
  color: disabled
    ? 'hsl(var(--muted-foreground) / 0.35)'
    : danger ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))',
  fontSize: 12, fontWeight: 500,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
  whiteSpace: 'nowrap', flexShrink: 0,
  opacity: disabled ? 0.5 : 1,
});

// ── Folder icon ────────────────────────────────────────────────────────────
function FolderIcon({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{ flexShrink: 0 }}>
      <path d="M2 4a1 1 0 011-1h4l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
    </svg>
  );
}

function FileIcon({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{ flexShrink: 0 }}>
      <path d="M4 1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5.5L9.5 1H4zm5 1.5L12.5 5H9.5V2.5z"/>
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
const FAVORITES_ROOT = '/additional-browse';
function fmtSize(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

// ── Main FileBrowser component ─────────────────────────────────────────────
export function FileBrowser({ onClose }: { onClose: () => void }) {
  // ── Nav state (same logic as DownloadContainer favorites) ──────────────
  const [rootFolders, setRootFolders] = useState<{ name: string; path: string }[]>([]);
  const [navStack, setNavStack] = useState<NavLevel[]>([]);

  // ── File listing state ─────────────────────────────────────────────────
  const [entries, setEntries] = useState<FBEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sortKey, setSortKey] = useState<'name' | 'size' | 'mtime'>('name');
  const [showSort, setShowSort] = useState(false);
  const refreshRef = useRef(0);

  // ── Selection state ────────────────────────────────────────────────────
  const [selected, setSelected] = useState<FBEntry | null>(null);

  // ── Action states ──────────────────────────────────────────────────────
  const [renameMode, setRenameMode] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [mkdirMode, setMkdirMode] = useState(false);
  const [mkdirVal, setMkdirVal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── Move dialog ─────────────────────────────────────────────────────────
  const [showMove, setShowMove] = useState(false);
  const [moveDest, setMoveDest] = useState('');
  const [moveDirs, setMoveDirs] = useState<{ name: string; path: string }[]>([]);

  // ── Current path ────────────────────────────────────────────────────────
  const curPath = navStack.length > 0
    ? navStack[navStack.length - 1].selected.path
    : FAVORITES_ROOT;

  // ── Fetch subdirs for nav ──────────────────────────────────────────────
  const fetchSubdirs = useCallback(async (path: string) => {
    try {
      const r = await fetch(`/api/local-files?path=${encodeURIComponent(path)}&listDirs=true`);
      const d = await r.json();
      return (d.subdirs || []) as { name: string; path: string }[];
    } catch { return []; }
  }, []);

  // ── Fetch file listing ─────────────────────────────────────────────────
  const fetchEntries = useCallback(async (path: string) => {
    setLoading(true);
    setSelected(null);
    try {
      const r = await fetch(`/api/local-files?path=${encodeURIComponent(path)}`);
      const d = await r.json();
      const files: FBEntry[] = (d.files || []).map((f: FBEntry) => f);
      const dirs: FBEntry[] = (d.subdirs || []).map((sd: { name: string; path: string }) => ({
        name: sd.name, path: sd.path, isDir: true,
        isVideo: false, size: 0, mtime: '',
      }));
      setEntries([...dirs, ...files]);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);

  // ── Init: load root ────────────────────────────────────────────────────
  useEffect(() => {
    fetchSubdirs(FAVORITES_ROOT).then(setRootFolders);
    fetchEntries(FAVORITES_ROOT);
  }, [fetchSubdirs, fetchEntries]);

  // ── Reload when path changes ───────────────────────────────────────────
  useEffect(() => { fetchEntries(curPath); }, [curPath, fetchEntries]);

  // ── Nav handlers ──────────────────────────────────────────────────────
  const handleRootClick = async (f: { name: string; path: string }) => {
    const children = await fetchSubdirs(f.path);
    setNavStack([{ selected: f, siblings: rootFolders, children }]);
  };
  const handleChildClick = async (f: { name: string; path: string }) => {
    const top = navStack[navStack.length - 1];
    const children = await fetchSubdirs(f.path);
    setNavStack(prev => [...prev, { selected: f, siblings: top.children, children }]);
  };
  const handleSiblingClick = async (f: { name: string; path: string }, idx: number) => {
    const children = await fetchSubdirs(f.path);
    const stack = navStack.slice(0, idx);
    stack.push({ selected: f, siblings: navStack[idx].siblings, children });
    setNavStack(stack);
  };
  const handleAncestorClick = async (f: { name: string; path: string }, idx: number) => {
    const children = await fetchSubdirs(f.path);
    setNavStack(navStack.slice(0, idx + 1).map((l, i) =>
      i === idx ? { selected: f, siblings: l.siblings, children } : l
    ));
  };
  const handleGoBack = () => {
    if (navStack.length <= 1) { setNavStack([]); return; }
    const pi = navStack.length - 2;
    handleAncestorClick(navStack[pi].selected, pi);
  };
  const handleReset = () => setNavStack([]);

  // ── Row1 render (same logic as DownloadContainer) ─────────────────────
  const renderRow1 = () => {
    const n = navStack.length;
    const chainEnd = Math.max(1, n - 1);
    const chain = navStack.slice(0, chainEnd);
    const selectedRootPath = chain.length > 0 ? chain[0].selected.path : null;

    if (chain.length >= 3) {
      return (<>
        {chain.map((level, i) => (
          <span key={level.selected.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {i > 0 && <span style={sepSt}>/</span>}
            <button type="button" style={pillA} onClick={() => handleAncestorClick(level.selected, i)}>
              <FolderIcon color="hsl(var(--primary))" />{level.selected.name}
            </button>
          </span>
        ))}
      </>);
    }

    return (<>
      {rootFolders.map(f => {
        if (f.path === selectedRootPath) {
          return (
            <span key={f.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              {chain.map((level, i) => (
                <span key={level.selected.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  {i > 0 && <span style={sepSt}>/</span>}
                  <button type="button" style={pillA} onClick={() => handleAncestorClick(level.selected, i)}>
                    <FolderIcon color="hsl(var(--primary))" />{level.selected.name}
                  </button>
                </span>
              ))}
            </span>
          );
        }
        return (
          <button key={f.path} type="button"
            style={{ ...pillI, opacity: selectedRootPath ? 0.5 : 1 }}
            onClick={() => handleRootClick(f)}>
            <FolderIcon color="hsl(var(--muted-foreground))" />{f.name}
          </button>
        );
      })}
    </>);
  };

  // ── Row2 render ────────────────────────────────────────────────────────
  const renderRow2 = () => {
    const n = navStack.length;
    if (n === 0) return null;
    if (n === 1) return navStack[0].children.map(c => (
      <button key={c.path} type="button" style={pillI} onClick={() => handleChildClick(c)}>
        <FolderIcon color="hsl(var(--muted-foreground))" />{c.name}
      </button>
    ));
    const deepest = navStack[n - 1];
    const siblings = deepest.siblings.filter(s => s.path !== deepest.selected.path);
    return (<>
      <button type="button" style={pillA} onClick={handleGoBack} title="返回上一层">
        <FolderIcon color="hsl(var(--primary))" />{deepest.selected.name}
      </button>
      {deepest.children.map(c => (
        <button key={c.path} type="button" style={pillI} onClick={() => handleChildClick(c)}>
          <FolderIcon color="hsl(var(--muted-foreground))" />{c.name}
        </button>
      ))}
      {siblings.length > 0 && (<>
        <span style={dotSt}>·</span>
        {siblings.map(sib => (
          <button key={sib.path} type="button" style={pillS}
            onClick={() => handleSiblingClick(sib, n - 1)}>
            <FolderIcon color="hsl(var(--muted-foreground))" />{sib.name}
          </button>
        ))}
      </>)}
    </>);
  };

  // ── File operations ────────────────────────────────────────────────────
  const doRename = async () => {
    if (!selected || !renameVal.trim()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/move-local-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcPath: selected.path, destDir: curPath, newName: renameVal.trim() }),
      });
      const d = await r.json();
      if (d.success || d.ok) { setRenameMode(false); fetchEntries(curPath); }
      else alert(d.error || '改名失败');
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/local-delete?path=${encodeURIComponent(selected.path)}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success || d.ok) { setDeleteConfirm(false); setSelected(null); fetchEntries(curPath); }
      else alert(d.error || '删除失败');
    } finally { setBusy(false); }
  };

  const doMkdir = async () => {
    if (!mkdirVal.trim()) return;
    setBusy(true);
    try {
      const newPath = `${curPath}/${mkdirVal.trim()}`;
      const r = await fetch('/api/move-local-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mkdir', path: newPath }),
      });
      // Fallback: try local-files mkdir
      if (!r.ok) {
        const r2 = await fetch(`/api/local-files`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mkdir', path: newPath }),
        });
        const d2 = await r2.json();
        if (d2.success || d2.ok) { setMkdirMode(false); setMkdirVal(''); fetchEntries(curPath); return; }
      }
      const d = await r.json();
      if (d.success || d.ok) { setMkdirMode(false); setMkdirVal(''); fetchEntries(curPath); }
      else alert(d.error || '新建失败');
    } finally { setBusy(false); }
  };

  const doMove = async (dest: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await fetch('/api/move-local-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcPath: selected.path, destDir: dest }),
      });
      const d = await r.json();
      if (d.success || d.ok) { setShowMove(false); setSelected(null); fetchEntries(curPath); }
      else alert(d.error || '移动失败');
    } finally { setBusy(false); }
  };

  // ── Sorted + filtered entries ──────────────────────────────────────────
  const visibleEntries = [...entries]
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'size') return (b.size || 0) - (a.size || 0);
      if (sortKey === 'mtime') return (b.mtime || '').localeCompare(a.mtime || '');
      return 0;
    });

  const hasSelected = !!selected;
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 0, padding: '7px 12px', minHeight: 38,
  };
  const scrollRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none', paddingRight: 8,
  };
  const rightStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    flexShrink: 0, paddingLeft: 8,
    borderLeft: '1px solid hsl(var(--border) / 0.4)',
    marginLeft: 6,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'hsl(var(--card))', borderRadius: 12, border: '1px solid hsl(var(--border))', overflow: 'hidden' }}>

      {/* ── Row 1: nav pills + count + close ── */}
      <div style={{ ...rowStyle, borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
        <div style={scrollRowStyle}>
          {/* 浏览 label + reset */}
          <button type="button"
            style={{ height: 28, padding: '0 12px', borderRadius: 999, border: '1.5px solid hsl(var(--primary))', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={handleReset}>
            <IoFolderOpenOutline style={{ fontSize: 13 }} />浏览
          </button>
          {navStack.length > 0 && (
            <span style={{ ...sepSt, opacity: 1, padding: '0 2px' }}>|</span>
          )}
          {renderRow1()}
        </div>
        <div style={rightStyle}>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
            共 {visibleEntries.length} 项
          </span>
          {/* Refresh */}
          <div style={iBtn()}>
            <button type="button" style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer' }}
              onClick={() => { refreshRef.current++; fetchEntries(curPath); }}>
              <VscRefresh style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          {/* Close */}
          <div style={iBtn()}>
            <button type="button" style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer' }}
              onClick={onClose}>
              <MdClose style={{ fontSize: 15, color: 'hsl(var(--muted-foreground))' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 2: sub-dir pills + actions + search + sort ── */}
      <div style={{ ...rowStyle, borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
        <div style={scrollRowStyle}>
          {renderRow2()}
        </div>
        <div style={rightStyle}>
          {/* New folder */}
          <button type="button" style={actionBtn(false, false)}
            onClick={() => { setMkdirMode(true); setMkdirVal(''); setRenameMode(false); }}>
            <MdCreateNewFolder style={{ fontSize: 13 }} />新建
          </button>
          {/* Rename */}
          <button type="button" style={actionBtn(false, !hasSelected)}
            disabled={!hasSelected}
            onClick={() => { if (!selected) return; setRenameMode(true); setRenameVal(selected.name); setDeleteConfirm(false); }}>
            <MdEdit style={{ fontSize: 13 }} />改名
          </button>
          {/* Move */}
          <button type="button" style={actionBtn(false, !hasSelected)}
            disabled={!hasSelected}
            onClick={async () => {
              if (!selected) return;
              const dirs = await fetchSubdirs(FAVORITES_ROOT);
              setMoveDirs(dirs); setMoveDest(''); setShowMove(true);
            }}>
            <MdDriveFileMove style={{ fontSize: 13 }} />移动
          </button>
          {/* Delete */}
          <button type="button" style={actionBtn(true, !hasSelected)}
            disabled={!hasSelected}
            onClick={() => { if (!selected) return; setDeleteConfirm(true); setRenameMode(false); }}>
            <MdDelete style={{ fontSize: 13 }} />删除
          </button>
          {/* Search */}
          <div style={iBtn(showSearch)}>
            <button type="button" style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer' }}
              onClick={() => { setShowSearch(v => !v); if (showSearch) setSearch(''); }}>
              <AiOutlineSearch style={{ fontSize: 14, color: showSearch ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
            </button>
          </div>
          {/* Sort */}
          <div style={iBtn(sortKey !== 'name')}>
            <button type="button" style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer' }}
              onClick={() => setShowSort(v => !v)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
                stroke={sortKey !== 'name' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                strokeWidth="1.5"><path d="M2 4h12M4 8h8M6 12h4" /></svg>
            </button>
            {showSort && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowSort(false)} />
                <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 50, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,.15)', minWidth: 110 }}>
                  {(['name', 'size', 'mtime'] as const).map(k => (
                    <button key={k} type="button"
                      onClick={() => { setSortKey(k); setShowSort(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: sortKey === k ? 500 : 400, background: sortKey === k ? 'hsl(var(--primary) / 0.08)' : 'transparent', color: sortKey === k ? 'hsl(var(--primary))' : 'hsl(var(--foreground))', textAlign: 'left' as const }}>
                      {{ name: '名称', size: '大小', mtime: '时间' }[k]}
                      {sortKey === k && <span style={{ marginLeft: 'auto' }}>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Search bar (toggled) ── */}
      {showSearch && (
        <div style={{ display: 'flex', alignItems: 'center', height: 32, margin: '6px 12px 0', borderRadius: 999, border: '1px solid hsl(var(--border))', background: 'hsl(var(--muted) / 0.4)', padding: '0 10px', gap: 6 }}>
          <AiOutlineSearch style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
          <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索文件…"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0 }} />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'hsl(var(--muted-foreground))', fontSize: 16 }}>×</button>
          )}
        </div>
      )}

      {/* ── Inline action bars ── */}
      {renameMode && selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 12px 0', padding: '6px 10px', background: 'hsl(var(--muted) / 0.3)', borderRadius: 8, border: '1px solid hsl(var(--border))' }}>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>改名：</span>
          <input autoFocus type="text" value={renameVal} onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenameMode(false); }}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'hsl(var(--foreground))' }} />
          <button type="button" disabled={busy} onClick={doRename} style={{ ...iBtn(true), flexShrink: 0 }}>
            <MdCheck style={{ fontSize: 14, color: 'hsl(var(--primary))' }} />
          </button>
          <button type="button" onClick={() => setRenameMode(false)} style={{ ...iBtn(), flexShrink: 0 }}>
            <MdClose style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>
      )}
      {mkdirMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 12px 0', padding: '6px 10px', background: 'hsl(var(--muted) / 0.3)', borderRadius: 8, border: '1px solid hsl(var(--border))' }}>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>新建文件夹：</span>
          <input autoFocus type="text" value={mkdirVal} onChange={e => setMkdirVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doMkdir(); if (e.key === 'Escape') setMkdirMode(false); }}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'hsl(var(--foreground))' }} />
          <button type="button" disabled={busy} onClick={doMkdir} style={{ ...iBtn(true), flexShrink: 0 }}>
            <MdCheck style={{ fontSize: 14, color: 'hsl(var(--primary))' }} />
          </button>
          <button type="button" onClick={() => setMkdirMode(false)} style={{ ...iBtn(), flexShrink: 0 }}>
            <MdClose style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>
      )}
      {deleteConfirm && selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 12px 0', padding: '6px 10px', background: 'hsl(var(--destructive) / 0.07)', borderRadius: 8, border: '1px solid hsl(var(--destructive) / 0.25)' }}>
          <span style={{ fontSize: 12, color: 'hsl(var(--destructive))', flex: 1 }}>
            确认删除「{selected.name}」？此操作不可撤销
          </span>
          <button type="button" disabled={busy} onClick={doDelete}
            style={{ height: 26, padding: '0 10px', borderRadius: 6, border: 'none', background: 'hsl(var(--destructive))', color: '#fff', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            确认删除
          </button>
          <button type="button" onClick={() => setDeleteConfirm(false)} style={{ ...iBtn(), flexShrink: 0 }}>
            <MdClose style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>
      )}

      {/* ── Move dialog ── */}
      {showMove && selected && (
        <div style={{ margin: '6px 12px 0', padding: '10px', background: 'hsl(var(--muted) / 0.3)', borderRadius: 8, border: '1px solid hsl(var(--border))' }}>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>移动「{selected.name}」到：</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            <button type="button"
              style={{ ...pillI, ...(moveDest === '' ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.1)' } : {}) }}
              onClick={() => setMoveDest('')}>
              <FolderIcon color={moveDest === '' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />根目录
            </button>
            {moveDirs.map(d => (
              <button key={d.path} type="button"
                style={{ ...pillI, ...(moveDest === d.path ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.1)' } : {}) }}
                onClick={() => setMoveDest(d.path)}>
                <FolderIcon color={moveDest === d.path ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />{d.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" disabled={busy} onClick={() => doMove(moveDest || FAVORITES_ROOT)}
              style={{ height: 26, padding: '0 12px', borderRadius: 6, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 12, cursor: 'pointer' }}>
              确认移动
            </button>
            <button type="button" onClick={() => setShowMove(false)}
              style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--muted-foreground))', fontSize: 12, cursor: 'pointer' }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* ── File list ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 12px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ height: 36, borderRadius: 6, background: 'hsl(var(--muted) / 0.4)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
            {search ? '没有匹配的文件' : '当前目录为空'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visibleEntries.map(entry => {
              const isSel = selected?.path === entry.path;
              return (
                <div key={entry.path}
                  onClick={() => {
                    if (entry.isDir) {
                      // Navigate into dir via nav stack
                      handleChildClick({ name: entry.name, path: entry.path });
                    } else {
                      setSelected(isSel ? null : entry);
                      setRenameMode(false); setDeleteConfirm(false); setMkdirMode(false);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                    borderRadius: 8, cursor: 'pointer',
                    background: isSel ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                    border: isSel ? '1px solid hsl(var(--primary) / 0.3)' : '1px solid transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted) / 0.5)'; }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {entry.isDir
                    ? <FolderIcon color={isSel ? 'hsl(var(--primary))' : 'hsl(var(--amber, 200 80% 60%))'} size={15} />
                    : <FileIcon color={isSel ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} size={15} />
                  }
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: isSel ? 'hsl(var(--primary))' : 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.name}
                  </span>
                  {!entry.isDir && entry.size > 0 && (
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
                      {fmtSize(entry.size)}
                    </span>
                  )}
                  {entry.isDir && (
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>›</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
