import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_PATH } from '@/server/constants';

export const dynamic = 'force-dynamic';

const SHARE_ROOT = process.env.SHARE_ROOT || '/additional-browse/Share';
const FOLDERS_CONFIG = path.join(CONFIG_PATH, 'share-folders.json');

async function loadConfig() {
  try { return JSON.parse(await fs.readFile(FOLDERS_CONFIG, 'utf-8')); }
  catch { return {}; }
}

export async function GET(request: NextRequest, { params }: { params: { name: string } }) {
  const { name } = params;
  const folderPath = path.join(SHARE_ROOT, name);
  const filePath = request.nextUrl.searchParams.get('path') || '';
  const pwd = request.nextUrl.searchParams.get('pwd') || '';

  if (!filePath || !filePath.startsWith(folderPath)) {
    return NextResponse.json({ error: '无效路径' }, { status: 400 });
  }

  const config = await loadConfig();
  const folderConfig = config[name];
  if (folderConfig?.password && pwd !== folderConfig.password) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  try {
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm'
      : ext === 'mkv' ? 'video/x-matroska' : ext === 'mp3' ? 'audio/mpeg'
      : ext === 'm4a' ? 'audio/mp4' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif'
      : 'application/octet-stream';

    const range = request.headers.get('range');
    if (range) {
      const [s, e] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(s, 10);
      const end = e ? parseInt(e, 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const fh = await fs.open(filePath, 'r');
      const buf = Buffer.alloc(chunkSize);
      await fh.read(buf, 0, chunkSize, start);
      await fh.close();
      return new NextResponse(buf, { status: 206, headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes', 'Content-Length': String(chunkSize),
        'Content-Type': mime, 'Cache-Control': 'no-cache',
      }});
    }

    const buf = await fs.readFile(filePath);
    return new NextResponse(buf, { status: 200, headers: {
      'Content-Length': String(fileSize), 'Content-Type': mime,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
    }});
  } catch {
    return NextResponse.json({ error: '文件不存在' }, { status: 500 });
  }
}