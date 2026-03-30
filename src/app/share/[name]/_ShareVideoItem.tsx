'use client';
import { useState } from 'react';
import { MdEdit, MdDriveFileMove, MdFileDownload, MdOutlineVideocamOff } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { FileItem } from './_types';
import { fmtSize, fmtDuration } from './_types';
import { ThumbWithHoverPlay } from './_ThumbWithHoverPlay';
import { MoveDialog } from './_MoveDialog';
import { RenameDialog } from './_RenameDialog';

// ─────────────────────────────────────────────
// Video Card  (exact same layout as LocalVideoItem)
// ─────────────────────────────────────────────
export function ShareVideoItem({
  file, shareName, pwd, columns,
  onDeleted, onRenamed, onMoved, onOpen,
}: {
  file: FileItem; shareName: string; pwd: string; columns: number;
  onDeleted: () => void; onRenamed: () => void; onMoved: () => void;
  onOpen: (file: FileItem) => void;
}) {
  const [openDelete, setOpenDelete] = useState(false);
  const [openRename, setOpenRename] = useState(false);
  const [openMove,   setOpenMove]   = useState(false);
  const [deleting, setDeleting]     = useState(false);

  const btn = 'border-0 bg-black/20 dark:bg-white/20 hover:bg-black/40 dark:hover:bg-white/40';

  const getStreamUrl = (f: FileItem) =>
    `/api/share-folder/${shareName}/file?path=${encodeURIComponent(f.path)}${pwd ? '&pwd=' + encodeURIComponent(pwd) : ''}`;

  // Images are their own thumbnails — use stream URL directly
  // Videos/audio use the local-thumb FFmpeg endpoint
  const thumbUrl = file.isImage
    ? getStreamUrl(file)
    : `/api/local-thumb?path=${encodeURIComponent(file.path)}`;

  const displayName = file.name.replace(/\.[^/.]+$/, '');
  const resolution  = file.height
    ? `${file.height}p${file.fps ? Math.round(file.fps) : ''} ${file.codecName || ''}`.trim()
    : null;

  const handleDelete = async () => {
    setDeleting(true);
    const r = await fetch(`/api/share-folder/${shareName}/manage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', pwd, filePath: file.path }),
    });
    const d = await r.json();
    setDeleting(false);
    if (d.success) { setOpenDelete(false); onDeleted(); }
    else alert(d.error || '删除失败');
  };

  return (
    <>
      <div className='flex flex-col h-full rounded-lg overflow-hidden bg-card-nested group ring-1 ring-border/40 hover:ring-border transition-all'>
        {/* Thumbnail — same as LocalVideoGrid */}
        <div className='relative w-full aspect-video flex-shrink-0 overflow-hidden bg-neutral-900 cursor-pointer'
          onClick={() => {
            if (file.isVideo || file.isAudio || file.isImage) onOpen(file);
            else window.open(getStreamUrl(file));
          }}>
          <ThumbWithHoverPlay thumbUrl={thumbUrl} streamUrl={getStreamUrl(file)} />

          {resolution && (
            <div className='absolute top-1.5 left-1.5 text-xs bg-black/70 text-white px-1.5 py-0.5 rounded'>
              {resolution}
            </div>
          )}
          {file.size > 0 && (
            <div className='absolute bottom-1.5 left-1.5 text-xs bg-black/70 text-white px-1.5 py-0.5 rounded'>
              {fmtSize(file.size)}
            </div>
          )}
          {!!file.duration && (
            <div className='absolute bottom-1.5 right-1.5 text-xs bg-black/80 text-white px-1.5 py-0.5 rounded'>
              {fmtDuration(file.duration)}
            </div>
          )}
          {(file.isVideo || file.isAudio) && (
            <div className='absolute inset-0 flex items-center justify-center opacity-0
                            group-hover:opacity-100 transition-opacity bg-black/20'>
              <div className='w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center text-lg text-black'>▶</div>
            </div>
          )}
        </div>

        {/* Title + 4 icon buttons */}
        <div className='flex flex-col flex-1 p-2 gap-1.5'>
          <p className='text-sm font-semibold leading-tight line-clamp-2 break-all flex-1'
            title={file.name}>
            {displayName}
          </p>
          <div className='flex items-center gap-1'>
            {/* 删除 */}
            <Button type='button' size='icon' variant='outline'
              className={`h-7 w-7 shrink-0 text-base text-error-foreground ${btn}`}
              title='删除文件（移到Recycle）'
              onClick={e => { e.stopPropagation(); setOpenDelete(true); }}>
              <MdOutlineVideocamOff />
            </Button>
            {/* 改文件名 */}
            <Button type='button' size='icon' variant='outline'
              className={`h-7 w-7 shrink-0 text-base ${btn}`}
              title='改文件名'
              onClick={e => { e.stopPropagation(); setOpenRename(true); }}>
              <MdEdit />
            </Button>
            {/* 移动 */}
            <Button type='button' size='icon' variant='outline'
              className={`h-7 w-7 shrink-0 text-base ${btn}`}
              title='移动到其他文件夹'
              onClick={e => { e.stopPropagation(); setOpenMove(true); }}>
              <MdDriveFileMove />
            </Button>
            {/* 下载 */}
            <Button type='button' size='sm' variant='outline'
              className={`flex-1 h-7 text-base p-0 ${btn}`}
              title='下载到本地'
              onClick={e => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = getStreamUrl(file) + '&download=true';
                a.download = file.name;
                a.click();
              }}>
              <MdFileDownload />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>删除文件</DialogTitle></DialogHeader>
          <p className='text-sm text-muted-foreground break-all'>{file.name}</p>
          <DialogFooter className='flex flex-row justify-end gap-2'>
            <Button variant='outline' size='sm' onClick={() => setOpenDelete(false)}>取消</Button>
            <Button size='sm' className='bg-error hover:bg-error/90 text-foreground'
              onClick={handleDelete} disabled={deleting}>
              {deleting ? '处理中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <RenameDialog
        open={openRename}
        onClose={() => setOpenRename(false)}
        target={file}
        shareName={shareName}
        pwd={pwd}
        onDone={onRenamed}
      />

      {/* Move dialog */}
      <MoveDialog
        open={openMove}
        onClose={() => setOpenMove(false)}
        target={file}
        shareName={shareName}
        pwd={pwd}
        onDone={onMoved}
      />
    </>
  );
}
