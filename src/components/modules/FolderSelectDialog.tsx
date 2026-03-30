'use client';

import { useState, useEffect } from 'react';
import { MdFolder, MdFolderOpen, MdChevronRight } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DirNode = {
  name: string;
  path: string;
  children?: DirNode[];
};

type FolderSelectDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (targetSubdir: string) => void;
  title: string;
  description?: string;
  loading?: boolean;
  confirmLabel?: string;
};

export function FolderSelectDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  loading = false,
  confirmLabel = '\u786e\u8ba4\u79fb\u52a8',
}: FolderSelectDialogProps) {
  const [dirs, setDirs] = useState<DirNode[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(false);
  // selectedPath stores the relative path within /additional-browse, e.g. "WebClipper" or "WebClipper/CommentShots"
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelectedPath('');
    setExpandedPaths(new Set());
    setLoadingDirs(true);
    fetch('/api/move-local-file')
      .then((r) => r.json())
      .then((data) => setDirs(data.dirs || []))
      .catch(() => setDirs([]))
      .finally(() => setLoadingDirs(false));
  }, [open]);

  const toggleExpand = (p: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  // Convert absolute path to relative path within /additional-browse
  const toRelative = (absPath: string) => absPath.replace(/^\/additional-browse\/?/, '');

  const renderDir = (node: DirNode, depth = 0): React.ReactNode => {
    const rel = toRelative(node.path);
    const isSelected = selectedPath === rel;
    const isExpanded = expandedPaths.has(rel);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.path}>
        <button
          type='button'
          onClick={() => setSelectedPath(rel)}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            isSelected
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-transparent border-border hover:border-primary/50'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren ? (
            <span
              onClick={(e) => toggleExpand(rel, e)}
              className='shrink-0 flex items-center'
            >
              <MdChevronRight
                className={`text-base transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </span>
          ) : (
            <span className='w-4 shrink-0' />
          )}
          {isSelected ? (
            <MdFolderOpen className='shrink-0 text-base' />
          ) : (
            <MdFolder className='shrink-0 text-base' />
          )}
          <span className='truncate'>{node.name}</span>
        </button>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderDir(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const selectedLabel = selectedPath || '\u6536\u85cf\u76ee\u5f55\uff08\u6839\u76ee\u5f55\uff09';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className='max-w-sm max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && (
          <p className='text-sm text-muted-foreground break-all line-clamp-2'>{description}</p>
        )}

        <div className='flex-1 overflow-y-auto space-y-1.5 min-h-0'>
          <p className='text-xs text-muted-foreground'>{'\u9009\u62e9\u76ee\u6807\u6587\u4ef6\u5939'}</p>

          {/* Root option */}
          <button
            type='button'
            onClick={() => setSelectedPath('')}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
              selectedPath === ''
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent border-border hover:border-primary/50'
            }`}
          >
            <MdFolder className='shrink-0' />
            {'\u6536\u85cf\u76ee\u5f55\uff08\u6839\u76ee\u5f55\uff09'}
          </button>

          {loadingDirs ? (
            <p className='text-xs text-muted-foreground animate-pulse px-3'>{'\u52a0\u8f7d\u4e2d...'}</p>
          ) : dirs.length === 0 ? (
            <p className='text-xs text-muted-foreground px-3'>{'\u6ca1\u6709\u5b50\u6587\u4ef6\u5939'}</p>
          ) : (
            dirs.map((d) => renderDir(d))
          )}
        </div>

        <div className='text-xs text-muted-foreground pt-1'>
          {'\u5df2\u9009\u62e9\uff1a'}{selectedLabel}
        </div>

        <DialogFooter className='flex flex-row justify-end gap-2 pt-2'>
          <Button variant='outline' size='sm' onClick={onClose}>{'\u53d6\u6d88'}</Button>
          <Button size='sm' onClick={() => onConfirm(selectedPath)} disabled={loading}>
            {loading ? '\u79fb\u52a8\u4e2d...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
