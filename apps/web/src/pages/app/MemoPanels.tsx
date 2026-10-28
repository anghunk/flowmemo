import type { Memo } from "@flowmemo/shared";
import {
  LoaderCircle
} from "lucide-react";
import { MemoList } from "../../components/MemoList";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";

/**
 * 随机漫游页面属性。
 */
type RandomRoamPanelProps = {
  memo: Memo | null;
  loading: boolean;
  error: string | null;
  viewerId?: string;
  canUploadImages?: boolean;
  onRoam: () => void;
  onTagSelect: (tag: string) => void;
};

/**
 * 随机展示一条历史 memo 的路由页面。
 */
export function RandomRoamPanel({ memo, loading, error, viewerId, canUploadImages = false, onRoam, onTagSelect }: RandomRoamPanelProps) {
  return (
    <section className="random-roam-page">
      <section
        className={cn("random-roam-panel", loading && "is-loading")}
        aria-busy={loading}
      >
        {memo ? (
          <MemoList
            memos={[memo]}
            loading={false}
            archiveView={false}
            viewerId={viewerId}
            canUploadImages={canUploadImages}
            onTagSelect={onTagSelect}
          />
        ) : loading ? (
          <div className="memo-skeleton" />
        ) : (
          <div className="random-roam-empty">
            <p>{error ?? "暂无可漫游的 memo"}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRoam}
            >
              重新试试
            </Button>
          </div>
        )}
        {loading && (
          <div
            className="random-roam-loading"
            role="status"
          >
            <LoaderCircle size={18} />
            <span>随机漫游中</span>
          </div>
        )}
      </section>
    </section>
  );
}

type PublishedPanelProps = {
  loading: boolean;
  memos: Memo[];
  viewerId?: string;
  canUploadImages?: boolean;
  onTagSelect: (tag: string) => void;
};

/**
 * 当前用户已公开笔记列表。
 */
export function PublishedPanel({ loading, memos, viewerId, canUploadImages = false, onTagSelect }: PublishedPanelProps) {
  return (
    <section className="published-panel">
      <MemoList
        memos={memos}
        loading={loading}
        archiveView={false}
        viewerId={viewerId}
        canUploadImages={canUploadImages}
        onTagSelect={onTagSelect}
      />
    </section>
  );
}
