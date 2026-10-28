import type { Memo, MemoListQuery } from "@flowmemo/shared";
import {
  Archive,
  ArrowDownNarrowWide,
  ArrowDownUp,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  ClockArrowUp,
  Download,
  Home,
  ListChecks,
  Menu,
  Search,
  Trash2,
  X
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MemoComposer } from "../components/MemoComposer";
import { MemoList } from "../components/MemoList";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { Button } from "../components/ui/Button";
import type { FloatingMenuItem } from "../components/ui/FloatingMenu";
import { FloatingMenu } from "../components/ui/FloatingMenu";
import { Input } from "../components/ui/Input";
import { useMe } from "../hooks/useAuth";
import {
  useClearArchivedMemos,
  useInfiniteMemos,
  usePublishedMemos,
  useUpdateMemo
} from "../hooks/useMemos";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { AdminPanel } from "./app/AdminPanel";
import { AiComingSoonPanel } from "./app/AiPanel";
import { AppSidebar } from "./app/AppSidebar";
import { downloadBlob } from "./app/format";
import { PublishedPanel, RandomRoamPanel } from "./app/MemoPanels";
import type { ViewMode } from "./app/navigation";
import { getRouteViewState, getTagPath, getViewPath } from "./app/navigation";
import { ProfilePanel } from "./app/ProfilePanel";
import { SettingsPanel } from "./app/SettingsPanel";
import { SubscriptionPanel } from "./app/SubscriptionPanel";

type SortMode = "created-desc" | "created-asc" | "updated-desc";

type AppLayoutProps = {
  initialView?: ViewMode;
};

const sortOptions: Array<{ value: SortMode; label: string; description: string; icon: ReactNode; }> = [
  {
    value: "created-desc",
    label: "创建时间",
    description: "从新到旧",
    icon: <ArrowDownNarrowWide size={17} />,
  },
  {
    value: "created-asc",
    label: "创建时间",
    description: "从旧到新",
    icon: <ArrowUpNarrowWide size={17} />,
  },
  {
    value: "updated-desc",
    label: "更新时间",
    description: "最近更新",
    icon: <ClockArrowUp size={17} />,
  },
];

/**
 * 获取排序方式说明。
 */
function getSortDescription(sortMode: SortMode): string {
  const option = sortOptions.find((item) => item.value === sortMode);
  return option ? `${option.label}，${option.description}` : "创建时间，从新到旧";
}

/**
 * 按当前排序方式整理 memo 列表。
 */
