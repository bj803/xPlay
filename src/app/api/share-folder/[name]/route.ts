import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_PATH } from '@/server/constants';

export const dynamic = 'force-dynamic';

const SHARE_ROOT = process.env.SHARE_ROOT || '/additional-browse/Share';
const RECYCLE = path.join(SHARE_ROOT, 'Recycle');
const FOLDERS_CONFIG = path.join(CONFIG_PATH, 'share-folders.json');

type FolderConfig = { password?: string; title?: string; };
type FoldersConfig = Record<string, FolderConfig>;

async function loadConfig(): Promise<FoldersConfig> {
  try { return JSON.parse(await fs.readFile(FOLDERS_CONFIG, 'utf-8')); }
  catch { return {}; }
}

async function getFileInfo(filePath: string) {
  const stat = await fs.stat(filePath);
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase().slice(1);
  const isVideo = ['mp4','webm','mkv','mov','avi','m4v'].includes(ext);
  const isAudio = ['mp3','m4a','aac','flac','wav','ogg'].includes(ext);
  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  return {
    name, path: filePath, size: stat.size,
    isDir: stat.isDirectory(), isVideo, isAudio, isImage,
    ext, mtime: stat.mtimeMs,
  };
}

export async function GET(request: NextRequest, { params }: { params: { name: string } }) {
  const { name } = params;
  const config = await loadConfig();
  const folderConfig = config[name];
  const folderPath = path.join(SHARE_ROOT, name);

  // 禁止访问 Recycle
  if (name === 'Recycle' || name.startsWith('.')) {
    return NextResponse.json({ error: '共享文件夹不存在' }, { status: 404 });
  }
  // 禁止访问 Recycle
  if (name === 'Recycle' || name.startsWith('.')) {
    return NextResponse.json({ error: '共享文件夹不存在' }, { status: 404 });
  }
  // 检查目录是否存在
  try { await fs.access(folderPath); } catch {
    return NextResponse.json({ error: '共享文件夹不存在' }, { status: 404 });
  }

  // 密码验证
  const pwd = request.nextUrl.searchParams.get('pwd');
  if (folderConfig?.password) {
    if (!pwd) return NextResponse.json({
      requirePassword: true, name, title: folderConfig.title || name
    }, { status: 401 });
    if (pwd !== folderConfig.password)
      return NextResponse.json({ error: '密码错误' }, { status: 403 });
  }

  // 子目录浏览
  const sub = request.nextUrl.searchParams.get('sub') || '';
  const targetPath = sub ? path.join(folderPath, sub) : folderPath;

  // 安全检查：不能跳出 folderPath
  if (!targetPath.startsWith(folderPath)) {
    return NextResponse.json({ error: '无效路径' }, { status: 400 });
  }

  try {
    const entries = await fs.readdir(targetPath);
    const files = await Promise.all(
      entries.filter(e => !e.startsWith('.') && e !== 'Recycle').map(async e => {
        try { return await getFileInfo(path.join(targetPath, e)); }
        catch { return null; }
      })
    );
    const sorted = files.filter(Boolean).sort((a: any, b: any) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh');
    });

    return NextResponse.json({
      name, title: folderConfig?.title || name,
      sub, files: sorted, hasPassword: !!folderConfig?.password,
    });
  } catch {
    return NextResponse.json({ error: '无法读取目录' }, { status: 500 });
  }
}

// DELETE - 移到 Recycle
export async function DELETE(request: NextRequest, { params }: { params: { name: string } }) {
  const { name } = params;
  const folderPath = path.join(SHARE_ROOT, name);
  const body = await request.json().catch(() => ({}));
  const { filePath, pwd } = body;

  const config = await loadConfig();
  const folderConfig = config[name];
  if (folderConfig?.password && pwd !== folderConfig.password) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  if (!filePath || !filePath.startsWith(folderPath)) {
    return NextResponse.json({ error: '无效路径' }, { status: 400 });
  }

  try {
    await fs.mkdir(RECYCLE, { recursive: true });
    const dest = path.join(RECYCLE, path.basename(filePath));
    await fs.rename(filePath, dest);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}