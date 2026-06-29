import type { Memo } from "@flowmemo/shared";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
  X
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "./ui/Button";
import { FloatingMenu } from "./ui/FloatingMenu";
import type { FloatingMenuItem } from "./ui/FloatingMenu";
import { MemoEditor } from "./MemoEditor";
import type { MemoEditorHandle } from "./MemoEditor";
import { ImagePreviewDialog } from "./ImagePreviewDialog";
import { renderMarkdown } from "../lib/markdown";
import { useDeleteMemo, usePublishMemo, useUnpublishMemo, useUpdateMemo } from "../hooks/useMemos";
import { fetchProtectedImage, isApiUploadUrl } from "../lib/api";
import { cn } from "../lib/cn";

type MemoItemProps = {
  memo: Memo;
  archiveView: boolean;
  viewerId?: string;
  selectionMode?: boolean;
  selected?: boolean;
  canUploadImages?: boolean;
  onToggleSelection?: (memoId: string) => void;
  onTagSelect?: (tag: string) => void;
};

type MemoDisplayImage = {
  id: string;
  alt: string;
  url: string;
};

const protectedImageObjectUrls = new Map<string, string>();
const protectedImageRequests = new Map<string, Promise<string>>();
const PROTECTED_IMAGE_CACHE_LIMIT = 120;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * 从 memo Markdown 中拆出图片，让展示态正文和图片附件分区渲染。
 */
function splitMemoDisplayImages(content: string): { text: string; images: MemoDisplayImage[] } {
  const images: MemoDisplayImage[] = [];
  const text = content
    .replace(MARKDOWN_IMAGE_PATTERN, (full, alt: string, url: string) => {
      images.push({
        id: `${url}-${images.length}`,
        alt: alt || "图片",
        url
      });
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, images };
}

/**
 * 生成图片缓存 key，避免同一浏览器会话中跨账号复用受保护图片。
 */
function createProtectedImageCacheKey(viewerId: string | undefined, src: string): string {
  return `${viewerId ?? "anonymous"}\n${src}`;
}

/**
 * 写入图片缓存，并回收最早的多余 object URL。
 */
function rememberProtectedImageObjectUrl(cacheKey: string, objectUrl: string) {
  protectedImageObjectUrls.set(cacheKey, objectUrl);

  while (protectedImageObjectUrls.size > PROTECTED_IMAGE_CACHE_LIMIT) {
    const oldestKey = protectedImageObjectUrls.keys().next().value;
    if (!oldestKey) {
      return;
    }

    const oldestUrl = protectedImageObjectUrls.get(oldestKey);
    if (oldestUrl) {
      URL.revokeObjectURL(oldestUrl);
    }
    protectedImageObjectUrls.delete(oldestKey);
  }
}

/**
 * 标准化受保护图片地址，保证缓存 key 稳定。
 */
function normalizeProtectedImageSrc(value: string): string | null {
  if (!isApiUploadUrl(value)) {
    return null;
  }

  try {
    return new URL(value, window.location.href).toString();
  } catch {
    return null;
  }
}

/**
 * 读取受保护图片并复用 object URL，避免 memo 重渲染时图片反复闪烁。
 */
function loadProtectedImageObjectUrl(viewerId: string | undefined, src: string): Promise<string> {
  const cacheKey = createProtectedImageCacheKey(viewerId, src);
  const cached = protectedImageObjectUrls.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = protectedImageRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = fetchProtectedImage(src)
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      rememberProtectedImageObjectUrl(cacheKey, objectUrl);
      protectedImageRequests.delete(cacheKey);
      return objectUrl;
    })
    .catch((error) => {
      protectedImageRequests.delete(cacheKey);
      throw error;
    });

  protectedImageRequests.set(cacheKey, request);
  return request;
}

/**
 * 渲染 memo 正文，并优先使用已经缓存好的受保护图片。
 */
function renderMemoContent(content: string, viewerId: string | undefined): string {
  const html = renderMarkdown(content);
  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const src = normalizeProtectedImageSrc(image.getAttribute("src") ?? "");
    const cached = src ? protectedImageObjectUrls.get(createProtectedImageCacheKey(viewerId, src)) : undefined;
    if (cached) {
      image.src = cached;
    }
  });

  return container.innerHTML;
}

/**
 * 格式化 memo 时间。
 */
function formatTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const dateText = year === now.getFullYear() ? `${month}-${day}` : `${year}-${month}-${day}`;

  return `${dateText} ${hour}:${minute}`;
}

/**
 * 生成当前站点下的公开 memo 访问地址。
 */
function getPublicMemoUrl(publicId: string): string {
  if (typeof window === "undefined") {
    return `/explore/${publicId}`;
  }
  return new URL(`/explore/${publicId}`, window.location.origin).toString();
}

