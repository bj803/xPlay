import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { CacheHelper } from '@/server/helpers/CacheHelper';
import { VIDEO_LIST_FILE, CONFIG_PATH } from '@/server/constants';
import type { VideoInfo } from '@/types/video';

export const dynamic = 'force-dynamic';

const ALLOWED_PATHS = ['/downloads', '/additional-browse'];
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.m4v', '.ts']);
const FAVORITES_CACHE_FILE = path.join(CONFIG_PATH, 'favorites-cache.json');

type LocalVideoFile = {
  name: string;
  path: string;
  size: number;
  mtime: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  codecName: string | null;
  fps: number | null;
  title?: string | null;
  thumbnail?: string | null;
};

type FavoritesCache = Record<string, {
  duration: number | null;
  width: number | null;
  height: number | null;
  codecName: string | null;
  fps: number | null;
  cachedAt: number;
}>;

async function loadFavoritesCache(): Promise<FavoritesCache> {
  try {
    const raw = await fs.readFile(FAVORITES_CACHE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return {}; }
}

async function saveFavoritesCache(cache: FavoritesCache): Promise<void> {
  try {
    await fs.mkdir(CONFIG_PATH, { recursive: true });
    await fs.writeFile(FAVORITES_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {}
}

async function buildYtDlpFileIndex(): Promise<Map<string, VideoInfo>> {
  const index = new Map<string, VideoInfo>();
  try {
    const uuids: string[] = (await CacheHelper.get<string[]>(VIDEO_LIST_FILE)) || [];
    const videos = await Promise.all(uuids.map((uuid) => CacheHelper.get<VideoInfo>(uuid)));
    for (const video of videos) {
      if (video?.file?.path) index.set(video.file.path, video);
    }
  } catch {}
  return index;
}

async function getFFprobeInfo(filePath: string) {
  return new Promise<{
    duration: number | null; width: number | null;
    height: number | null; codecName: string | null; fps: number | null;
  }>((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,r_frame_rate,duration',
      '-show_entries', 'format=duration', '-of', 'json', filePath,
    ]);
    let stdout = '';
    ffprobe.stdout.setEncoding('utf-8');
    ffprobe.stdout.on('data', (d) => { stdout += d; });
    const done = () => {
      try {
        const json = JSON.parse(stdout);
        const stream = json?.streams?.[0];
        const rawDuration = stream?.duration || json?.format?.duration;
        const duration = rawDuration ? parseFloat(rawDuration) : null;
        const [num, den] = (stream?.r_frame_rate || '').split('/');
        const fps = num && den ? Math.round((parseInt(num) / parseInt(den)) * 10) / 10 : null;
        resolve({ duration, width: stream?.width || null, height: stream?.height || null, codecName: stream?.codec_name || null, fps });
      } catch { resolve({ duration: null, width: null, height: null, codecName: null, fps: null }); }
    };
    ffprobe.on('close', done);
    ffprobe.on('error', () => resolve({ duration: null, width: null, height: null, codecName: null, fps: null }));
    setTimeout(() => { try { ffprobe.kill(); } catch {} resolve({ duration: null, width: null, height: null, codecName: null, fps: null }); }, 5000);
  });
}

export async function GET(request: Request) {
  try {
    const urlObject = new URL(request.url);
    const reqPath = urlObject.searchParams.get('path') || '/downloads';
    const isSingle = urlObject.searchParams.get('single') === 'true';
    const listDirs = urlObject.searchParams.get('listDirs') === 'true';

    const normalized = path.normalize(reqPath);
    const isAllowed = ALLOWED_PATHS.some(
      (base) => normalized === base || normalized.startsWith(base + '/')
    );
    if (!isAllowed) {
      return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
    }

    // Only return subdirectory list (for navigation)
    if (listDirs) {
      try {
        await fs.access(normalized);
      } catch {
        return NextResponse.json({ subdirs: [] });
      }
      const entries = await fs.readdir(normalized, { withFileTypes: true });
      const subdirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({ name: e.name, path: path.join(normalized, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      return NextResponse.json({ subdirs });
    }

    // Single file metadata query (lazy loading)
    if (isSingle) {
      try {
        const stat = await fs.stat(normalized);
        const ytIndex = await buildYtDlpFileIndex();
        const ytInfo = ytIndex.get(normalized);
        if (ytInfo?.file) {
          const file: LocalVideoFile = {
            name: path.basename(normalized), path: normalized,
            size: stat.size, mtime: stat.mtime.toISOString(),
            duration: (ytInfo.file as any).duration ? parseFloat(String((ytInfo.file as any).duration)) : null,
            width: (ytInfo.file as any).width ?? null,
            height: (ytInfo.file as any).height ?? null,
            codecName: (ytInfo.file as any).codecName ?? null,
            fps: (ytInfo.file as any).fps ?? null,
            title: ytInfo.title, thumbnail: ytInfo.thumbnail,
          };
          return NextResponse.json({ path: normalized, files: [file] });
        }
        const favCache = await loadFavoritesCache();
        if (favCache[normalized]) {
          return NextResponse.json({ path: normalized, files: [{ name: path.basename(normalized), path: normalized, size: stat.size, mtime: stat.mtime.toISOString(), ...favCache[normalized] }] });
        }
        const meta = await getFFprobeInfo(normalized);
        favCache[normalized] = { ...meta, cachedAt: Date.now() };
        saveFavoritesCache(favCache);
        return NextResponse.json({ path: normalized, files: [{ name: path.basename(normalized), path: normalized, size: stat.size, mtime: stat.mtime.toISOString(), ...meta }] });
      } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 404 });
      }
    }

    // Directory listing
    try {
      await fs.access(normalized);
    } catch {
      return NextResponse.json({ path: normalized, files: [], subdirs: [], error: 'Directory not found or not mounted' });
    }

    const entries = await fs.readdir(normalized, { withFileTypes: true });

    const subdirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name, path: path.join(normalized, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    const videoEntries = entries.filter((e) => {
      if (e.isDirectory()) return false;
      return VIDEO_EXTS.has(path.extname(e.name).toLowerCase());
    });

    const withStats = await Promise.all(
      videoEntries.map(async (e) => {
        const fullPath = path.join(normalized, e.name);
        try {
          const stat = await fs.stat(fullPath);
          return { name: e.name, path: fullPath, size: stat.size, mtime: stat.mtime.toISOString() };
        } catch {
          return { name: e.name, path: fullPath, size: 0, mtime: new Date(0).toISOString() };
        }
      })
    );
    withStats.sort((a, b) => b.mtime.localeCompare(a.mtime));

    const [ytIndex, favCache] = await Promise.all([buildYtDlpFileIndex(), loadFavoritesCache()]);
    const newFavEntries: FavoritesCache = {};
    const files: LocalVideoFile[] = [];

    for (const f of withStats) {
      const ytInfo = ytIndex.get(f.path);
      if (ytInfo?.file) {
        files.push({
          ...f,
          duration: (ytInfo.file as any).duration ? parseFloat(String((ytInfo.file as any).duration)) : null,
          width: (ytInfo.file as any).width ?? null,
          height: (ytInfo.file as any).height ?? null,
          codecName: (ytInfo.file as any).codecName ?? null,
          fps: (ytInfo.file as any).fps ?? null,
          title: ytInfo.title, thumbnail: ytInfo.thumbnail,
        });
        continue;
      }
      if (favCache[f.path]) { files.push({ ...f, ...favCache[f.path] }); continue; }
      files.push({ ...f, duration: null, width: null, height: null, codecName: null, fps: null });
    }

    const uncached = files.filter((f) => f.duration === null && !ytIndex.has(f.path) && !favCache[f.path]);
    if (uncached.length > 0) {
      (async () => {
        const BATCH = 4;
        for (let i = 0; i < uncached.length; i += BATCH) {
          await Promise.all(uncached.slice(i, i + BATCH).map(async (f) => {
            const meta = await getFFprobeInfo(f.path);
            newFavEntries[f.path] = { ...meta, cachedAt: Date.now() };
          }));
        }
        if (Object.keys(newFavEntries).length > 0) {
          await saveFavoritesCache({ ...favCache, ...newFavEntries });
        }
      })();
    }

    return NextResponse.json({ path: normalized, subdirs, files });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}