function sortMemos(memos: Memo[], sortMode: SortMode): Memo[] {
  return [...memos].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    if (sortMode === "created-asc") {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }
    if (sortMode === "updated-desc") {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

/**
 * Web 应用主页面。
 */
export function AppLayout({ initialView = "all" }: AppLayoutProps) {
  return (
    <ProtectedRoute>
      <AppContent initialView={initialView} />
    </ProtectedRoute>
  );
}

type AppContentProps = {
  initialView: ViewMode;
};

/**
 * 登录后的 memo 工作台。
 */
function AppContent({ initialView }: AppContentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const appMainRef = useRef<HTMLElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const routeState = useMemo(() => getRouteViewState(location.pathname, initialView), [initialView, location.pathname]);
  const { view, tag } = routeState;
  const [q, setQ] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [randomMemo, setRandomMemo] = useState<Memo | null>(null);
  const [randomMemoLoading, setRandomMemoLoading] = useState(false);
  const [randomMemoError, setRandomMemoError] = useState<string | null>(null);
  const randomRouteAutoLoadRef = useRef(false);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("created-desc");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMemoIds, setSelectedMemoIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(initialView === "subscription");
  const { data: userData } = useMe();
  const updateMemo = useUpdateMemo();
  const clearArchivedMemos = useClearArchivedMemos();
  const isAdmin = userData?.user.role === "admin";
  const publishedMemos = usePublishedMemos();
  const canUploadImages = userData?.user.plan === "member";

  useLayoutEffect(() => {
    appMainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (mobileSearchOpen) {
      mobileSearchInputRef.current?.focus();
    }
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (view === "random") {
      setMobileSearchOpen(false);
    }
  }, [view]);

  const query: MemoListQuery = {
    view:
      view === "settings" ||
        view === "profile" ||
        view === "subscription" ||
        view === "ai" ||
        view === "admin" ||
        view === "published" ||
        view === "random"
        ? "all"
        : view,
    tag,
    q,
    limit: 30,
  };
  const memos = useInfiniteMemos(query);
  const title = tag
    ? `#${tag}`
    : view === "settings"
      ? "偏好设置"
      : view === "profile"
        ? "个人信息"
        : view === "subscription"
          ? "订阅"
          : view === "admin"
            ? "管理员后台"
            : view === "ai"
              ? "Agent"
              : view === "random"
                ? "随机漫游"
                : view === "archive"
                  ? "归档"
                  : view === "published"
                    ? "公开笔记"
                    : view === "pinned"
                      ? "置顶"
                      : "全部笔记";
  const canUseAllNotesMenu = view === "all" && !tag;
  const canReturnToAllNotes =
    !canUseAllNotesMenu &&
    view !== "settings" &&
    view !== "profile" &&
    view !== "ai" &&
    view !== "admin" &&
    view !== "published";
  const visibleMemos = useMemo(() => {
    const currentMemos = memos.data?.pages.flatMap((page) => page.memos) ?? [];
    return canUseAllNotesMenu ? sortMemos(currentMemos, sortMode) : currentMemos;
  }, [canUseAllNotesMenu, memos.data?.pages, sortMode]);
  const loadMoreMemos = useCallback(() => {
    if (!memos.hasNextPage || memos.isFetchingNextPage) {
      return;
    }
    void memos.fetchNextPage();
  }, [memos.fetchNextPage, memos.hasNextPage, memos.isFetchingNextPage]);
  const visiblePublishedMemos = useMemo(() => {
    const currentMemos = publishedMemos.data?.memos.map((item) => item.memo) ?? [];
    const keyword = q.trim().toLocaleLowerCase();
    if (!keyword) {
      return currentMemos;
    }
    return currentMemos.filter((memo) => memo.content.toLocaleLowerCase().includes(keyword));
  }, [publishedMemos.data?.memos, q]);
  const selectedMemoIdSet = useMemo(() => new Set(selectedMemoIds), [selectedMemoIds]);
  const allVisibleSelected = visibleMemos.length > 0 && visibleMemos.every((memo) => selectedMemoIdSet.has(memo.id));
  const allNotesMenuItems: FloatingMenuItem[] = [
    {
      id: "sort",
      label: "排序方式",
      description: getSortDescription(sortMode),
      icon: <ArrowDownUp size={17} />,
      children: sortOptions.map((option) => ({
        id: option.value,
        label: option.label,
        description: option.description,
        icon: option.icon,
        trailing: sortMode === option.value ? <Check size={16} /> : undefined,
        onSelect: () => setSortMode(option.value),
      })),
    },
    {
      id: "select",
      label: selectionMode ? "退出多选" : "多选笔记",
      icon: <ListChecks size={17} />,
      onSelect: selectionMode ? exitSelectionMode : enterSelectionMode,
    },
    {
      id: "export",
      label: exporting ? "导出中" : "导出",
      icon: <Download size={17} />,
      disabled: exporting,
      onSelect: handleExportMemos,
    },
  ];


  useEffect(() => {
    setSidebarOpen(false);
    setSelectionMode(false);
    setSelectedMemoIds([]);
  }, [location.pathname]);

  useEffect(() => {
    if (view !== "subscription") {
      return;
    }
    setSubscriptionDialogOpen(true);
    navigate("/app", { replace: true });
  }, [navigate, view]);

  useEffect(() => {
    if (view === "admin" && userData && !isAdmin) {
      navigate("/app", { replace: true });
    }
  }, [isAdmin, navigate, userData, view]);

  useEffect(() => {
    if (view !== "random") {
      randomRouteAutoLoadRef.current = false;
      return;
    }
    if (!randomRouteAutoLoadRef.current && !randomMemo && !randomMemoLoading && !randomMemoError) {
      randomRouteAutoLoadRef.current = true;
      void roamRandomMemo();
    }
  }, [randomMemo, randomMemoError, randomMemoLoading, view]);

  /**
   * 打开移动端侧边栏。
   */
  function openMobileSidebar() {
    setSidebarOpen(true);
  }

  /**
   * 关闭移动端侧边栏，并收起侧边栏内的浮层菜单。
   */
  function closeMobileSidebar() {
    setSidebarOpen(false);
  }

  /**
   * 切换快捷视图。
   */
  function selectView(nextView: ViewMode) {
    navigate(getViewPath(nextView));
    closeMobileSidebar();
    setSelectionMode(false);
    setSelectedMemoIds([]);
  }

  /**
   * 打开权益与计划弹窗。
   */
  function openSubscriptionDialog() {
    setSubscriptionDialogOpen(true);
    closeMobileSidebar();
  }

  /**
   * 打开随机漫游页面；重复点击时重新抽取一条 memo。
   */
  function openRandomRoam() {
    if (view === "random") {
      void roamRandomMemo();
      return;
    }
    setRandomMemo(null);
    setRandomMemoError(null);
    randomRouteAutoLoadRef.current = false;
    selectView("random");
  }

  /**
   * 选择标签筛选。
   */
  function selectTag(nextTag: string) {
    navigate(getTagPath(nextTag));
    closeMobileSidebar();
    setSelectionMode(false);
    setSelectedMemoIds([]);
  }

  /**
   * 进入 memo 多选模式。
   */
  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedMemoIds([]);
  }

  /**
   * 退出 memo 多选模式。
   */
  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedMemoIds([]);
  }

  /**
   * 切换单条 memo 的选中状态。
   */
  function toggleMemoSelection(memoId: string) {
    setSelectedMemoIds((current) =>
      current.includes(memoId) ? current.filter((id) => id !== memoId) : [...current, memoId],
    );
  }

  /**
   * 选择或取消选择当前可见 memo。
   */
  function toggleVisibleSelection() {
    if (allVisibleSelected) {
      setSelectedMemoIds((current) => current.filter((id) => !visibleMemos.some((memo) => memo.id === id)));
      return;
    }
    setSelectedMemoIds((current) => Array.from(new Set([...current, ...visibleMemos.map((memo) => memo.id)])));
  }

  /**
   * 批量归档已选择的 memo。
   */
  async function archiveSelectedMemos() {
    if (selectedMemoIds.length === 0) {
      return;
    }
    try {
      await Promise.all(selectedMemoIds.map((id) => updateMemo.mutateAsync({ id, archived: true })));
      toast.success(`已归档 ${selectedMemoIds.length} 条笔记`);
      exitSelectionMode();
    } catch {
      // useUpdateMemo 已负责展示错误提示。
    }
  }

  /**
   * 清空当前用户的所有归档 memo。
   */
  async function clearAllArchivedMemos() {
    if (clearArchivedMemos.isPending || visibleMemos.length === 0) {
      return;
    }
    const confirmed = window.confirm("确认永久删除归档中的所有 memo？此操作不可恢复。");
    if (!confirmed) {
      return;
    }
    try {
      await clearArchivedMemos.mutateAsync();
      exitSelectionMode();
    } catch {
      // useClearArchivedMemos 已负责展示错误提示。
    }
  }

  /**
   * 导出全部 memo 为 Markdown 文件。
   */
  async function handleExportMemos() {
    setExporting(true);
    try {
      const blob = await api.exportMemos("markdown");
      downloadBlob(blob, `flowmemo-export-${new Date().toISOString().slice(0, 10)}.md`);
      toast.success("导出已开始");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  /**
   * 随机漫游一条历史 memo。
   */
  async function roamRandomMemo() {
    if (randomMemoLoading) {
      return;
    }

    setRandomMemoLoading(true);
    setRandomMemoError(null);
    try {
      const result = await api.randomMemo();
      setRandomMemo(result.memo);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "随机漫游失败";
      setRandomMemoError(message);
      toast.error(message);
    } finally {
      setSidebarOpen(false);
      setRandomMemoLoading(false);
    }
  }


  const sidebarProps = { view, tag, onSelectView: selectView, onTagSelect: selectTag, onRandomRoam: openRandomRoam, onOpenSubscription: openSubscriptionDialog };

  return (
    <div className="app-shell">
      <button
        type="button"
        className={cn("mobile-sidebar-backdrop", sidebarOpen && "is-open")}
        aria-label="关闭侧边栏"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={closeMobileSidebar}
      />
      <div
        id="mobile-app-sidebar"
        className={cn("mobile-sidebar", sidebarOpen && "is-open")}
      >
        <AppSidebar {...sidebarProps} />
      </div>
      <div className="desktop-sidebar"><AppSidebar {...sidebarProps} /></div>

      <main
        ref={appMainRef}
        className="app-main"
      >
        <header className="app-topbar">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-[800px]:hidden"
            aria-controls="mobile-app-sidebar"
            aria-expanded={sidebarOpen}
            onClick={openMobileSidebar}
          >
            <Menu size={18} />
          </Button>
          <div className="min-w-0">
            {canUseAllNotesMenu ? (
              <FloatingMenu
                open={titleMenuOpen}
                items={allNotesMenuItems}
                onOpenChange={setTitleMenuOpen}
                trigger={({ open, toggle }) => (
                  <button
                    type="button"
                    className="title-menu-trigger"
                    data-open={open ? "true" : undefined}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={toggle}
                  >
                    <span className="truncate">{title}</span>
                    <ChevronDown size={16} />
                  </button>
                )}
              />
            ) : (
              <h1 className="title-menu-trigger title-heading">
                {canReturnToAllNotes && (
                  <button
                    type="button"
                    className="title-home-button"
                    aria-label="返回全部笔记"
                    title="返回全部笔记"
                    onClick={() => selectView("all")}
                  >
                    <Home size={15} />
                  </button>
                )}
                {canReturnToAllNotes && <span className="title-home-demerger">/</span>}
                <span className="truncate">{title}</span>
              </h1>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {view === "archive" && !selectionMode && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={memos.isLoading || visibleMemos.length === 0 || clearArchivedMemos.isPending}
                onClick={clearAllArchivedMemos}
              >
                <Trash2 size={15} />
                {clearArchivedMemos.isPending ? "删除中" : "清空归档"}
              </Button>
            )}
            {view !== "random" && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mobile-search-toggle sm:hidden"
                  data-active={mobileSearchOpen || q ? "true" : undefined}
                  aria-label={mobileSearchOpen ? "收起搜索" : "搜索 memo"}
                  aria-controls="mobile-memo-search"
                  aria-expanded={mobileSearchOpen}
                  onClick={() => setMobileSearchOpen((current) => !current)}
                >
                  {mobileSearchOpen ? <X size={18} /> : <Search size={18} />}
                </Button>
                <div className="search-shell hidden sm:block">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8f8f8f]"
                    size={17}
                  />
                  <Input
                    className="search-input"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder="⌘ + K"
                  />
                </div>
              </>
            )}
          </div>
        </header>

        <motion.div
          key={`${view}-${tag ?? ""}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="mx-auto w-full max-w-[666[x]] px-4 pt-2 pb-10 sm:px-0"
        >
          {view !== "random" && mobileSearchOpen && (
            <div
              id="mobile-memo-search"
              className="mobile-search-panel sm:hidden"
            >
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8f8f8f]"
                size={17}
              />
              <Input
                ref={mobileSearchInputRef}
                className="mobile-search-input"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="搜索 memo"
              />
              {q && (
                <button
                  type="button"
                  className="mobile-search-clear"
                  aria-label="清空搜索"
                  onClick={() => setQ("")}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}
          {view === "settings" ? (
            <SettingsPanel />
          ) : view === "published" ? (
            <PublishedPanel
              loading={publishedMemos.isLoading}
              memos={visiblePublishedMemos}
              viewerId={userData?.user.id}
              canUploadImages={canUploadImages}
              onTagSelect={selectTag}
            />
          ) : view === "admin" && isAdmin ? (
            <AdminPanel />
          ) : view === "ai" ? (
            <AiComingSoonPanel />
          ) : view === "random" ? (
            <RandomRoamPanel
              memo={randomMemo}
              loading={randomMemoLoading}
              error={randomMemoError}
              viewerId={userData?.user.id}
              canUploadImages={canUploadImages}
              onRoam={roamRandomMemo}
              onTagSelect={selectTag}
            />
          ) : (
            <>
              {selectionMode && (
                <div className="selection-toolbar">
                  <div>
                    <strong>已选择 {selectedMemoIds.length} 条</strong>
                    <span>{getSortDescription(sortMode)}</span>
                  </div>
                  <div className="selection-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={toggleVisibleSelection}
                    >
                      {allVisibleSelected ? "取消全选" : "全选"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={selectedMemoIds.length === 0 || updateMemo.isPending}
                      onClick={archiveSelectedMemos}
                    >
                      <Archive size={15} />
                      归档
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="退出多选"
                      onClick={exitSelectionMode}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                </div>
              )}
              {view !== "archive" && !selectionMode && (
                <MemoComposer canUploadImages={userData?.user.plan === "member"} defaultTag={tag} />
              )}
              <MemoList
                memos={visibleMemos}
                loading={memos.isLoading}
                archiveView={view === "archive"}
                viewerId={userData?.user.id}
                selectionMode={selectionMode}
                selectedMemoIds={selectedMemoIdSet}
                canUploadImages={canUploadImages}
                hasMore={Boolean(memos.hasNextPage)}
                loadingMore={memos.isFetchingNextPage}
                onLoadMore={loadMoreMemos}
                onToggleSelection={toggleMemoSelection}
                onTagSelect={selectTag}
              />
            </>
          )}
        </motion.div>
      </main>
      {view === "profile" && (
        <ProfilePanel onClose={() => selectView("all")} onOpenSubscription={openSubscriptionDialog} />
      )}
      {subscriptionDialogOpen && (
        <SubscriptionPanel
          plan={userData?.user.plan ?? "free"}
          onClose={() => setSubscriptionDialogOpen(false)}
        />
      )}

    </div>
  );
}