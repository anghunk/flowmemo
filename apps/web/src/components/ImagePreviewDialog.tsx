import { useEffect } from "react";
import { X } from "lucide-react";

type ImagePreviewDialogProps = {
  src: string;
  alt: string;
  onClose: () => void;
};

/**
 * 图片放大预览弹层。
 */
export function ImagePreviewDialog({ src, alt, onClose }: ImagePreviewDialogProps) {
  useEffect(() => {
    /**
     * 按下 Esc 时关闭图片预览。
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="image-preview-backdrop" role="presentation" onClick={onClose}>
      <div
        className="image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="image-preview-close" aria-label="关闭图片预览" title="关闭" onClick={onClose}>
          <X size={19} />
        </button>
        <img className="image-preview-image" src={src} alt={alt} />
      </div>
    </div>
  );
}
