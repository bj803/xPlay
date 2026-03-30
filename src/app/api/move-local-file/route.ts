import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const FAVORITES_BASE = '/additional-browse';
const ROOT_CONTAINER = '/shortvideo-root';
const FAVORITES_SUBDIR = '00Keep';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { srcPath, targetSubdir } = body;

    if (!srcPath) {
      return NextResponse.json({ success: false, error: 'Missing srcPath' }, { status: 400 });
    }

    const normalizedSrc = path.normalize(srcPath);

    // Source must be within /additional-browse
    if (!normalizedSrc.startsWith(FAVORITES_BASE + '/')) {
      return NextResponse.json({ success: false, error: 'Source not in favorites' }, { status: 400 });
    }

    // Determine destination directory
    let destDir = FAVORITES_BASE;
    if (targetSubdir) {
      const normalized = path.normalize(path.join(FAVORITES_BASE, targetSubdir));
      if (!normalized.startsWith(FAVORITES_BASE)) {
        return NextResponse.json({ success: false, error: 'Invalid target directory' }, { status: 400 });
      }
      destDir = normalized;
    }

    const fileName = path.basename(normalizedSrc);
    let destPath = path.join(destDir, fileName);

    // Don't move to same location
    if (normalizedSrc === destPath) {
      return NextResponse.json({ success: false, error: 'Source and destination are the same' }, { status: 400 });
    }

    // Handle duplicate filename
    try {
      await fs.access(destPath);
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      destPath = path.join(destDir, `${base}_${Date.now()}${ext}`);
    } catch {
      // Destination doesn't exist, good
    }

    // Try rename via /shortvideo-root (same filesystem)
    let useRoot = false;
    try {
      await fs.access(ROOT_CONTAINER);
      useRoot = true;
    } catch {}

    await fs.mkdir(destDir, { recursive: true });

    if (useRoot) {
      const srcReal = normalizedSrc.replace(FAVORITES_BASE, `${ROOT_CONTAINER}/${FAVORITES_SUBDIR}`);
      const destReal = destPath.replace(FAVORITES_BASE, `${ROOT_CONTAINER}/${FAVORITES_SUBDIR}`);
      await fs.mkdir(path.dirname(destReal), { recursive: true });
      try {
        await fs.rename(srcReal, destReal);
      } catch (e: any) {
        if (e?.code === 'EXDEV') {
          await fs.copyFile(normalizedSrc, destPath);
          await fs.unlink(normalizedSrc);
        } else throw e;
      }
    } else {
      await fs.copyFile(normalizedSrc, destPath);
      await fs.unlink(normalizedSrc);
    }

    return NextResponse.json({ success: true, destPath });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// GET: list all directories/subdirectories under /additional-browse recursively (up to 2 levels)
export async function GET() {
  async function listDirs(dirPath: string, level: number): Promise<{ name: string; path: string; children?: { name: string; path: string }[] }[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      const result = [];
      for (const d of dirs) {
        const fullPath = path.join(dirPath, d.name);
        const item: { name: string; path: string; children?: { name: string; path: string }[] } = {
          name: d.name,
          path: fullPath,
        };
        if (level < 2) {
          const children = await listDirs(fullPath, level + 1);
          if (children.length > 0) item.children = children;
        }
        result.push(item);
      }
      return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    } catch {
      return [];
    }
  }

  const dirs = await listDirs(FAVORITES_BASE, 1);
  return NextResponse.json({ dirs });
}
