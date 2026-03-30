'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileItem } from './_types';
import { MoveDialog } from './_MoveDialog';
import { fmtSize } from './_types';

// ─────────────────────────────────────────────
// Settings Modal — folder-select + action bar
// Action bar: 上传 | 改名 | 新建 | 删除
// ─────────────────────────────────────────────
export function SettingsModal({
  open, onClose, shareName, pwd, onPwdChanged, onDone,
}: {
  open: boolean; onClose: () => void; shareName: string; pwd: string;
  onPwdChanged: (newPwd: string) => void; onDone: () => void;
}) {
  const [tab, setTab]             = useState<'files' | 'password'>('files');
  // ── File tree state ──
  const [allFiles, setAllFiles]   = useState<FileItem[]>([]);
  const [subFilesMap, setSubFilesMap] = useState<Record<string, FileItem[]>>({});
  const [openDirs, setOpenDirs]   = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(false);
  // ── Selection ──
  // path = absolute disk path (for delete/rename API)
  // apiPath = relative path from share root (for upload/mkdir API)
  const [selectedItem, setSelectedItem] = useState<{
    path: string; apiPath: string; name: string; isDir: boolean;
    parentDirKey: string; parentApiDir: string;
  } | null>(null);
  // ── Actions ──
  const [renameInput, setRenameInput]   = useState('');
  const [renameExt, setRenameExt]       = useState('');  // fixed extension while editing stem
  const [renameMode, setRenameMode]     = useState(false);
  const [newDirName, setNewDirName]     = useState('');
  const [newDirMode, setNewDirMode]     = useState(false);
  const [uploadingDir, setUploadingDir] = useState<string | null>(null);
  const [creating, setCreating]         = useState(false);
  const [openMove, setOpenMove]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showAddMenu, setShowAddMenu]     = useState(false);  // +新建 dropdown
  const [sortOrder, setSortOrder]         = useState<'name'|'nameDesc'|'newest'|'oldest'|'sizeAsc'|'sizeDesc'>('newest');
  const [showSortMenu, setShowSortMenu]   = useState(false);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadDirRef    = useRef('');
  const selectedRowRef  = useRef<HTMLDivElement | HTMLButtonElement | null>(null);
  // ── Password ──
  const [newPwd, setNewPwd] = useState('');

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (pwd) qs.set('pwd', pwd);
    const r = await fetch(`/api/share-folder/${shareName}?${qs}`);
    const d = await r.json();
    const files: FileItem[] = d.files || [];
    setAllFiles(files);
    // Pre-fetch sub-content for each dir so we know if ▶ should show
    // (runs silently in background, doesn't block UI)
    const dirs = files.filter(f => f.isDir);
    Promise.all(dirs.map(async dir => {
      if (subFilesMap[dir.name] !== undefined) return; // already loaded
      const sq = new URLSearchParams();
      if (pwd) sq.set('pwd', pwd);
      sq.set('sub', dir.name);
      const sr = await fetch(`/api/share-folder/${shareName}?${sq}`);
      const sd = await sr.json();
      setSubFilesMap(prev => ({ ...prev, [dir.name]: sd.files || [] }));
    }));
    setLoading(false);
  }, [shareName, pwd]);

  const fetchSubFiles = async (rowKey: string, apiDir: string) => {
    const qs = new URLSearchParams();
    if (pwd) qs.set('pwd', pwd);
    if (apiDir) qs.set('sub', apiDir);
    const r = await fetch(`/api/share-folder/${shareName}?${qs}`);
    const d = await r.json();
    setSubFilesMap(prev => ({ ...prev, [rowKey]: d.files || [] }));
  };

  useEffect(() => {
    if (open) { loadFiles(); setSelectedItem(null); setRenameMode(false); setNewDirMode(false); }
  }, [open, loadFiles]);

  // Lock body scroll while modal is open — prevents mouse wheel bleed-through
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const toggleDir = async (rowKey: string, apiDir: string) => {
    const next = new Set(openDirs);
    if (next.has(rowKey)) { next.delete(rowKey); setOpenDirs(next); return; }
    next.add(rowKey); setOpenDirs(next);
    if (!subFilesMap[rowKey]) await fetchSubFiles(rowKey, apiDir);
  };
