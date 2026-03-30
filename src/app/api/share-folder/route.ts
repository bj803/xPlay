import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_PATH } from '@/server/constants';
export const dynamic = 'force-dynamic';
const SHARE_ROOT = process.env.SHARE_ROOT || '/additional-browse/Share';
const RECYCLE = path.join(SHARE_ROOT, 'Recycle');
const FOLDERS_CONFIG = path.join(CONFIG_PATH, 'share-folders.json');
async function loadConfig() {
  try { return JSON.parse(await fs.readFile(FOLDERS_CONFIG, 'utf-8')); }
  catch { return {}; }
}
async function saveConfig(cfg: any) {
  await fs.mkdir(CONFIG_PATH, { recursive: true });
  await fs.writeFile(FOLDERS_CONFIG, JSON.stringify(cfg, null, 2), 'utf-8');
}
export async function GET() {
  try {
    const [entries, config] = await Promise.all([
      fs.readdir(SHARE_ROOT).catch(() => []),
      loadConfig(),
    ]);
    const folders = await Promise.all(
      entries.filter(e => !e.startsWith('.') && e !== 'Recycle').map(async e => {
        try {
          const s = await fs.stat(path.join(SHARE_ROOT, e));
          if (!s.isDirectory()) return null;
          return { name: e, hasPassword: !!config[e]?.password, title: config[e]?.title || e };
        } catch { return null; }
      })
    );
    return NextResponse.json({ folders: folders.filter(Boolean) });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  const { name, password, title } = await request.json().catch(() => ({}));
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name))
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  if (name === 'Recycle')
    return NextResponse.json({ error: 'Name not allowed' }, { status: 400 });
  try {
    await fs.mkdir(path.join(SHARE_ROOT, name), { recursive: true });
    const config = await loadConfig();
    config[name] = { password: password || undefined, title: title || name };
    await saveConfig(config);
    return NextResponse.json({ success: true, name });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
export async function PATCH(request: NextRequest) {
  const { name, password, title } = await request.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });
  const config = await loadConfig();
  config[name] = { ...config[name], password: password || undefined, title: title || name };
  await saveConfig(config);
  return NextResponse.json({ success: true });
}
export async function DELETE(request: NextRequest) {
  const { name } = await request.json().catch(() => ({}));
  if (!name || name === 'Recycle') return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  try {
    const src = path.join(SHARE_ROOT, name);
    const dest = path.join(RECYCLE, name + '_' + Date.now());
    await fs.mkdir(RECYCLE, { recursive: true });
    await fs.rename(src, dest);
    const config = await loadConfig();
    delete config[name];
    await saveConfig(config);
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
