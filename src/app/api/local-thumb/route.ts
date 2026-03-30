import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_BASES = ['/downloads', '/additional-browse'];
const THUMB_CACHE_DIR = '/cache/thumbnails/local';

function pathHash(filePath: string): string {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

// Try to extract a frame at the given seek time; returns true on success
async function tryExtractFrame(videoPath: string, thumbPath: string, seekSec: number): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [
      '-y',
      '-ss', String(seekSec),
      '-i', videoPath,
      '-vframes', '1',
      '-vf', 'scale=480:-2',   // wider thumbnail, better quality
      '-q:v', '4',
      thumbPath,
    ];
    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.setEncoding('utf-8');
    ffmpeg.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => {
      try { ffmpeg.kill(); } catch {}
      resolve(false);
    }, 8000);
    ffmpeg.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    ffmpeg.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

// Get video duration in seconds
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
    ffprobe.stdout.on('data', (d) => { out += d; });
    ffprobe.on('close', () => {
      const dur = parseFloat(out.trim());
      resolve(isNaN(dur) ? 0 : dur);
    });
    ffprobe.on('error', () => resolve(0));
    setTimeout(() => { try { ffprobe.kill(); } catch {} resolve(0); }, 5000);
  });
}

export async function GET(request: Request) {
  try {
    const urlObject = new URL(request.url);
    const filePath = urlObject.searchParams.get('path');

    if (!filePath) {
      return new Response('Missing path', { status: 400 });
    }

    const normalized = path.resolve(filePath);
    const isAllowed = ALLOWED_BASES.some(
      (base) => normalized === base || normalized.startsWith(base + '/')
    );
    if (!isAllowed) {
      return new Response('Path not allowed', { status: 403 });
    }

    await fs.mkdir(THUMB_CACHE_DIR, { recursive: true });

    const hash = pathHash(normalized);
    const thumbPath = path.join(THUMB_CACHE_DIR, `${hash}.jpg`);

    // Serve cached thumbnail if valid (size > 1KB)
    try {
      const stat = await fs.stat(thumbPath);
      if (stat.size > 1024) {
        const file = await fs.open(thumbPath, 'r');
        const stream = file.createReadStream();
        return new Response(stream as any, {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            // Cache 7 days in browser, 1 day with revalidation
            'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
            'ETag': `"${hash}-${stat.mtimeMs}"`,
          },
        });
      }
    } catch {
      // Not cached yet
    }

    // Check source file exists
    try {
      await fs.stat(normalized);
    } catch {
      return new Response('Source file not found', { status: 404 });
    }

    // Get duration to pick a good seek point (10% into video, clamped 1-30s)
    const duration = await getVideoDuration(normalized);
    const seekPoints = duration > 0
      ? [
          Math.min(Math.max(duration * 0.1, 1), 30),  // 10% in
          Math.min(Math.max(duration * 0.05, 1), 10), // 5% in
          1,                                            // 1 second
        ]
      : [5, 1]; // fallback if duration unknown

    // Try each seek point until one works
    let success = false;
    for (const seek of seekPoints) {
      success = await tryExtractFrame(normalized, thumbPath, seek);
      if (success) break;
    }

    if (!success) {
      // Last resort: no seek (first keyframe)
      success = await tryExtractFrame(normalized, thumbPath, 0);
    }

    if (!success) {
      return new Response('Thumbnail generation failed', { status: 500 });
    }

    // Verify output file is valid
    try {
      const stat = await fs.stat(thumbPath);
      if (stat.size < 100) {
        await fs.unlink(thumbPath).catch(() => {});
        return new Response('Thumbnail too small', { status: 500 });
      }
    } catch {
      return new Response('Thumbnail not created', { status: 500 });
    }

    const file = await fs.open(thumbPath, 'r');
    const stream = file.createReadStream();
    return new Response(stream as any, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        'ETag': `"${hash}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const urlObject = new URL(request.url);
    const filePath = urlObject.searchParams.get('path');
    if (!filePath) return NextResponse.json({ success: false });
    const hash = pathHash(path.resolve(filePath));
    const thumbPath = path.join(THUMB_CACHE_DIR, `${hash}.jpg`);
    try { await fs.unlink(thumbPath); } catch {}
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}
