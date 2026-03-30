'use client';
import { useState, useEffect, useCallback } from 'react';
import { MdDriveFileMove } from 'react-icons/md';
import type { FileItem, DirNode } from './_types';

// ─────────────────────────────────────────────
// MoveDialog — exact 收藏目录 style
// Each folder = bordered card row
// ▶/▼ expand arrow on left, click row = select (green)
// "已选择：path" at bottom, buttons: 取消 | 确认新建 | 确认移动
// ─────────────────────────────────────────────
export function MoveDialog({
  open, onClose, target, shareName, pwd, onDone,
}: {
  open: boolean; onClose: () => void; target: FileItem | null;
  shareName: string; pwd: string; onDone: (destDir: string) => void;
}) {
  const [tree, setTree]           = useState<DirNode[]>([]);
  const [loading, setLoading]     = useState(false);
  const [moving, setMoving]       = useState(false);
  const [creating, setCreating]   = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newDirInput, setNewDirInput]     = useState('');

  const fetchDirs = useCallback(async (subPath: string): Promise<DirNode[]> => {
    const qs = new URLSearchParams();
    if (pwd) qs.set('pwd', pwd);
    if (subPath) qs.set('sub', subPath);
    const r = await fetch(`/api/share-folder/${shareName}?${qs}`);
    const d = await r.json();
    const dirs: FileItem[] = (d.files || []).filter((f: FileItem) => f.isDir);
    // Check each dir for sub-dirs in parallel (one request per dir to know hasChildren)
    return Promise.all(dirs.map(async f => {
      const childPath = subPath ? `${subPath}/${f.name}` : f.name;
      const cqs = new URLSearchParams();
      if (pwd) cqs.set('pwd', pwd);
      cqs.set('sub', childPath);
      const cr = await fetch(`/api/share-folder/${shareName}?${cqs}`);
      const cd = await cr.json();
      const hasChildren = (cd.files || []).some((cf: FileItem) => cf.isDir);
      return { path: childPath, name: f.name, children: [], hasChildren };
    }));
  }, [shareName, pwd]);

  // Lazy: expand a node on demand; update hasChildren after load
  const expandNode = async (node: DirNode) => {
    if (node.children.length > 0) return;
    const children = await fetchDirs(node.path);
    const update = (nodes: DirNode[]): DirNode[] =>
      nodes.map(n => n.path === node.path
        ? { ...n, children, hasChildren: children.length > 0 }
        : { ...n, children: update(n.children) });
    setTree(prev => update(prev));
  };

  const loadTree = useCallback(async () => {
    setLoading(true);
    try { setTree(await fetchDirs('')); }
    finally { setLoading(false); }
  }, [fetchDirs]);

  useEffect(() => {
    if (open) {
      loadTree();
      setSelectedPath(null);
      setExpandedPaths(new Set());
      setNewFolderMode(false);
      setNewDirInput('');
    }
  }, [open, loadTree]);

  const toggleExpand = async (node: DirNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedPaths);
    if (next.has(node.path)) {
      next.delete(node.path);
    } else {
      next.add(node.path);
      await expandNode(node);
    }
    setExpandedPaths(next);
  };

  const doMove = async () => {
    if (selectedPath === null || !target || moving) return;
    setMoving(true);
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move', pwd, filePath: target.path, destDir: selectedPath }),
    });
    const d = await r.json();
    setMoving(false);
    if (d.success) { onDone(selectedPath ?? ''); onClose(); }
    else alert(d.error || '移动失败');
  };

  const doMkdir = async () => {
    const name = newDirInput.trim();
    if (!name || selectedPath === null) return;
    setCreating(true);
    const subDir = selectedPath ? `${selectedPath}/${name}` : name;
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mkdir', pwd, subDir }),
    });
    const d = await r.json();
    setCreating(false);
    if (d.success) {
      setNewDirInput(''); setNewFolderMode(false);
      await loadTree();
      // Re-expand the parent
      if (selectedPath !== '') {
        const next = new Set(expandedPaths);
        next.add(selectedPath);
        setExpandedPaths(next);
      }
    } else alert(d.error || '新建失败');
  };

  // Recursive folder row — click anywhere on row = toggle + select
  const renderNode = (node: DirNode, depth: number): React.ReactNode => {
    const isSelected = selectedPath === node.path;
    const isExpanded = expandedPaths.has(node.path);
    // After expanding, hasChildren is updated; before expanding assume might have children
    const showArrow = node.hasChildren;
    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-2 px-3 py-3 rounded-xl border cursor-pointer
                      transition-all duration-150 select-none
                      ${isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border hover:border-primary/60 hover:bg-muted/40'}`}
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => {
            if (showArrow) {
              const nextExp = new Set(expandedPaths);
              if (nextExp.has(node.path)) { nextExp.delete(node.path); }
              else { nextExp.add(node.path); expandNode(node); }
              setExpandedPaths(nextExp);
            }
            setSelectedPath(isSelected ? null : node.path);
            setNewFolderMode(false); setNewDirInput('');
          }}>
          {/* ▶ arrow — only when folder has children */}
          <span
            className={`text-xs shrink-0 transition-transform duration-150 font-bold
                        ${isSelected ? 'text-primary-foreground/60' : 'text-muted-foreground'}
                        ${isExpanded ? 'rotate-90' : ''}`}
            style={{ display: 'inline-block', width: '14px', textAlign: 'center' }}>
            {showArrow ? '▶' : ''}
          </span>
          <span className='text-lg shrink-0'>{isSelected ? '📂' : '📁'}</span>
          <span className='flex-1 text-sm font-medium truncate'>{node.name}</span>
        </div>
        {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  const selectedLabel = selectedPath === null ? null
    : selectedPath === '' ? `${shareName}（根目录）`
    : selectedPath;

  if (!open) return null;
  return (
    <div className='fixed inset-0 bg-black/70 z-[100] flex items-end sm:items-center justify-center'
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className='bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm
                      shadow-2xl flex flex-col' style={{ maxHeight: '80vh' }}>

        {/* Header — matches 收藏目录 exactly */}
        <div className='flex items-start justify-between px-5 pt-5 pb-2 shrink-0'>
          <div>
            <div className='text-base font-bold'>移动文件</div>
            <p className='text-xs text-muted-foreground mt-0.5 truncate max-w-[240px]'>{target?.name}</p>
          </div>
          <button onClick={onClose}
            className='text-muted-foreground hover:text-foreground mt-0.5 text-xl w-7 h-7
                       flex items-center justify-center shrink-0'>✕</button>
        </div>

        {/* "选择文件夹" label */}
        <div className='px-5 pb-2 text-xs text-muted-foreground font-medium shrink-0'>
          选择文件夹
        </div>

        {/* Folder tree */}
        <div className='flex-1 overflow-y-auto px-4 pb-2 min-h-0 flex flex-col gap-1.5'>
          {loading
            ? <div className='py-8 text-center text-muted-foreground text-sm'>加载中...</div>
            : <>
                {/* Root row — click whole row */}
                <div
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border cursor-pointer
                               transition-all duration-150 select-none
                               ${selectedPath === ''
                                 ? 'bg-primary border-primary text-primary-foreground'
                                 : 'border-border hover:border-primary/60 hover:bg-muted/40'}`}
                  onClick={() => { setSelectedPath(selectedPath === '' ? null : ''); setNewFolderMode(false); setNewDirInput(''); }}>
                  <span className='text-xs shrink-0 font-bold' style={{ width: '14px', textAlign: 'center', color: selectedPath === '' ? 'rgba(255,255,255,0.5)' : 'var(--muted-foreground)' }}>—</span>
                  <span className='text-lg shrink-0'>{selectedPath === '' ? '📂' : '📁'}</span>
                  <span className='flex-1 text-sm font-medium'>{shareName}</span>
                  <span className={`text-xs shrink-0 ${selectedPath === '' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    根目录
                  </span>
                </div>
                {/* Sub-dirs */}
                {tree.map(node => renderNode(node, 0))}
                {tree.length === 0 && !loading && (
                  <p className='text-xs text-muted-foreground text-center py-2'>暂无子文件夹</p>
                )}
              </>
          }
        </div>

        {/* New folder inline input */}
        {newFolderMode && selectedPath !== null && (
          <div className='px-5 py-3 border-t border-border/50 bg-muted/10 shrink-0'>
            <p className='text-xs text-muted-foreground mb-2'>
              在「{selectedLabel}」内新建文件夹：
            </p>
            <input autoFocus value={newDirInput} onChange={e => setNewDirInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doMkdir(); if (e.key === 'Escape') { setNewFolderMode(false); setNewDirInput(''); } }}
              placeholder='新文件夹名称...'
              className='w-full bg-background px-3 py-2 rounded-xl border border-border text-sm
                         outline-none focus:border-primary' />
          </div>
        )}

        {/* 已选择 label — matches 收藏目录 */}
        {selectedPath !== null && !newFolderMode && (
          <div className='px-5 py-2 shrink-0'>
            <p className='text-xs text-muted-foreground'>已选择：
              <span className='text-foreground font-medium'>{selectedLabel}</span>
            </p>
          </div>
        )}

        {/* Bottom buttons */}
        <div className='flex gap-2 px-5 py-4 border-t border-border/50 shrink-0'>
          <button onClick={onClose}
            className='flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground
                       hover:bg-muted transition-colors font-medium'>
            取消
          </button>

          {/* 确认新建 — between 取消 and 确认移动, only when folder selected */}
          {!newFolderMode
            ? <button
                onClick={() => { if (selectedPath !== null) { setNewFolderMode(true); setNewDirInput(''); } }}
                disabled={selectedPath === null}
                className='py-2.5 px-3 rounded-xl border border-border/60 text-sm
                           text-muted-foreground hover:bg-muted disabled:opacity-30
                           transition-colors font-medium whitespace-nowrap flex items-center gap-1'>
                <span>📁</span><span>新建文件夹</span>
              </button>
            : <button onClick={doMkdir}
                disabled={!newDirInput.trim() || creating || selectedPath === null}
                className='flex-1 py-2.5 rounded-xl border border-primary/50 text-sm text-primary
                           font-semibold hover:bg-primary/10 disabled:opacity-40 transition-colors
                           flex items-center justify-center gap-1'>
                <span>📁</span><span>{creating ? '新建中...' : '确认新建'}</span>
              </button>
          }

          <button onClick={doMove}
            disabled={selectedPath === null || moving}
            className='flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm
                       font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors
                       flex items-center justify-center gap-2'>
            <MdDriveFileMove className='text-lg shrink-0' />
            <span>{moving ? '移动中...' : '确认移动'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