;

  const triggerUpload = (apiDir: string, rowKey: string) => {
    uploadDirRef.current = apiDir;
    setUploadingDir(rowKey);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const baseDir = uploadDirRef.current;
    const isFolderUpload = !!(fileList[0] as any).webkitRelativePath;
    let firstApiPath = '';
    let uploaded = 0;
    const skipped: string[] = [];

    for (const file of Array.from(fileList)) {
      const relPath = ((file as any).webkitRelativePath as string) || '';
      let subDir = baseDir;
      let filename = file.name;
      if (relPath) {
        const parts = relPath.split('/');
        filename = parts[parts.length - 1];
        const relSubDir = parts.slice(0, parts.length - 1).join('/');
        subDir = baseDir ? `${baseDir}/${relSubDir}` : relSubDir;
      }
      // Track hidden files (browser skips .xxx files in folder mode)
      if (isFolderUpload && filename.startsWith('.')) {
        skipped.push(relPath || filename);
        continue;
      }
      const qs = new URLSearchParams({ filename });
      if (pwd) qs.set('pwd', pwd);
      if (subDir) qs.set('subDir', subDir);
      const r = await fetch(`/api/share-folder/${shareName}/manage?${qs}`, { method: 'PUT', body: file });
      const d = await r.json();
      if (d.success) {
        uploaded++;
        if (!firstApiPath) firstApiPath = subDir ? `${subDir}/${filename}` : filename;
      } else {
        skipped.push(filename);
      }
    }

    setUploadingDir(null);

    // Show upload summary if anything was skipped
    if (skipped.length > 0) {
      const hiddenCount = skipped.filter(f => f.split('/').pop()?.startsWith('.')).length;
      const failCount   = skipped.length - hiddenCount;
      let msg = `已上传 ${uploaded} 个文件。`;
      if (hiddenCount > 0) msg += `\n跳过 ${hiddenCount} 个隐藏文件（以.开头，浏览器安全限制）。`;
      if (failCount   > 0) msg += `\n上传失败 ${failCount} 个文件。`;
      alert(msg);
    }

    const rowKey = baseDir || '__ROOT__';
    if (firstApiPath) await expandAncestors(firstApiPath);
    await fetchSubFiles(rowKey, baseDir);
    if (!baseDir) await loadFiles();
    setOpenDirs(prev => { const n = new Set(prev); n.add(rowKey); return n; });
    const focusName = isFolderUpload
      ? firstApiPath.split('/')[baseDir ? baseDir.split('/').length : 0] || fileList[0].name
      : fileList[0].name;
    const focusApiPath = baseDir ? `${baseDir}/${focusName}` : focusName;
    if (firstApiPath) {
      setSelectedItem({ path: focusApiPath, apiPath: focusApiPath, name: focusName,
        isDir: isFolderUpload, parentDirKey: rowKey, parentApiDir: baseDir });
      scrollToSelected();
    }
    e.target.value = '';
  };;

  const expandAncestors = async (apiPath: string) => {
    if (!apiPath) return;
    const parts = apiPath.split('/');
    const ancestors: string[] = [];
    for (let i = 1; i < parts.length; i++)
      ancestors.push(parts.slice(0, i).join('/'));
    for (const rk of ancestors)
      if (!subFilesMap[rk]) await fetchSubFiles(rk, rk);
    setOpenDirs(prev => {
      const n = new Set(prev);
      ancestors.forEach(rk => n.add(rk));
      return n;
    });
  };

  // Scroll the highlighted row into view after state updates settle
  const scrollToSelected = () => {
    setTimeout(() => {
      selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
  };

  const doRename = async () => {
    if (!selectedItem || !renameInput.trim()) return;
    const newName = (renameInput.trim() + renameExt).trim();
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', pwd, filePath: selectedItem.path, newName }),
    });
    const d = await r.json();
    if (d.success) {
      setRenameMode(false); setRenameInput(''); setRenameExt('');
      // Update local state in-place — NO onDone()/loadFiles() to avoid parent flash
      const pk = selectedItem.parentDirKey;
      const pa = selectedItem.parentApiDir;
      const updater = (fi: FileItem) => fi.path === selectedItem.path ? { ...fi, name: newName } : fi;
      if (pk === '__ROOT__' && !pa) {
        // Root-level item
        setAllFiles(prev => prev.map(updater));
        if (selectedItem.isDir) {
          // Rename subFilesMap key and openDirs key
          const oldKey = selectedItem.apiPath || selectedItem.name;
          const newKey = newName;
          setSubFilesMap(prev => {
            const n = { ...prev };
            if (oldKey in n) { n[newKey] = n[oldKey]; delete n[oldKey]; }
            return n;
          });
          setOpenDirs(prev => {
            const n = new Set(prev);
            if (n.has(oldKey)) { n.delete(oldKey); n.add(newKey); }
            return n;
          });
        }
      } else if (pk) {
        // Item inside a subdir — update subFilesMap
        setSubFilesMap(prev => ({ ...prev, [pk]: (prev[pk] || []).map(updater) }));
      }
      // Update both apiPath AND path so subsequent operations (move, delete) use the new name
      const newApiPath = selectedItem.apiPath ? selectedItem.apiPath.replace(/[^/]+$/, newName) : newName;
      const newPath = selectedItem.path
        ? selectedItem.path.slice(0, selectedItem.path.lastIndexOf('/') + 1) + newName
        : newName;
      setSelectedItem({ ...selectedItem, name: newName, apiPath: newApiPath, path: newPath });
      scrollToSelected();
    } else alert(d.error || '改名失败');
  };

  const doMkdir = async () => {
    if (!selectedItem?.isDir || !newDirName.trim()) return;
    setCreating(true);
    const folderName = newDirName.trim();
    const parentApiPath = selectedItem.apiPath;
    const subDir = parentApiPath ? `${parentApiPath}/${folderName}` : folderName;
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mkdir', pwd, subDir }),
    });
    const d = await r.json();
    setCreating(false);
    if (d.success) {
      setNewDirName(''); setNewDirMode(false);
      const parentRowKey = parentApiPath || '__ROOT__';
      // New dir as FileItem (size/mtime not critical for display)
      const newDirItem: FileItem = { name: folderName, path: subDir, size: 0, mtime: Date.now(),
        isDir: true, isVideo: false, isImage: false, isAudio: false, ext: '' };
      // Insert into parent's sub-files list (no onDone/loadFiles = no parent flash)
      setSubFilesMap(prev => ({
        ...prev,
        [parentRowKey]: [...(prev[parentRowKey] || []), newDirItem],
        [subDir]: [],   // pre-populate empty list for new folder
      }));
      if (parentRowKey === '__ROOT__') {
        setAllFiles(prev => [...prev, newDirItem]);
      }
      // Auto-expand parent so new folder is visible
      setOpenDirs(prev => { const n = new Set(prev); n.add(parentRowKey); return n; });
      // Focus on new folder
      setSelectedItem({ path: subDir, apiPath: subDir, name: folderName, isDir: true, parentDirKey: parentRowKey, parentApiDir: parentApiPath });
      scrollToSelected();
    } else alert(d.error || '新建失败');
  };

  const doDelete = async () => {
    if (!selectedItem || !deleteConfirm) return;
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', pwd, filePath: selectedItem.path }),
    });
    const d = await r.json();
    if (d.success) {
      setDeleteConfirm(false); setSelectedItem(null);
      const pk = selectedItem.parentDirKey; const pa = selectedItem.parentApiDir;
      if (pk && openDirs.has(pk)) await fetchSubFiles(pk, pa);
      loadFiles(); onDone();
    } else { setDeleteConfirm(false); alert(d.error || '删除失败'); }
  };

  const savePassword = async () => {
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_password', pwd, password: newPwd }),
    });
    const d = await r.json();
    if (d.success) { onPwdChanged(newPwd); alert('密码已更新'); setNewPwd(''); }
    else alert(d.error || '失败');
  };

  const sortFn = (a: FileItem, b: FileItem): number => {
    switch(sortOrder) {
      case 'nameDesc':  return b.name.localeCompare(a.name);
      case 'newest':    return b.mtime - a.mtime;
      case 'oldest':    return a.mtime - b.mtime;
      case 'sizeAsc':   return a.size - b.size;
      case 'sizeDesc':  return b.size - a.size;
      default:          return a.name.localeCompare(b.name);
    }
  };
  const rootFiles = allFiles.filter(f => !f.isDir).sort(sortFn);
  const dirs      = allFiles.filter(f => f.isDir).sort(sortFn);

  // Render a single file row
  const renderFileRow = (f: FileItem, parentDirKey: string, parentApiDir: string, indent: number) => {
    // fileApiPath = relative path — used for isSelected (works after upload/move/rename)
    const fileApiPath = parentApiDir ? `${parentApiDir}/${f.name}` : f.name;
    const isSelected = selectedItem?.apiPath === fileApiPath;
    const thumbSrc = f.isImage
      ? `/api/share-folder/${shareName}/file?path=${encodeURIComponent(f.path)}${pwd ? '&pwd=' + encodeURIComponent(pwd) : ''}`
      : f.isVideo ? `/api/local-thumb?path=${encodeURIComponent(f.path)}` : null;
    return (
      <button key={f.path}
        ref={(el: HTMLButtonElement | null) => { if (isSelected) selectedRowRef.current = el; }}
        className={`w-full flex items-center gap-2 py-1.5 rounded-lg transition-colors text-left
                    ${isSelected ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-muted/40'}`}
        style={{ paddingLeft: `${indent * 16}px`, paddingRight: '12px' }}
        onClick={() => {
          setSelectedItem(isSelected ? null : { path: f.path, apiPath: fileApiPath, name: f.name, isDir: false, parentDirKey, parentApiDir });
          setRenameMode(false); setNewDirMode(false);
        }}>
        {thumbSrc
          ? <img src={thumbSrc} alt='' className='w-9 h-7 object-cover rounded shrink-0 bg-neutral-800' />
          : <span className='w-9 text-center text-base shrink-0'>{f.isAudio ? '🎵' : '📄'}</span>
        }
        <span className={`flex-1 text-xs truncate ${isSelected ? 'font-medium text-primary' : ''}`}>{f.name}</span>
        {f.size > 0 && <span className='text-xs text-muted-foreground shrink-0'>{fmtSize(f.size)}</span>}
      </button>
    );
  };

  // Render a folder row
  const renderDirRow = (f: FileItem, rowKey: string, apiDir: string, indent: number) => {
    const isOpen     = openDirs.has(rowKey);
    const isSelected = selectedItem?.apiPath === apiDir && selectedItem.isDir;
    const subFiles   = subFilesMap[rowKey] || [];
    // Show ▶ only if: not yet loaded (unknown) OR loaded and has sub-dirs
    const loaded = rowKey in subFilesMap;
    const showArrow = !loaded || subFiles.some(sf => sf.isDir);
    return (
      <div key={rowKey}>
        <div
          ref={(el: HTMLDivElement | null) => { if (isSelected) selectedRowRef.current = el; }}
          className={`flex items-center gap-1 rounded-lg transition-colors cursor-pointer
                       ${isSelected ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-muted/40'}`}
          style={{ paddingLeft: `${indent * 16}px`, paddingRight: '8px' }}
          onClick={() => {
            toggleDir(rowKey, apiDir);
            const nowSel = !isSelected;
            setSelectedItem(nowSel
              ? { path: f.path, apiPath: apiDir, name: f.name, isDir: true,
                  parentDirKey: apiDir.includes('/') ? apiDir.split('/').slice(0,-1).join('/') : '__ROOT__',
                  parentApiDir: apiDir.includes('/') ? apiDir.split('/').slice(0,-1).join('/') : '' }
              : null
            );
            setRenameMode(false); setNewDirMode(false);
          }}>
          <span className={`text-xs shrink-0 transition-transform duration-150 font-bold
                            ${isSelected ? 'text-primary' : 'text-muted-foreground'}
                            ${isOpen ? 'rotate-90' : ''}`}
            style={{ display: 'inline-block', width: '16px', textAlign: 'center' }}>
            {showArrow ? '▶' : ''}
          </span>
          <span className='text-base shrink-0'>{isOpen ? '📂' : '📁'}</span>
          <span className={`flex-1 py-2 text-sm font-medium truncate min-w-0 ${isSelected ? 'text-primary' : ''}`}>
            {f.name}
          </span>
          <span className='text-xs text-muted-foreground pr-1 shrink-0'>
            {isOpen ? `${subFiles.filter(sf => !sf.isDir).length} 项` : ''}
          </span>
        </div>
        {isOpen && subFiles.map(sf =>
          sf.isDir
            ? renderDirRow(sf, `${rowKey}/${sf.name}`, apiDir ? `${apiDir}/${sf.name}` : sf.name, indent + 1)
            : renderFileRow(sf, rowKey, apiDir, indent + 1)
        )}
        {isOpen && subFiles.length === 0 && (
          <p className='text-xs text-muted-foreground py-1' style={{ paddingLeft: `${(indent + 1) * 16 + 4}px` }}>（空）</p>
        )}
      </div>
    );
  };

  if (!open) return null;
  return (
    <div className='w-full min-h-screen bg-background'>
      <div className='max-w-7xl mx-auto flex flex-col' style={{ minHeight: '100dvh' }}>

        {/* Hidden upload inputs */}
        <input ref={fileInputRef} type='file' multiple className='hidden' onChange={handleFileChange} />
        <input ref={folderInputRef} type='file' className='hidden' onChange={handleFileChange}
          {...{ webkitdirectory: '', mozdirectory: '' } as any} />

        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b border-border shrink-0'>
          <span className='font-semibold text-base'>设置 — {shareName}</span>
          <button onClick={onClose} className='text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors'>← 返回</button>
        </div>

        {/* Tabs */}
        <div className='flex px-4 py-2 border-b border-border shrink-0'>
          <div className='flex border border-border/60 rounded-lg overflow-hidden'>
            {(['files', 'password'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors
                  ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
                {t === 'files' ? '文件管理' : '更改密码'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'files' && (
          <>
            {/* Action bar */}
            <div className='flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-muted/20 shrink-0'
              onClick={() => { setShowAddMenu(false); setShowSortMenu(false); }}>
              {!deleteConfirm
                ? <button disabled={!selectedItem}
                    onClick={e => { e.stopPropagation(); if (selectedItem) setDeleteConfirm(true); }}
                    className='flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium
                               border border-error/40 text-error-foreground hover:bg-error/10
                               disabled:opacity-40 transition-colors'>
                    🗑 删除
                  </button>
                : <div className='flex items-center gap-1' onClick={e => e.stopPropagation()}>
                    <button onClick={doDelete}
                      className='px-2.5 py-1.5 rounded-lg text-xs font-bold bg-error text-white hover:bg-error/90 transition-colors'>
                      确认
                    </button>
                    <button onClick={() => setDeleteConfirm(false)}
                      className='w-6 h-6 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground rounded'>
                      ✕
                    </button>
                  </div>
              }

              <div className='flex-1' />

              <button disabled={!selectedItem}
                onClick={e => {
                  e.stopPropagation(); setShowAddMenu(false);
                  if (selectedItem) {
                    const dot = selectedItem.name.lastIndexOf('.');
                    const hasExt = dot > 0 && !selectedItem.isDir;
                    setRenameInput(hasExt ? selectedItem.name.slice(0, dot) : selectedItem.name);
                    setRenameExt(hasExt ? selectedItem.name.slice(dot) : '');
                    setRenameMode(true); setNewDirMode(false);
                  }
                }}
                className='flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium
                           border border-border/60 hover:border-primary/60 hover:bg-muted
                           disabled:opacity-40 transition-colors'>
                ✏️ 改名
              </button>

              <button disabled={!selectedItem}
                onClick={e => { e.stopPropagation(); setShowAddMenu(false); if (selectedItem) setOpenMove(true); }}
                className='flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium
                           border border-border/60 hover:border-primary/60 hover:bg-muted
                           disabled:opacity-40 transition-colors'>
                ✈️ 移动
              </button>

              <div className='relative'>
                <button
                  onClick={e => { e.stopPropagation(); setShowAddMenu(v => !v); setDeleteConfirm(false); }}
                  className='flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium
                             border border-border/60 hover:border-primary/60 hover:bg-muted
                             transition-colors'>
                  ＋ 新建
                </button>
                {showAddMenu && (
                  <div className='absolute right-0 top-full mt-1 bg-card border border-border rounded-xl
                                  shadow-xl z-50 overflow-hidden min-w-[140px]'
                    onClick={e => e.stopPropagation()}>
                    <button
                      disabled={!!(selectedItem && !selectedItem.isDir)}
                      onClick={() => {
                        setShowAddMenu(false);
                        const apiDir = selectedItem?.isDir ? selectedItem.apiPath : '';
                        const rowKey = selectedItem?.isDir ? (selectedItem.apiPath || '__ROOT__') : '__ROOT__';
                        triggerUpload(apiDir, rowKey);
                      }}
                      className='w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left
                                 hover:bg-muted transition-colors disabled:opacity-40'>
                      <span className='whitespace-nowrap'>⬆ 上传文件</span>
                    </button>
                    <button
                      disabled={!!(selectedItem && !selectedItem.isDir)}
                      onClick={() => {
                        setShowAddMenu(false);
                        const apiDir = selectedItem?.isDir ? selectedItem.apiPath : '';
                        const rowKey = selectedItem?.isDir ? (selectedItem.apiPath || '__ROOT__') : '__ROOT__';
                        // Use folder-mode input (webkitdirectory)
                        uploadDirRef.current = apiDir;
                        setUploadingDir(rowKey);
                        folderInputRef.current?.click();
                      }}
                      className='w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left
                                 hover:bg-muted transition-colors disabled:opacity-40'>
                      <span className='whitespace-nowrap'>📁 上传文件夹</span>
                    </button>
                    <div className='border-t border-border/50 mx-2' />
                    <button
                      disabled={!selectedItem?.isDir}
                      onClick={() => {
                        setShowAddMenu(false);
                        if (selectedItem?.isDir) { setNewDirMode(true); setNewDirName(''); setRenameMode(false); }
                      }}
                      className='w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left
                                 hover:bg-muted transition-colors disabled:opacity-40'>
                      <span className='whitespace-nowrap'>📁 新建文件夹</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Sort dropdown */}
              <div className='relative'>
                <button
                  onClick={e => { e.stopPropagation(); setShowSortMenu(v => !v); setShowAddMenu(false); }}
                  className='flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium
                             border border-border/60 hover:border-primary/60 hover:bg-muted
                             transition-colors'>
                  {({'name':'名↑','nameDesc':'名↓','newest':'最新','oldest':'最旧','sizeAsc':'小→大','sizeDesc':'大→小'} as any)[sortOrder]} ▾
                </button>
                {showSortMenu && (
                  <div className='absolute right-0 top-full mt-1 bg-card border border-border rounded-xl
                                  shadow-xl z-50 overflow-hidden min-w-[100px]'
                    onClick={e => e.stopPropagation()}>
                    {(['newest','oldest','name','nameDesc','sizeDesc','sizeAsc'] as const).map(order => (
                      <button key={order}
                        onClick={() => { setSortOrder(order); setShowSortMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors
                                    ${sortOrder === order
                                      ? 'bg-primary/10 text-primary font-medium'
                                      : 'hover:bg-muted text-foreground'}`}>
                        {{'newest':'最新','oldest':'最旧','name':'名称A-Z','nameDesc':'名称Z-A','sizeDesc':'大→小','sizeAsc':'小→大'}[order]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Inline rename / new-dir input */}
            {(renameMode || newDirMode) && (
              <div className='px-4 py-2.5 border-b border-border/40 bg-muted/10 shrink-0 flex gap-2 items-center'
                onClick={e => e.stopPropagation()}>
                {renameMode ? (
                  <>
                    <input autoFocus
                      value={renameInput}
                      onChange={e => setRenameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') doRename();
                        if (e.key === 'Escape') { setRenameMode(false); setRenameInput(''); }
                      }}
                      className='flex-1 bg-background px-3 py-1.5 rounded-l-lg border border-border text-sm
                                 outline-none focus:border-primary min-w-0' />
                    {renameExt && (
                      <div className='bg-muted/60 px-2.5 py-1.5 rounded-r-lg border border-l-0 border-border
                                      text-sm text-muted-foreground font-mono shrink-0 select-none'>
                        {renameExt}
                      </div>
                    )}
                  </>
                ) : (
                  <input autoFocus
                    value={newDirName}
                    onChange={e => setNewDirName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') doMkdir();
                      if (e.key === 'Escape') { setNewDirMode(false); setNewDirName(''); }
                    }}
                    placeholder={`在「${selectedItem?.name}」内新建文件夹...`}
                    className='flex-1 bg-background px-3 py-1.5 rounded-lg border border-border text-sm
                               outline-none focus:border-primary min-w-0' />
                )}
                <button
                  onClick={renameMode ? doRename : doMkdir}
                  disabled={renameMode ? !renameInput.trim() : (!newDirName.trim() || creating)}
                  className='px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-50'>
                  {creating ? '...' : '确认'}
                </button>
                <button onClick={() => { setRenameMode(false); setNewDirMode(false); }}
                  className='px-2 py-1.5 text-muted-foreground text-xs hover:text-foreground'>✕</button>
              </div>
            )}

            {/* Breadcrumb path bar — each segment is clickable */}
            {selectedItem && !renameMode && !newDirMode && (
              <div className='px-3 py-1.5 border-b border-border/30 bg-primary/5 shrink-0
                              flex items-center gap-0 overflow-x-auto no-scrollbar'>
                {/* Root segment */}
                <button
                  className='text-xs text-primary/70 hover:text-primary shrink-0 transition-colors'
                  onClick={() => {
                    setSelectedItem({ path: '', apiPath: '', name: shareName,
                      isDir: true, parentDirKey: '', parentApiDir: '' });
                    scrollToSelected();
                  }}>
                  {shareName}
                </button>
                {/* Intermediate segments from apiPath */}
                {(() => {
                  const parts = selectedItem.apiPath ? selectedItem.apiPath.split('/') : [];
                  // For files, all parts; for dirs, all parts
                  return parts.map((part, i) => {
                    const segApiPath = parts.slice(0, i + 1).join('/');
                    const isLast = i === parts.length - 1;
                    // Compute absolute path for this segment
                    const segIsDir = isLast ? selectedItem.isDir : true;
                    return (
                      <span key={i} className='flex items-center'>
                        <span className='text-xs text-primary/40 mx-0.5 shrink-0'>›</span>
                        <button
                          className={`text-xs transition-colors shrink-0 max-w-[120px] truncate
                                      ${isLast
                                        ? 'text-primary font-semibold'
                                        : 'text-primary/70 hover:text-primary'}`}
                          onClick={() => {
                            if (segIsDir) {
                              // Select this folder segment
                              const parentParts = parts.slice(0, i);
                              const parentKey = parentParts.length > 0 ? parentParts.join('/') : '__ROOT__';
                              const parentApiDir = parentParts.join('/');
                              // Reconstruct absolute path by replacing tail
                              const relParts = selectedItem.path.split('/');
                              const keepCount = relParts.length - (parts.length - i - 1);
                              const segAbsPath = relParts.slice(0, keepCount).join('/');
                              setSelectedItem({ path: segAbsPath, apiPath: segApiPath,
                                name: part, isDir: true, parentDirKey: parentKey, parentApiDir });
                              expandAncestors(segApiPath);
                            }
                          }}>
                          {segIsDir ? '📁' : '📄'} {part}
                        </button>
                      </span>
                    );
                  });
                })()}
              </div>
            )}

            {/* File tree */}
            <div className='flex-1 overflow-y-auto px-2 py-1 min-h-0'
              onWheel={e => e.stopPropagation()}>
              {loading
                ? <div className='py-8 text-center text-muted-foreground text-sm'>加载中...</div>
                : <>
                    {/* Root folder row — entire row = toggle + select */}
                    {(() => {
                      const rootOpen = openDirs.has('__ROOT__');
                      const rootSub  = subFilesMap['__ROOT__'] || [];
                      const rootShowArrow = !rootOpen || (rootFiles.length > 0 || dirs.length > 0);
                      const rootSelected  = selectedItem?.apiPath === '' && selectedItem.isDir;
                      return (
                        <div
                          ref={rootSelected ? ((el: HTMLElement | null) => { selectedRowRef.current = el as any; }) : undefined}
                          className={`flex items-center gap-1 rounded-lg transition-colors cursor-pointer
                                       ${rootSelected ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-muted/40'}`}
                          onClick={() => {
                            toggleDir('__ROOT__', '');
                            const isSel = rootSelected;
                            setSelectedItem(isSel ? null : { path: '', apiPath: '', name: shareName, isDir: true, parentDirKey: '', parentApiDir: '' });
                            setRenameMode(false); setNewDirMode(false);
                          }}>
                          <span className={`text-xs shrink-0 transition-transform duration-150 font-bold ml-1
                                            ${rootSelected ? 'text-primary' : 'text-muted-foreground'}
                                            ${rootOpen ? 'rotate-90' : ''}`}
                            style={{ display: 'inline-block', width: '16px', textAlign: 'center' }}>
                            {rootShowArrow ? '▶' : ''}
                          </span>
                          <span className='text-base shrink-0'>{rootOpen ? '📂' : '📁'}</span>
                          <span className={`flex-1 py-2 text-sm font-medium min-w-0 ${rootSelected ? 'text-primary' : ''}`}>
                            {shareName}
                            <span className='text-xs text-muted-foreground font-normal ml-1'>（根目录）</span>
                          </span>
                        </div>
                      );
                    })()}

                    {/* Root files */}
                    {openDirs.has('__ROOT__') && rootFiles.map(f =>
                      renderFileRow(f, '__ROOT__', '', 2)
                    )}

                    {/* Sub-folders */}
                    {dirs.map(dir => renderDirRow(dir, dir.name, dir.name, 1))}

                    {allFiles.length === 0 && (
                      <div className='py-8 text-center text-muted-foreground text-sm'>文件夹为空</div>
                    )}
                  </>
              }
            </div>
          </>
        )}

        {tab === 'password' && (
          <div className='flex-1 p-5 space-y-3'>
            <p className='text-sm text-muted-foreground'>留空则移除访问密码</p>
            <input type='password' value={newPwd} onChange={e => setNewPwd(e.target.value)}
              placeholder='新密码（留空移除）'
              className='w-full bg-muted px-3 py-2 rounded-lg border border-border text-sm
                         outline-none focus:border-primary' />
            <button onClick={savePassword}
              className='w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm'>
              保存
            </button>
          </div>
        )}
      </div>

      {/* MoveDialog launched from within settings */}
      {openMove && selectedItem && (
        <MoveDialog
          open={true}
          onClose={() => setOpenMove(false)}
          target={{ path: selectedItem.path, name: selectedItem.name } as FileItem}
          shareName={shareName}
          pwd={pwd}
          onDone={async (destDir: string) => {
            const movedItem = selectedItem ? { ...selectedItem } : null;
            setOpenMove(false); setSelectedItem(null);
            await loadFiles();
            // Expand ALL ancestor dirs so deep paths auto-open
            if (destDir) await expandAncestors(destDir + '/_ph');
            const destRowKey = destDir || '__ROOT__';
            await fetchSubFiles(destRowKey, destDir);
            setOpenDirs(prev => { const n = new Set(prev); n.add(destRowKey); return n; });
            if (movedItem) {
              const newApiPath = destDir ? `${destDir}/${movedItem.name}` : movedItem.name;
              setSelectedItem({ path: newApiPath, apiPath: newApiPath, name: movedItem.name,
                isDir: movedItem.isDir, parentDirKey: destRowKey, parentApiDir: destDir });
              scrollToSelected();
            }
            onDone();
          }}
        />
      )}
    </div>
  );
}