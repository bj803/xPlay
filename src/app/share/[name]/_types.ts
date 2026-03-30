// Shared types for share/[name] components
export type FileItem = {
  name: string; path: string; size: number; isDir: boolean;
  isVideo: boolean; isAudio: boolean; isImage: boolean; ext: string; mtime: number;
  duration?: number; thumbnail?: string;
  width?: number; height?: number; fps?: number; codecName?: string;
};

export type DirNode = { path: string; name: string; children: DirNode[]; hasChildren: boolean };

export function fmtSize(b: number) {
  if (!b) return '';
  if (b > 1073741824) return (b / 1073741824).toFixed(1) + 'GB';
  if (b > 1048576) return (b / 1048576).toFixed(1) + 'MB';
  return (b / 1024).toFixed(0) + 'KB';
}

export function fmtDuration(s: number) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(1, '0')}:${String(sec).padStart(2, '0')}`;
}

export const GRID_CLASSES: Record<number, string> = {
  2: 'grid grid-cols-2 gap-3',
  3: 'grid grid-cols-2 sm:grid-cols-3 gap-3',
  4: 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3',
  5: 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3',
};
