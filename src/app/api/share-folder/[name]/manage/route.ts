import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SHARE_ROOT = process.env.SHARE_ROOT || '/additional-browse/Share';

async function getShareConfig(shareName: string): Promise<{ password?: string; title?: string } | null> {
  try {
    const CONFIG_PATH = process.env.CONFIG_PATH || '/config';
    const cfg = JSON.parse(await fs.readFile(path.join(CONFIG_PATH, 'share-folders.json'), 'utf-8'));
    return cfg[shareName] || {};
  } catch {
    return {};
  }
}

function safePath(base: string, rel: string): string | null {
  const resolved = path.resolve(base, rel);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

// POST /api/share-folder/[name]/manage
export async function POST(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const shareName = params.name;
  const shareDir = path.join(SHARE_ROOT, shareName);
  const recycleDir = path.join(SHARE_ROOT, 'Recycle');

  let body: any = {};
  try { body = await request.json(); } catch {}

  const { action, pwd, filePath, newName, destDir, subDir, password } = body;

  // Auth check
  const cfg = await getShareConfig(shareName);
  if (cfg?.password && cfg.password !== pwd) {
    return NextResponse.json({ error: '密码错误' }, { status: 403 });
  }

  try {
    // ── delete: move to Recycle (no suffix, no confirm needed from backend)
    if (action === 'delete') {
      if (!filePath) return NextResponse.json({ error: 'Missing filePath' }, { status: 400 });
      const src = safePath(shareDir, path.isAbsolute(filePath) ? path.relative(shareDir, filePath) : filePath);
      if (!src) return NextResponse.json({ error: '路径非法' }, { status: 400 });
      await fs.mkdir(recycleDir, { recursive: true });
      // Use plain filename — no timestamp suffix
      let dest = path.join(recycleDir, path.basename(src));
      // If file with same name already exists in Recycle, add a counter
      let counter = 1;
      while (true) {
        try { await fs.access(dest); dest = path.join(recycleDir, path.basename(src) + `_${counter++}`); }
        catch { break; }
      }
      await fs.rename(src, dest);
      return NextResponse.json({ success: true });
    }

    // ── rename ───────────────────────────────────────────────
    if (action === 'rename') {
      if (!filePath || !newName) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
      if (newName.includes('/') || newName.includes('\\') || newName === '..' || newName === '.')
        return NextResponse.json({ error: '文件名非法' }, { status: 400 });
      const src = safePath(shareDir, path.isAbsolute(filePath) ? path.relative(shareDir, filePath) : filePath);
      if (!src) return NextResponse.json({ error: '路径非法' }, { status: 400 });
      const dest = path.join(path.dirname(src), newName);
      // dest must still be inside shareDir
      if (!dest.startsWith(shareDir + path.sep) && dest !== shareDir)
        return NextResponse.json({ error: '路径非法' }, { status: 400 });
      await fs.rename(src, dest);
      return NextResponse.json({ success: true });
    }

    // ── move (within share folder) ───────────────────────────
    if (action === 'move') {
      if (!filePath) return NextResponse.json({ error: 'Missing filePath' }, { status: 400 });
      const src = safePath(shareDir, path.isAbsolute(filePath) ? path.relative(shareDir, filePath) : filePath);
      if (!src) return NextResponse.json({ error: '路径非法' }, { status: 400 });
      // destDir is relative to shareDir root ('' = root, 'subFolder' = shareDir/subFolder)
      const destFolder = destDir
        ? safePath(shareDir, destDir)
        : shareDir;
      if (!destFolder) return NextResponse.json({ error: '目标路径非法' }, { status: 400 });
      await fs.mkdir(destFolder, { recursive: true });
      const dest = path.join(destFolder, path.basename(src));
      if (src === dest) return NextResponse.json({ error: '源和目标相同' }, { status: 400 });
      await fs.rename(src, dest);
      return NextResponse.json({ success: true });
    }

    // ── mkdir ────────────────────────────────────────────────
    if (action === 'mkdir') {
      if (!subDir)
        return NextResponse.json({ error: '文件夹名不能为空' }, { status: 400 });
      // subDir can be 'newFolder' or '88/newFolder' (nested) — validate with safePath
      // Reject traversal attempts like '../' but allow '88/55'
      const targetDir = safePath(shareDir, subDir);
      if (!targetDir)
        return NextResponse.json({ error: '路径非法' }, { status: 400 });
      // Each segment must not be empty, '.', or '..'
      const segments = subDir.split('/');
      for (const seg of segments) {
        if (!seg || seg === '.' || seg === '..')
          return NextResponse.json({ error: '文件夹名非法' }, { status: 400 });
      }
      await fs.mkdir(targetDir, { recursive: true });
      return NextResponse.json({ success: true });
    }

    // ── set_password ─────────────────────────────────────────
    if (action === 'set_password') {
      const CONFIG_PATH = process.env.CONFIG_PATH || '/config';
      const cfgFile = path.join(CONFIG_PATH, 'share-folders.json');
      let allCfg: any = {};
      try { allCfg = JSON.parse(await fs.readFile(cfgFile, 'utf-8')); } catch {}
      allCfg[shareName] = { ...allCfg[shareName], password: password || undefined };
      await fs.writeFile(cfgFile, JSON.stringify(allCfg, null, 2), 'utf-8');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT /api/share-folder/[name]/manage  → file upload
export async function PUT(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const shareName = params.name;
  const shareDir = path.join(SHARE_ROOT, shareName);

  const url = new URL(request.url);
  const pwd = url.searchParams.get('pwd') || '';
  const filename = url.searchParams.get('filename') || 'upload';
  const subDir = url.searchParams.get('subDir') || '';

  const cfg = await getShareConfig(shareName);
  if (cfg?.password && cfg.password !== pwd) {
    return NextResponse.json({ error: '密码错误' }, { status: 403 });
  }

  if (filename.includes('/') || filename.includes('\\') || filename === '..' || filename === '.')
    return NextResponse.json({ error: '文件名非法' }, { status: 400 });

  try {
    // Target directory: shareDir root, or shareDir/subDir (can be nested like '88')
    let targetDir = shareDir;
    if (subDir) {
      const resolved = safePath(shareDir, subDir);
      if (!resolved) return NextResponse.json({ error: '路径非法' }, { status: 400 });
      // Each segment must be a real name
      const segments = subDir.split('/');
      for (const seg of segments) {
        if (!seg || seg === '.' || seg === '..')
          return NextResponse.json({ error: '路径非法' }, { status: 400 });
      }
      targetDir = resolved;
    }
    await fs.mkdir(targetDir, { recursive: true });
    const dest = path.join(targetDir, filename);
    const buf = await request.arrayBuffer();
    await fs.writeFile(dest, Buffer.from(buf));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