/**
 * 复制文本到剪贴板。
 */
async function copyText(value: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

/**
 * 单条 memo 展示和编辑组件。
 */
export function MemoItem({
  memo,
  archiveView,
  viewerId,
  selectionMode = false,
  selected = false,
  canUploadImages = false,
  onToggleSelection,
  onTagSelect
}: MemoItemProps) {
  const [editing, setEditing] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MemoEditorHandle>(null);
  const updateMemo = useUpdateMemo();
  const deleteMemo = useDeleteMemo();
  const publishMemo = usePublishMemo();
  const unpublishMemo = useUnpublishMemo();
  const displayContent = useMemo(() => splitMemoDisplayImages(memo.content), [memo.content]);
  const renderedContent = useMemo(() => renderMemoContent(displayContent.text, viewerId), [displayContent.text, viewerId]);
  const actionMenuItems: FloatingMenuItem[] = archiveView
    ? [
        {
          id: "restore",
          label: "恢复",
          icon: <RotateCcw size={17} />,
          disabled: updateMemo.isPending,
          onSelect: restoreMemo
        },
        {
          id: "delete",
          label: "永久删除",
          icon: <Trash2 size={17} />,
          danger: true,
          disabled: deleteMemo.isPending,
          onSelect: deleteCurrentMemo
        }
      ]
    : [
        {
          id: "edit",
          label: "编辑",
          icon: <Pencil size={17} />,
          onSelect: enterEditing
        },
        {
          id: "pin",
          label: memo.pinned ? "取消置顶" : "置顶",
          icon: memo.pinned ? <PinOff size={17} /> : <Pin size={17} />,
          disabled: updateMemo.isPending,
          onSelect: togglePinned
        },
        ...(memo.publicId
          ? [
              {
                id: "copy-public-link",
                label: "复制公开链接",
                icon: <Copy size={17} />,
                onSelect: copyPublicLink
              },
              {
                id: "open-public-link",
                label: "打开公开页",
                icon: <ExternalLink size={17} />,
                onSelect: openPublicLink
              },
              {
                id: "unpublish",
                label: "取消公开",
                icon: <Globe2 size={17} />,
                danger: true,
                disabled: unpublishMemo.isPending,
                onSelect: unpublishCurrentMemo
              }
            ]
          : [
              {
                id: "publish",
                label: "生成公开链接",
                icon: <Globe2 size={17} />,
                disabled: publishMemo.isPending,
                onSelect: publishCurrentMemo
              }
            ]),
        {
          id: "archive",
          label: "归档",
          icon: <Archive size={17} />,
          danger: true,
          disabled: updateMemo.isPending,
          onSelect: archiveMemo
        }
      ];

  useEffect(() => {
    const root = contentRef.current;
    if (!root || editing) {
      return;
    }

    let cancelled = false;
    const images = Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"));

    images.forEach((image) => {
      const src = normalizeProtectedImageSrc(image.getAttribute("src") ?? "");
      if (!src) {
        return;
      }

      const cached = protectedImageObjectUrls.get(createProtectedImageCacheKey(viewerId, src));
      if (cached) {
        image.src = cached;
        return;
      }

      loadProtectedImageObjectUrl(viewerId, src)
        .then((objectUrl) => {
          if (cancelled) {
            return;
          }
          image.src = objectUrl;
        })
        .catch(() => {
          if (!cancelled) {
            image.alt = image.alt || "图片加载失败";
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [editing, memo.content, viewerId]);

  /**
   * 保存编辑后的内容。
   */
  function saveEditing() {
    const nextContent = editorRef.current?.getMarkdownContent().trim() ?? "";
    if (!nextContent) {
      return;
    }

    updateMemo.mutate(
      {
        id: memo.id,
        content: nextContent
      },
      {
        onSuccess: () => setEditing(false)
      }
    );
  }

  /**
   * 切换当前 memo 的选择状态。
   */
  function handleToggleSelection() {
    onToggleSelection?.(memo.id);
  }

  /**
   * 处理正文中的标签点击。
   */
  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const image = target.closest<HTMLImageElement>("img");
    if (image && event.currentTarget.contains(image)) {
      event.preventDefault();
      setPreviewImage({ src: image.currentSrc || image.src, alt: image.alt || "图片" });
      return;
    }

    const tagButton = target.closest<HTMLButtonElement>("[data-memo-tag]");
    const tagName = tagButton?.dataset.memoTag;
    if (!tagName) {
      return;
    }

    event.preventDefault();
    onTagSelect?.(tagName);
  }

  /**
   * 进入当前 memo 编辑状态。
   */
  function enterEditing() {
    setEditing(true);
  }

  /**
   * 切换当前 memo 的置顶状态。
   */
  function togglePinned() {
    updateMemo.mutate({ id: memo.id, pinned: !memo.pinned });
  }

  /**
   * 将当前 memo 移入归档。
   */
  function archiveMemo() {
    updateMemo.mutate({ id: memo.id, archived: true });
  }

  /**
   * 复制当前 memo 的公开链接。
   */
  async function copyPublicLink() {
    if (!memo.publicId) {
      return;
    }

    await copyText(getPublicMemoUrl(memo.publicId));
    toast.success("公开链接已复制");
  }

  /**
   * 在新标签页打开当前 memo 的公开链接。
   */
  function openPublicLink() {
    if (!memo.publicId) {
      return;
    }

    window.open(getPublicMemoUrl(memo.publicId), "_blank", "noopener,noreferrer");
  }

  /**
   * 为当前 memo 生成公开链接。
   */
  function publishCurrentMemo() {
    publishMemo.mutate(memo.id, {
      onSuccess: async (data) => {
        await copyText(getPublicMemoUrl(data.published.publicId));
        toast.success("公开链接已生成并复制");
      }
    });
  }

  /**
   * 取消当前 memo 的公开链接。
   */
  function unpublishCurrentMemo() {
    unpublishMemo.mutate(memo.id, {
      onSuccess: () => toast.success("已取消公开")
    });
  }

  /**
   * 从归档中恢复当前 memo。
   */
  function restoreMemo() {
    updateMemo.mutate({ id: memo.id, archived: false });
  }

  /**
   * 永久删除当前 memo。
   */
  function deleteCurrentMemo() {
    deleteMemo.mutate(memo.id);
  }

  /**
   * 打开笔记附件图片预览。
   */
  function openAttachmentPreview(event: MouseEvent<HTMLButtonElement>, image: MemoDisplayImage) {
    event.stopPropagation();
    const preview = event.currentTarget.querySelector("img");
    setPreviewImage({ src: preview?.currentSrc || image.url, alt: image.alt });
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "memo-item",
        memo.pinned && !editing && "is-pinned",
        !selectionMode && !editing && "has-menu",
        actionMenuOpen && "menu-open",
        selectionMode && "is-selectable",
        selected && "is-selected"
      )}
    >
      {editing ? (
        <MemoEditor
          ref={editorRef}
          key={memo.id}
          className="memo-edit-composer"
          initialValue={memo.content}
          canUploadImages={canUploadImages}
          placeholder="编辑 memo 内容"
          ariaLabel="编辑 memo 内容"
          autoFocus
          onSubmit={saveEditing}
          footerActions={({ canSubmit }) => (
            <div className="memo-edit-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X size={15} />
                取消
              </Button>
              <Button type="button" size="sm" onClick={saveEditing} disabled={updateMemo.isPending || !canSubmit}>
                <Check size={15} />
                保存
              </Button>
            </div>
          )}
        />
      ) : (
        <>
          {memo.pinned && (
            <span className="memo-pin-badge" title="置顶" aria-label="置顶笔记">
              <Pin size={12} />
              <span>置顶</span>
            </span>
          )}
          {selectionMode && (
            <button
              type="button"
              className="memo-select-button"
              aria-label={selected ? "取消选择笔记" : "选择笔记"}
              aria-pressed={selected}
              onClick={handleToggleSelection}
            >
              <span className="memo-select-box">{selected && <Check size={13} />}</span>
            </button>
          )}
          {!selectionMode && (
            <FloatingMenu
              open={actionMenuOpen}
              items={actionMenuItems}
              align="end"
              onOpenChange={setActionMenuOpen}
              className="memo-menu"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className="memo-menu-trigger"
                  data-open={open ? "true" : undefined}
                  aria-label="更多操作"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  title="更多操作"
                  onClick={toggle}
                >
                  <MoreHorizontal size={18} />
                </button>
              )}
            />
          )}
          <time className="memo-time" dateTime={memo.createdAt}>
            {formatTime(memo.createdAt)}
          </time>
          <div ref={contentRef} className="memo-content" onClick={handleContentClick}>
            {renderedContent && (
              <div
                className="memo-markdown"
                dangerouslySetInnerHTML={{
                  __html: renderedContent
                }}
              />
            )}
            {displayContent.images.length > 0 && (
              <div className="memo-attachments" aria-label="笔记图片">
                {displayContent.images.map((image) => (
                  <div key={image.id} className="memo-attachment">
                    <button
                      type="button"
                      className="memo-attachment-preview"
                      aria-label="预览图片"
                      title="预览图片"
                      onClick={(event) => openAttachmentPreview(event, image)}
                    >
                      <img src={image.url} alt={image.alt} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {previewImage && (
            <ImagePreviewDialog
              src={previewImage.src}
              alt={previewImage.alt}
              onClose={() => setPreviewImage(null)}
            />
          )}
        </>
      )}
    </motion.article>
  );
}
