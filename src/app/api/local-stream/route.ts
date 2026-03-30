import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ALLOWED_BASES = ['/downloads', '/additional-browse'];

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
    mov: 'video/quicktime', avi: 'video/x-msvideo', flv: 'video/x-flv',
    m4v: 'video/mp4', ts: 'video/mp2t',
  };
  return map[ext] || 'video/mp4';
}

export async function GET(request: Request) {
  try {
    const urlObject = new URL(request.url);
    const filePath = urlObject.searchParams.get('path');
    const isDownload = urlObject.searchParams.get('download') === 'true';

    if (!filePath) {
      return new Response('Missing path parameter', { status: 400 });
    }

    // Normalize but keep the original for path traversal check
    // Use startsWith check on segments, not string contains,
    // to avoid false positive on filenames with ".." in them
    const normalized = path.resolve(filePath);

    // Security: resolved path must be under an allowed base
    const isAllowed = ALLOWED_BASES.some(
      (base) => normalized === base || normalized.startsWith(base + '/')
    );
    if (!isAllowed) {
      return new Response('Path not allowed: ' + normalized, { status: 403 });
    }

    let stat;
    try {
      stat = await fs.stat(normalized);
    } catch {
      return new Response('File not found: ' + normalized, { status: 404 });
    }

    const fileSize = stat.size;
    const mimeType = getMimeType(normalized);
    const fileName = path.basename(normalized);
    const range = request.headers.get('range');
    const disposition = isDownload
      ? `attachment; filename*=utf-8''${encodeURIComponent(fileName)}`
      : `inline; filename*=utf-8''${encodeURIComponent(fileName)}`;

    if (range && !isDownload) {
      const CHUNK_SIZE = 1024 * 1024 * 2;
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1]
        ? Math.min(parseInt(parts[1], 10), fileSize - 1)
        : Math.min(start + CHUNK_SIZE, fileSize - 1);
      const chunkSize = end - start + 1;
      const file = await fs.open(normalized, 'r');
      const stream = file.createReadStream({ start, end });
      return new Response(stream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': `${chunkSize}`,
          'Content-Type': mimeType,
          'Content-Disposition': disposition,
        },
      });
    }

    const file = await fs.open(normalized, 'r');
    const stream = file.createReadStream();
    return new Response(stream as any, {
      status: 200,
      headers: {
        'Content-Length': `${fileSize}`,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': disposition,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}