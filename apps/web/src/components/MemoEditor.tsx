import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Bold,
  Code,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Plus,
  Quote,
  SmilePlus,
  X
} from "lucide-react";
import { toast } from "sonner";
import { countMemoImages, MEMO_IMAGE_MAX_COUNT, MEMO_IMAGE_MAX_SIZE } from "@flowmemo/shared";
import { MemoRichEditor } from "./MemoRichEditor";
import type { MemoRichEditorHandle } from "./MemoRichEditor";
import { ImagePreviewDialog } from "./ImagePreviewDialog";
import { useTags } from "../hooks/useMemos";
import { api, ApiError, fetchProtectedImage, isApiUploadUrl } from "../lib/api";

type EditorImage = {
  id: string;
  alt: string;
  objectUrl: string | null;
  previewUrl: string;
  url: string;
};

type MarkdownTool = {
  id: string;
  label: string;
  icon: ReactNode;
  apply: () => void;
};

type MemoEditorProps = {
  initialValue?: string;
  canUploadImages?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  footerActions?: (state: { canSubmit: boolean; imageUploading: boolean }) => ReactNode;
  onSubmit?: () => void;
};

export type MemoEditorHandle = {
  focus: () => void;
  getMarkdownContent: () => string;
  clear: () => void;
};

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const TagEmojiPicker = lazy(() =>
  import("./TagEmojiPicker").then((module) => ({ default: module.TagEmojiPicker }))
);

/**
 * 从 Markdown 内容中拆出图片附件，编辑时以底部缩略图展示。
 */
