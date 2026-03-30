import { CACHE_PATH, CACHE_FILE_PREFIX, DOWNLOAD_PATH } from '@/server/constants';
import { CacheHelper } from '@/server/helpers/CacheHelper';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ]);
    let out = '';
    ffprobe.stdout.setEncoding('utf-8');
    ffprobe.stdout.on('data', (d: string) => { out += d; });
    ffprobe.on('close', () => {
      const dur = parseFloat(out.trim());
      resolve(isNaN(dur) ? 0 : dur);
    });
    ffprobe.on('error', () => resolve(0));
    setTimeout(() => { try { ffprobe.kill(); } catch {} resolve(0); }, 5000);
  });
}

async function tryExtractFrame(videoPath: string, thumbPath: string, seekSec: number): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [
      '-y',
      '-ss', String(seekSec),
      '-i', videoPath,
      '-vframes', '1',
      '-vf', 'scale=480:-2',
      '-q:v', '4',
      thumbPath,
    ];
    const ffmpeg = spawn('ffmpeg', args);
    const timer = setTimeout(() => { try { ffmpeg.kill(); } catch {} resolve(false); }, 10000);
    ffmpeg.on('close', (code: number | null) => { clearTimeout(timer); resolve(code === 0); });
    ffmpeg.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

async function generateThumbnail(videoPath: string, thumbPath: string): Promise<boolean> {
  const duration = await getVideoDuration(videoPath);
  const seekPoints = duration > 0
    ? [Math.min(Math.max(duration * 0.1, 1), 30), Math.min(Math.max(duration * 0.05, 1), 10), 1]
    : [5, 1];

  for (const seek of seekPoints) {
    const ok = await tryExtractFrame(videoPath, thumbPath, seek);
    if (ok) {
      try {
        const stat = await fs.stat(thumbPath);
        if (stat.size > 1024) return true;
        await fs.unlink(thumbPath).catch(() => {});
      } catch {}
    }
  }
  // Last resort: first keyframe
  return tryExtractFrame(videoPath, thumbPath, 0);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const uuid = url.searchParams.get('uuid');

    if (!uuid) return new Response('Missing uuid', { status: 400 });

    const data = await CacheHelper.get<any>(uuid);
    if (!data) return new Response('Not Found', { status: 404 });

    const thumbDir = `${CACHE_PATH}/thumbnails`;
    const thumbFile = `${CACHE_FILE_PREFIX}${uuid}.jpg`;
    const thumbPath = `${thumbDir}/${thumbFile}`;

    // Serve cached thumbnail if valid
    try {
      const stat = await fs.stat(thumbPath);
      if (stat.size > 1024) {
        const fileHandle = await fs.open(thumbPath, 'r');
        const stream = fileHandle.createReadStream();
        return new Response(stream as any, {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
          },
        });
      }
    } catch {}

    // Find video file path — try cache data first, then reconstruct from filename
    let videoPath: string | null = data.file?.path || null;
    if (!videoPath && data.file?.name) {
      videoPath = path.join(DOWNLOAD_PATH, data.file.name);
    }
    if (!videoPath) return new Response('No video file path', { status: 404 });

    // Check video file exists
    try {
      await fs.access(videoPath);
    } catch {
      return new Response('Video file not found', { status: 404 });
    }

    await fs.mkdir(thumbDir, { recursive: true });

    const ok = await generateThumbnail(videoPath, thumbPath);
    if (!ok) return new Response('Failed to generate thumbnail', { status: 500 });

    // Update cache
    data.localThumbnail = thumbFile;
    data.updatedAt = Date.now();
    await CacheHelper.set(uuid, data);

    const fileHandle = await fs.open(thumbPath, 'r');
    const stream = fileHandle.createReadStream();
    return new Response(stream as any, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
      },
    });

  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const uuid = url.searchParams.get('uuid');
    if (!uuid) return new Response('Missing uuid', { status: 400 });
    const thumbPath = `${CACHE_PATH}/thumbnails/${CACHE_FILE_PREFIX}${uuid}.jpg`;
    await fs.unlink(thumbPath).catch(() => {});
    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}
