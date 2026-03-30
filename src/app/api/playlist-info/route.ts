import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // 检测是否是 YouTube Mix (RD开头)，限制数量避免无限抓取
  const listMatch = url.match(/[?&]list=([^&]+)/);
  const listId = listMatch?.[1] || "";
  const isMix = listId.startsWith("RD") || listId.startsWith("RDMM") || listId.startsWith("RDCLAK");
  const playlistType = isMix ? "mix" : "playlist";

  return new Promise<NextResponse>((resolve) => {
    const args = [
      "--flat-playlist", "--yes-playlist", "--no-warnings",
      "--print", "%(.{id,title,thumbnail,duration,webpage_url,uploader})j",
    ];

    // Mix 最多抓50个，普通播放列表不限制
    if (isMix) {
      args.push("--playlist-end", "50");
    }

    const proxy = process.env.PROXY || process.env.HTTPS_PROXY || "";
    if (proxy) args.push("--proxy", proxy);
    args.push(url);

    const proc = spawn("yt-dlp", args, { timeout: 90000 });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    proc.on("error", (e: Error) => resolve(NextResponse.json({ error: "yt-dlp failed", detail: e.message }, { status: 500 })));
    proc.on("close", () => {
      if (!stdout.trim()) return resolve(NextResponse.json({ error: "No data", detail: stderr.slice(0,300) }, { status: 500 }));
      const items = stdout.trim().split("\n").map((line, index) => {
        try {
          const item = JSON.parse(line.trim());
          return {
            index, id: item.id || "",
            title: item.title || `Video ${index + 1}`,
            thumbnail: item.thumbnail || "",
            duration: typeof item.duration === "number" ? item.duration : 0,
            url: item.webpage_url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : ""),
            uploader: item.uploader || "",
          };
        } catch { return null; }
      }).filter(Boolean).filter((i: any) => i.id);
      resolve(NextResponse.json({ items, total: items.length, playlistType, isMix }));
    });
  });
}