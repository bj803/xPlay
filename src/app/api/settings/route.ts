import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CONFIG_PATH = '/config';
const SETTINGS_FILE = path.join(CONFIG_PATH, 'ui-settings.json');

async function readSettings(): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeSettings(data: Record<string, string>): Promise<void> {
  await fs.mkdir(CONFIG_PATH, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/settings?key=xxx  → returns stored value
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) return new Response('Missing key', { status: 400 });

    const settings = await readSettings();
    const value = settings[key];

    if (value === undefined) {
      return new Response(null, { status: 404 });
    }

    return new Response(value, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}

// POST /api/settings  body: { key, value }  → saves value
export async function POST(request: Request) {
  try {
    const { key, value } = await request.json();
    if (!key) return new Response('Missing key', { status: 400 });

    const settings = await readSettings();
    settings[key] = value;
    await writeSettings(settings);

    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}

// DELETE /api/settings?key=xxx  → removes key
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) return new Response('Missing key', { status: 400 });

    const settings = await readSettings();
    delete settings[key];
    await writeSettings(settings);

    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}