function splitMarkdownImages(value: string): { text: string; images: EditorImage[] } {
  const images: EditorImage[] = [];
  const text = value
    .replace(MARKDOWN_IMAGE_PATTERN, (full, alt: string, url: string) => {
      images.push({
        id: `${url}-${images.length}`,
        alt: alt || "图片",
        objectUrl: null,
        previewUrl: url,
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
 * 完整 memo 编辑器，包含输入、工具栏、emoji、图片上传和拖拽。
 */
export const MemoEditor = forwardRef<MemoEditorHandle, MemoEditorProps>(function MemoEditor(
  {
    initialValue = "",
    canUploadImages = false,
    autoFocus = false,
    placeholder = "现在想到什么？支持 Markdown 和 #标签",
    ariaLabel = "memo 输入框",
    className,
    footerActions,
    onSubmit
  },
  ref
) {
  const initialContent = useRef(splitMarkdownImages(initialValue));
  const [content, setContent] = useState(initialContent.current.text);
  const [focused, setFocused] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [images, setImages] = useState<EditorImage[]>(initialContent.current.images);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const editorRef = useRef<MemoRichEditorHandle>(null);
  const imagesRef = useRef<EditorImage[]>(initialContent.current.images);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const emojiToolRef = useRef<HTMLDivElement>(null);
  const tags = useTags();

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editorRef.current?.focus();
      },
      getMarkdownContent() {
        return buildSubmitContent();
      },
      clear() {
        setContent("");
        clearImages();
        setForceExpanded(false);
      }
    }),
    [content, images]
  );

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    imagesRef.current.forEach((image) => {
      if (!image.objectUrl && isApiUploadUrl(image.url)) {
        void createImagePreview(image.url)
          .then((preview) => {
            setImages((current) =>
              current.map((item) =>
                item.id === image.id ? { ...item, objectUrl: preview.objectUrl, previewUrl: preview.previewUrl } : item
              )
            );
          })
          .catch(() => {
            setImages((current) => current.filter((item) => item.id !== image.id));
            toast.error("图片预览加载失败");
          });
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => {
        if (image.objectUrl) {
          URL.revokeObjectURL(image.objectUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }

    /**
     * 点击 emoji 面板外部时收起选择器。
     */
    function handlePointerDown(event: PointerEvent) {
      if (!emojiToolRef.current?.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
      }
    }

    /**
     * 按下 Esc 时收起 emoji 选择器。
     */
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setEmojiPickerOpen(false);
        window.requestAnimationFrame(() => editorRef.current?.focus());
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [emojiPickerOpen]);

  /**
   * 组合正文与上传图片，保持 API 仍接收 Markdown 文本。
   */
  function buildSubmitContent(): string {
    const text = content.trim();
    const imageMarkdown = images.map((image) => `![${image.alt}](${image.url})`).join("\n");
    if (!text) {
      return imageMarkdown;
    }
    if (!imageMarkdown) {
      return text;
    }
    return `${text}\n\n${imageMarkdown}`;
  }

  /**
   * 更新内容并恢复光标选择区间。
   */
  function updateContent(nextContent: string, selectionStart: number, selectionEnd = selectionStart) {
    setContent(nextContent);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  /**
   * 插入行内 Markdown 标记。
   */
  function applyInlineMarkdown(prefix: string, suffix: string, placeholderText: string) {
    const { start, end } = editorRef.current?.getSelectionRange() ?? { start: content.length, end: content.length };
    const selectedText = content.slice(start, end) || placeholderText;
    const nextText = `${prefix}${selectedText}${suffix}`;
    const nextContent = `${content.slice(0, start)}${nextText}${content.slice(end)}`;
    const nextSelectionStart = start + prefix.length;
    const nextSelectionEnd = nextSelectionStart + selectedText.length;
    updateContent(nextContent, nextSelectionStart, nextSelectionEnd);
  }

  /**
   * 给当前行或选区中的每一行增加 Markdown 前缀。
   */
  function applyLinePrefix(getPrefix: (index: number) => string) {
    const { start, end } = editorRef.current?.getSelectionRange() ?? { start: content.length, end: content.length };
    const lineStart = content.lastIndexOf("\n", Math.max(start - 1, 0)) + 1;
    const nextBreakIndex = content.indexOf("\n", end);
    const lineEnd = nextBreakIndex === -1 ? content.length : nextBreakIndex;
    const selectedBlock = content.slice(lineStart, lineEnd);
    const nextBlock = selectedBlock
      .split("\n")
      .map((line, index) => `${getPrefix(index)}${line}`)
      .join("\n");
    const nextContent = `${content.slice(0, lineStart)}${nextBlock}${content.slice(lineEnd)}`;
    updateContent(nextContent, lineStart, lineStart + nextBlock.length);
  }

  const markdownTools: MarkdownTool[] = [
    {
      id: "bold",
      label: "加粗",
      icon: <Bold size={16} />,
      apply: () => applyInlineMarkdown("**", "**", "加粗文本")
    },
    {
      id: "italic",
      label: "斜体",
      icon: <Italic size={16} />,
      apply: () => applyInlineMarkdown("*", "*", "斜体文本")
    },
    {
      id: "quote",
      label: "引用",
      icon: <Quote size={16} />,
      apply: () => applyLinePrefix(() => "> ")
    },
    {
      id: "unordered-list",
      label: "无序列表",
      icon: <List size={16} />,
      apply: () => applyLinePrefix(() => "- ")
    },
    {
      id: "ordered-list",
      label: "有序列表",
      icon: <ListOrdered size={16} />,
      apply: () => applyLinePrefix((index) => `${index + 1}. `)
    },
    {
      id: "code",
      label: "行内代码",
      icon: <Code size={16} />,
      apply: () => applyInlineMarkdown("`", "`", "code")
    }
  ];

  /**
   * 防止点击工具按钮时编辑器丢失光标。
   */
  function keepEditorFocus(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  /**
   * 在当前光标位置插入行内文本。
   */
  function insertInlineText(text: string) {
    const { start, end } = editorRef.current?.getSelectionRange() ?? { start: content.length, end: content.length };
    const nextContent = `${content.slice(0, start)}${text}${content.slice(end)}`;
    const nextCursor = start + text.length;
    updateContent(nextContent, nextCursor);
  }

  /**
   * 打开图片选择器。
   */
  function openImagePicker() {
    if (!canUploadImages) {
      return;
    }
    if (imagesRef.current.length >= MEMO_IMAGE_MAX_COUNT) {
      toast.error(`同一条笔记最多支持 ${MEMO_IMAGE_MAX_COUNT} 张图片`);
      return;
    }
    imageInputRef.current?.click();
  }

  /**
   * 切换 emoji 选择器。
   */
  function toggleEmojiPicker() {
    setEmojiPickerOpen((current) => !current);
  }

  /**
   * 插入选择的 emoji。
   */
  function insertEmoji(emoji: string) {
    insertInlineText(emoji);
    setEmojiPickerOpen(false);
  }

  /**
   * 上传多张图片并加入底部附件列表。
   */
  async function uploadImageFiles(files: File[]) {
    if (!canUploadImages) {
      toast.error("图片上传仅 PRO 会员可用");
      return;
    }

    if (imageUploading) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("请选择图片文件");
      return;
    }
    if (imageFiles.length < files.length) {
      toast.error("已忽略非图片文件");
    }

    const capacity = MEMO_IMAGE_MAX_COUNT - imagesRef.current.length;
    if (capacity <= 0) {
      toast.error(`同一条笔记最多支持 ${MEMO_IMAGE_MAX_COUNT} 张图片`);
      return;
    }

    const limitedFiles = imageFiles.slice(0, capacity);
    if (imageFiles.length > capacity) {
      toast.error(`同一条笔记最多支持 ${MEMO_IMAGE_MAX_COUNT} 张图片，已只上传前 ${capacity} 张`);
    }

    const validFiles = limitedFiles.filter((file) => file.size > 0 && file.size <= MEMO_IMAGE_MAX_SIZE);
    const skippedSizeCount = limitedFiles.length - validFiles.length;
    if (skippedSizeCount > 0) {
      toast.error(skippedSizeCount === 1 ? "图片大小不能超过 5MB" : `已跳过 ${skippedSizeCount} 张超过 5MB 的图片`);
    }
    if (validFiles.length === 0) {
      return;
    }

    setImageUploading(true);
    const uploadedImages: EditorImage[] = [];
    let failedCount = 0;
    try {
      for (const file of validFiles) {
        try {
          const result = await api.uploadImage(file);
          const alt = file.name.replace(/\.[^.]+$/, "").trim() || "图片";
          const preview = createLocalImagePreview(file);
          uploadedImages.push({
            id: `${result.image.key}-${Date.now()}`,
            alt,
            objectUrl: preview.objectUrl,
            previewUrl: preview.previewUrl,
            url: result.image.url
          });
        } catch {
          failedCount += 1;
        }
      }

      if (uploadedImages.length > 0) {
        setImages((current) => [...current, ...uploadedImages]);
        toast.success(uploadedImages.length === 1 ? "图片已上传" : `已上传 ${uploadedImages.length} 张图片`);
      }
      if (failedCount > 0) {
        toast.error(failedCount === 1 ? "1 张图片上传失败" : `${failedCount} 张图片上传失败`);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "图片上传失败");
    } finally {
      setImageUploading(false);
    }
  }

  /**
   * 为刚选择的本地图片生成可直接预览的 object URL。
   */
  function createLocalImagePreview(file: File): { objectUrl: string; previewUrl: string } {
    const objectUrl = URL.createObjectURL(file);
    return { objectUrl, previewUrl: objectUrl };
  }

  /**
   * 为编辑已有 memo 时的受保护图片生成可预览地址。
   */
  async function createImagePreview(url: string): Promise<{ objectUrl: string | null; previewUrl: string }> {
    if (!isApiUploadUrl(url)) {
      return { objectUrl: null, previewUrl: url };
    }

    const blob = await fetchProtectedImage(url);
    const objectUrl = URL.createObjectURL(blob);
    return { objectUrl, previewUrl: objectUrl };
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    void uploadImageFiles(files);
  }

  /**
   * 判断拖拽数据里是否包含文件。
   */
  function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  /**
   * 处理图片拖入编辑器区域。
   */
  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }
    event.preventDefault();
    if (!canUploadImages) {
      return;
    }
    setDragActive(true);
  }

  /**
   * 允许图片拖拽停留在编辑器区域。
   */
  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }
    event.preventDefault();
    if (!canUploadImages) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.dataTransfer.dropEffect = imageUploading || imagesRef.current.length >= MEMO_IMAGE_MAX_COUNT ? "none" : "copy";
    setDragActive(true);
  }

  /**
   * 离开编辑器区域时取消拖拽高亮。
   */
  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDragActive(false);
  }

  /**
   * 拖放图片后上传并加入附件列表。
   */
  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }
    event.preventDefault();
    setDragActive(false);

    if (!canUploadImages) {
      toast.error("图片上传仅 PRO 会员可用");
      return;
    }

    if (imageUploading) {
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    if (!files.some((item) => item.type.startsWith("image/"))) {
      toast.error("请拖入图片文件");
      return;
    }

    void uploadImageFiles(files);
  }

  function toggleForceExpanded() {
    setForceExpanded((current) => !current);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }

  function removeImage(imageId: string) {
    setImages((current) =>
      current.filter((image) => {
        if (image.id === imageId && image.objectUrl) {
          URL.revokeObjectURL(image.objectUrl);
        }
        return image.id !== imageId;
      })
    );
  }

  function clearImages() {
    setImages((current) => {
      current.forEach((image) => {
        if (image.objectUrl) {
          URL.revokeObjectURL(image.objectUrl);
        }
      });
      return [];
    });
  }

  /**
   * 打开编辑器附件图片预览。
   */
  function openImagePreview(image: EditorImage) {
    setPreviewImage({ src: image.previewUrl, alt: image.alt });
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
    }
  }

  const expanded = forceExpanded || focused || content.length > 0 || images.length > 0;
  const submitImageCount = countMemoImages(buildSubmitContent());
  const canSubmit = Boolean(content.trim() || images.length > 0) && submitImageCount <= MEMO_IMAGE_MAX_COUNT;
  const canAddMoreImages = canUploadImages && images.length < MEMO_IMAGE_MAX_COUNT;

  return (
    <section
      className={`composer${dragActive ? " is-dragging" : ""}${className ? ` ${className}` : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`composer-editor-frame${expanded ? " is-expanded" : ""}${forceExpanded ? " is-force-expanded" : ""}`}>
        <MemoRichEditor
          ref={editorRef}
          className="composer-editor"
          value={content}
          tags={tags.data?.tags ?? []}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          autoFocus={autoFocus}
          onChange={setContent}
          onKeyDown={handleEditorKeyDown}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
        />
        {images.length > 0 && (
          <div className="composer-attachments" aria-label="已上传图片">
            {images.map((image) => (
              <div key={image.id} className="composer-attachment">
                <button
                  type="button"
                  className="composer-attachment-preview"
                  aria-label="预览图片"
                  title="预览图片"
                  onMouseDown={keepEditorFocus}
                  onClick={() => openImagePreview(image)}
                >
                  <img src={image.previewUrl} alt={image.alt} />
                </button>
                <button
                  type="button"
                  className="composer-attachment-remove"
                  aria-label="移除图片"
                  title="移除图片"
                  onMouseDown={keepEditorFocus}
                  onClick={() => removeImage(image.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {canAddMoreImages && (
              <button
                type="button"
                className="composer-attachment-add"
                aria-label="继续上传图片"
                title="继续上传图片"
                disabled={imageUploading}
                onMouseDown={keepEditorFocus}
                onClick={openImagePicker}
              >
                {imageUploading ? <LoaderCircle size={20} className="composer-spin-icon" /> : <Plus size={24} />}
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="composer-expand-button"
          aria-label={forceExpanded ? "取消放大输入框" : "放大输入框"}
          title={forceExpanded ? "取消放大" : "放大"}
          onMouseDown={keepEditorFocus}
          onClick={toggleForceExpanded}
        >
          {forceExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
      {canUploadImages && (
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          className="sr-only"
          onChange={handleImageChange}
        />
      )}
      <div className="composer-footer">
        <div className="composer-toolbar" aria-label="Markdown 工具栏">
          {markdownTools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="composer-tool-button"
              title={tool.label}
              aria-label={tool.label}
              onMouseDown={keepEditorFocus}
              onClick={tool.apply}
            >
              {tool.icon}
            </button>
          ))}
          <div ref={emojiToolRef} className="composer-emoji-tool">
            <button
              type="button"
              className="composer-tool-button"
              title="插入 emoji"
              aria-label="插入 emoji"
              aria-haspopup="dialog"
              aria-expanded={emojiPickerOpen}
              data-open={emojiPickerOpen ? "true" : undefined}
              onMouseDown={keepEditorFocus}
              onClick={toggleEmojiPicker}
            >
              <SmilePlus size={16} />
            </button>
            {emojiPickerOpen && (
              <div className="composer-emoji-popover" role="dialog" aria-label="选择 emoji">
                <Suspense fallback={<div className="composer-emoji-loading">正在加载表情</div>}>
                  <TagEmojiPicker className="tag-icon-picker composer-emoji-picker" height={420} onSelect={insertEmoji} />
                </Suspense>
              </div>
            )}
          </div>
          {canUploadImages && (
            <button
              type="button"
              className="composer-tool-button"
              title={imageUploading ? "图片上传中" : canAddMoreImages ? "上传图片" : `最多 ${MEMO_IMAGE_MAX_COUNT} 张图片`}
              aria-label={imageUploading ? "图片上传中" : canAddMoreImages ? "上传图片" : `最多 ${MEMO_IMAGE_MAX_COUNT} 张图片`}
              disabled={imageUploading || !canAddMoreImages}
              onMouseDown={keepEditorFocus}
              onClick={openImagePicker}
            >
              {imageUploading ? <LoaderCircle size={16} className="composer-spin-icon" /> : <ImagePlus size={16} />}
            </button>
          )}
        </div>
        {footerActions?.({ canSubmit, imageUploading })}
      </div>
      {previewImage && (
        <ImagePreviewDialog
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </section>
  );
});
