// src/components/modules/PlaylistSelector.tsx
// 播放列表选择下载组件
// 用法：在 DownloadContainer 中，当检测到 playlist URL 时显示此组件

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDownloadFormStore } from "@/store/downloadForm";

interface PlaylistItem {
  index: number;
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  url: string;
  uploader: string;
}

interface PlaylistSelectorProps {
  playlistUrl: string;
  onClose: () => void;
  onDownloadSelected: (items: PlaylistItem[]) => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PlaylistSelector({
  playlistUrl,
  onClose,
  onDownloadSelected,
}: PlaylistSelectorProps) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // 获取播放列表数据
  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError("");
    setItems([]);

    fetch(`/api/playlist-info?url=${encodeURIComponent(playlistUrl)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setItems(data.items || []);
        setLoadedCount(data.items?.length || 0);
        // 默认全选
        setSelected(new Set((data.items || []).map((_: PlaylistItem, i: number) => i)));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [playlistUrl]);

  const toggleItem = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((_, i) => i)));
    }
  }, [selected.size, items]);

  const handleDownload = useCallback(() => {
    const selectedItems = items.filter((_, i) => selected.has(i));
    if (selectedItems.length === 0) return;
    onDownloadSelected(selectedItems);
  }, [items, selected, onDownloadSelected]);

  const selectedCount = selected.size;
  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="playlist-selector-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="playlist-selector-panel">
        {/* 头部 */}
        <div className="ps-header">
          <div className="ps-header-left">
            <span className="ps-icon">≡</span>
            <div>
              <div className="ps-title">播放列表</div>
              {!loading && !error && (
                <div className="ps-subtitle">共 {items.length} 个视频，已选 {selectedCount} 个</div>
              )}
            </div>
          </div>
          <button className="ps-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="ps-loading">
            <div className="ps-spinner" />
            <span>正在获取播放列表…</span>
          </div>
        )}

        {/* 错误状态 */}
        {error && !loading && (
          <div className="ps-error">
            <span>⚠ {error}</span>
          </div>
        )}

        {/* 视频列表 */}
        {!loading && !error && items.length > 0 && (
          <>
            {/* 全选栏 */}
            <div className="ps-toolbar">
              <label className="ps-check-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                <span>{allSelected ? "取消全选" : "全选"}</span>
              </label>
              <span className="ps-count-badge">{selectedCount}/{items.length}</span>
            </div>

            {/* 视频卡片网格 */}
            <div className="ps-grid">
              {items.map((item, idx) => {
                const isChecked = selected.has(idx);
                return (
                  <div
                    key={item.id || idx}
                    className={`ps-card ${isChecked ? "ps-card--selected" : ""}`}
                    onClick={() => toggleItem(idx)}
                  >
                    {/* 封面 */}
                    <div className="ps-thumb-wrap">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="ps-thumb"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="ps-thumb-placeholder">▶</div>
                      )}
                      {/* 时长标签 */}
                      {item.duration > 0 && (
                        <span className="ps-duration">{formatDuration(item.duration)}</span>
                      )}
                      {/* 序号 */}
                      <span className="ps-index-badge">{item.index + 1}</span>
                      {/* 选中覆盖层 */}
                      {isChecked && (
                        <div className="ps-selected-overlay">
                          <span className="ps-check-icon">✓</span>
                        </div>
                      )}
                    </div>
                    {/* 标题 */}
                    <div className="ps-card-title">{item.title}</div>
                    {item.uploader && (
                      <div className="ps-card-uploader">{item.uploader}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 底部下载按钮 */}
        {!loading && !error && items.length > 0 && (
          <div className="ps-footer">
            <button
              className="ps-download-btn"
              disabled={selectedCount === 0 || downloading}
              onClick={handleDownload}
            >
              {downloading
                ? "准备下载…"
                : `下载选中的 ${selectedCount} 个视频`}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .playlist-selector-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.75);
          z-index: 9999;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
        }
        .playlist-selector-panel {
          background: #1a1a1a;
          border: 1px solid #2e2e2e;
          border-bottom: none;
          border-radius: 16px 16px 0 0;
          width: 100%;
          max-width: 520px;
          max-height: 88vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 -8px 40px rgba(0,0,0,0.6);
        }
        /* 头部 */
        .ps-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 16px 12px;
          border-bottom: 1px solid #2e2e2e;
          flex-shrink: 0;
        }
        .ps-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ps-icon {
          font-size: 20px;
          color: #4ade80;
          line-height: 1;
        }
        .ps-title {
          font-size: 15px;
          font-weight: 600;
          color: #f0f0f0;
          line-height: 1.2;
        }
        .ps-subtitle {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
        }
        .ps-close-btn {
          background: #2a2a2a;
          border: none;
          color: #888;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ps-close-btn:hover { background: #333; color: #ccc; }

        /* 加载/错误 */
        .ps-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px 16px;
          color: #666;
          font-size: 14px;
        }
        .ps-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid #2e2e2e;
          border-top-color: #4ade80;
          border-radius: 50%;
          animation: ps-spin 0.8s linear infinite;
        }
        @keyframes ps-spin { to { transform: rotate(360deg); } }
        .ps-error {
          padding: 24px 16px;
          color: #f87171;
          font-size: 13px;
          text-align: center;
        }

        /* 工具栏 */
        .ps-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          border-bottom: 1px solid #242424;
          flex-shrink: 0;
        }
        .ps-check-all {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 13px;
          color: #ccc;
          user-select: none;
        }
        .ps-check-all input[type="checkbox"] {
          accent-color: #4ade80;
          width: 15px;
          height: 15px;
        }
        .ps-count-badge {
          font-size: 12px;
          color: #4ade80;
          font-weight: 600;
          background: rgba(74,222,128,0.1);
          padding: 2px 8px;
          border-radius: 10px;
        }

        /* 网格 */
        .ps-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          padding: 12px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }
        .ps-grid::-webkit-scrollbar { width: 4px; }
        .ps-grid::-webkit-scrollbar-track { background: transparent; }
        .ps-grid::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

        /* 卡片 */
        .ps-card {
          cursor: pointer;
          border-radius: 8px;
          overflow: hidden;
          background: #222;
          border: 2px solid transparent;
          transition: border-color 0.15s, transform 0.1s;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .ps-card:active { transform: scale(0.97); }
        .ps-card--selected {
          border-color: #4ade80;
          background: #1a2b1e;
        }

        /* 封面 */
        .ps-thumb-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          background: #111;
          overflow: hidden;
        }
        .ps-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ps-thumb-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #444;
          font-size: 24px;
        }
        .ps-duration {
          position: absolute;
          bottom: 4px;
          right: 5px;
          background: rgba(0,0,0,0.82);
          color: #fff;
          font-size: 10px;
          font-weight: 600;
          padding: 1px 5px;
          border-radius: 3px;
          letter-spacing: 0.3px;
        }
        .ps-index-badge {
          position: absolute;
          top: 4px;
          left: 5px;
          background: rgba(0,0,0,0.65);
          color: #bbb;
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 3px;
        }
        .ps-selected-overlay {
          position: absolute;
          inset: 0;
          background: rgba(74,222,128,0.22);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ps-check-icon {
          width: 28px;
          height: 28px;
          background: #4ade80;
          color: #000;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 800;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }

        /* 标题/作者 */
        .ps-card-title {
          font-size: 11.5px;
          color: #ddd;
          padding: 6px 8px 2px;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ps-card-uploader {
          font-size: 10.5px;
          color: #555;
          padding: 0 8px 7px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ps-card--selected .ps-card-title { color: #a7f3c3; }

        /* 底部 */
        .ps-footer {
          padding: 12px 16px 16px;
          flex-shrink: 0;
          border-top: 1px solid #242424;
        }
        .ps-download-btn {
          width: 100%;
          padding: 13px;
          background: #4ade80;
          color: #000;
          font-weight: 700;
          font-size: 14px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }
        .ps-download-btn:hover:not(:disabled) { opacity: 0.88; }
        .ps-download-btn:active:not(:disabled) { transform: scale(0.98); }
        .ps-download-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
