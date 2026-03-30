'use client';
import { useState, useEffect, useRef } from 'react';
import type { FileItem } from './_types';

// ─────────────────────────────────────────────
export function RenameDialog({
  open, onClose, target, shareName, pwd, onDone,
}: {
  open: boolean; onClose: () => void; target: FileItem | null;
  shareName: string; pwd: string; onDone: () => void;
}) {
  const [stem, setStem]     = useState('');
  const [loading, setLoading] = useState(false);
  const stemRef = useRef<HTMLInputElement>(null);

  // Split target name into stem + ext when dialog opens
  const ext = target
    ? (() => {
        const dot = target.name.lastIndexOf('.');
        return dot > 0 && !target.isDir ? target.name.slice(dot) : '';
      })()
    : '';

  useEffect(() => {
    if (target) {
      const dot = target.name.lastIndexOf('.');
      const s = dot > 0 && !target.isDir ? target.name.slice(0, dot) : target.name;
      setStem(s);
      // Select all text in stem input after a short delay (autoFocus fires first)
      setTimeout(() => { stemRef.current?.select(); }, 50);
    }
  }, [target]);

  const fullName = stem + ext;

  const doRename = async () => {
    if (!stem.trim() || !target) return;
    setLoading(true);
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', pwd, filePath: target.path, newName: fullName.trim() }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) { onDone(); onClose(); }
    else alert(d.error || '改名失败');
  };

  if (!open) return null;
  return (
    <div className='fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4'
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className='bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl'>
        <div className='text-base font-semibold mb-1'>改文件名</div>
        <p className='text-xs text-muted-foreground mb-4 break-all'>原名：{target?.name}</p>

        {/* Stem + ext split input */}
        <div className='flex items-center gap-0 mb-3'>
          <input
            ref={stemRef}
            autoFocus
            value={stem}
            onChange={e => setStem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doRename()}
            className='flex-1 bg-muted px-3 py-2 rounded-l-lg border border-border text-sm
                       outline-none focus:border-primary focus:z-10 relative' />
          {ext && (
            <div className='bg-muted/60 px-3 py-2 rounded-r-lg border border-l-0 border-border
                            text-sm text-muted-foreground font-mono shrink-0 select-none'>
              {ext}
            </div>
          )}
        </div>

        <div className='flex gap-2'>
          <button onClick={doRename} disabled={loading || !stem.trim()}
            className='flex-1 bg-primary text-primary-foreground py-2 rounded-lg font-bold
                       text-sm disabled:opacity-50'>
            {loading ? '处理中...' : '确认'}
          </button>
          <button onClick={onClose}
            className='flex-1 bg-muted border border-border text-muted-foreground py-2 rounded-lg text-sm'>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

