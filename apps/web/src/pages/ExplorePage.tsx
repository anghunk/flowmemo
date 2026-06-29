import type { MouseEvent } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, LoaderCircle } from "lucide-react";
import { ImagePreviewDialog } from "../components/ImagePreviewDialog";
import { api } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";

/**
 * 格式化公开笔记时间。
 */
function formatPublicTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

/**
 * 公开发布 memo 访问页。
 */
export function ExplorePage() {
  const { publicId = "" } = useParams();
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const query = useQuery({
    queryKey: ["explore", publicId],
    queryFn: () => api.publicMemo(publicId),
    enabled: /^\d{10}$/.test(publicId)
  });

  if (!/^\d{10}$/.test(publicId)) {
    return (
      <main className="explore-shell">
        <section className="explore-state">
          <AlertCircle size={28} />
          <h1>公开链接无效</h1>
          <Link to="/app">返回 FlowMemo</Link>
        </section>
      </main>
    );
  }

  if (query.isLoading) {
    return (
      <main className="explore-shell">
        <section className="explore-state">
          <LoaderCircle className="explore-loading-icon" size={28} />
          <h1>正在打开公开笔记</h1>
        </section>
      </main>
    );
  }

  if (query.isError || !query.data?.published) {
    return (
      <main className="explore-shell">
        <section className="explore-state">
          <AlertCircle size={28} />
          <h1>公开笔记不存在</h1>
          <Link to="/app">返回 FlowMemo</Link>
        </section>
      </main>
    );
  }

  const published = query.data.published;

  /**
   * 点击公开页正文图片时打开预览。
   */
  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const image = target.closest<HTMLImageElement>("img");
    if (!image || !event.currentTarget.contains(image)) {
      return;
    }

    event.preventDefault();
    setPreviewImage({ src: image.currentSrc || image.src, alt: image.alt || "图片" });
  }

  return (
    <main className="explore-shell">
      <article className="explore-article">
        <header className="explore-header">
          <Link className="explore-back-link" to="/app">
            <ArrowLeft size={16} />
            FlowMemo
          </Link>
          <div className="explore-meta">
            <span>{published.authorName}</span>
            <span>{formatPublicTime(published.publishedAt)}</span>
          </div>
        </header>
        <div
          className="memo-markdown explore-markdown"
          onClick={handleContentClick}
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(published.memo.content)
          }}
        />
        {previewImage && (
          <ImagePreviewDialog
            src={previewImage.src}
            alt={previewImage.alt}
            onClose={() => setPreviewImage(null)}
          />
        )}
      </article>
    </main>
  );
}
