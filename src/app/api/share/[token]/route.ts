import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_PATH } from '@/server/constants';

export const dynamic = 'force-dynamic';
const SHARE_RECORDS_FILE = path.join(CONFIG_PATH, 'share-records.json');

type ShareRecord = {
  id: string; fileName: string; filePath: string; url: string;
  createdAt: number; expiresAt: number | null; password?: string;
};

async function loadRecords(): Promise<ShareRecord[]> {
  try { return JSON.parse(await fs.readFile(SHARE_RECORDS_FILE, 'utf-8')); }
  catch { return []; }
}

async function streamFile(filePath: string, fileName: string, request: NextRequest) {
  const stat = await fs.stat(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm'
    : ext === 'mkv' ? 'video/x-matroska' : ext === 'mp3' ? 'audio/mpeg'
    : ext === 'm4a' ? 'audio/mp4' : 'application/octet-stream';
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
    'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
  }});
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const records = await loadRecords();
  const record = records.find(r => r.id === params.token);
  if (!record) return NextResponse.json({ error: '链接无效或已被删除' }, { status: 404 });
  if (record.expiresAt && record.expiresAt < Date.now())
    return NextResponse.json({ error: '分享链接已过期' }, { status: 410 });

  const pwd = request.nextUrl.searchParams.get('pwd');
  const stream = request.nextUrl.searchParams.get('stream');

  // 密码验证
  if (record.password) {
    if (!pwd) return NextResponse.json({
      requirePassword: true, fileName: record.fileName, expiresAt: record.expiresAt
    }, { status: 401 });
    if (pwd !== record.password) return NextResponse.json({ error: '密码错误' }, { status: 403 });
  }

  // ?stream=1 才返回文件流
  if (stream === '1') {
    try { return await streamFile(record.filePath, record.fileName, request); }
    catch { return NextResponse.json({ error: '文件不存在' }, { status: 500 }); }
  }

  // 默认返回文件信息 JSON
  return NextResponse.json({
    fileName: record.fileName,
    expiresAt: record.expiresAt,
    streamUrl: `/api/share/${params.token}?stream=1${record.password && pwd ? `&pwd=${encodeURIComponent(pwd)}` : ''}`,
  });
}

// POST - 验证密码
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const records = await loadRecords();
  const record = records.find(r => r.id === params.token);
  if (!record) return NextResponse.json({ error: '链接无效' }, { status: 404 });
  if (record.expiresAt && record.expiresAt < Date.now())
    return NextResponse.json({ error: '链接已过期' }, { status: 410 });
  const { password } = await request.json().catch(() => ({}));
  if (record.password && password !== record.password)
    return NextResponse.json({ error: '密码错误' }, { status: 403 });
  return NextResponse.json({
    valid: true, fileName: record.fileName, expiresAt: record.expiresAt,
    streamUrl: `/api/share/${params.token}?stream=1${record.password ? `&pwd=${encodeURIComponent(password)}` : ''}`,
  });
}