import type { Memo } from "@flowmemo/shared";
import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import { MemoItem } from "./MemoItem";

type MemoListProps = {
  memos: Memo[];
  loading: boolean;
  archiveView: boolean;
  viewerId?: string;
  selectionMode?: boolean;
  selectedMemoIds?: Set<string>;
  canUploadImages?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onToggleSelection?: (memoId: string) => void;
  onTagSelect?: (tag: string) => void;
};

/**
 * memo 列表组件。
 */
export function MemoList({
  memos,
  loading,
  archiveView,
  viewerId,
  selectionMode = false,
  selectedMemoIds,
  canUploadImages = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onToggleSelection,
  onTagSelect
}: MemoListProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadMoreNode = loadMoreRef.current;
    if (!loadMoreNode || loading || loadingMore || !hasMore || !onLoadMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { rootMargin: "180px 0px" }
    );

    observer.observe(loadMoreNode);

    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, onLoadMore]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="memo-skeleton" />
        ))}
      </div>
    );
  }

  if (memos.length === 0) {
    return <div className="empty-state">这里还没有记录</div>;
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {memos.map((memo) => (
          <MemoItem
            key={memo.id}
            memo={memo}
            archiveView={archiveView}
            viewerId={viewerId}
            selectionMode={selectionMode}
            selected={selectedMemoIds?.has(memo.id) ?? false}
            canUploadImages={canUploadImages}
            onToggleSelection={onToggleSelection}
            onTagSelect={onTagSelect}
          />
        ))}
      </AnimatePresence>
      <div ref={loadMoreRef} className="memo-list-footer" aria-live="polite">
        {loadingMore ? "正在加载更多笔记..." : hasMore ? "继续下滑加载更多" : "已经没有笔记了"}
      </div>
    </div>
  );
}
