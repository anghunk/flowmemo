import type { Tag } from "@flowmemo/shared";
import {
  Archive,
  Bot,
  ChevronDown,
  CreditCard,
  Globe2,
  Grid2X2,
  LogOut,
  Pin,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  UserRound
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarHeatmap } from "../../components/CalendarHeatmap";
import type { FloatingMenuItem } from "../../components/ui/FloatingMenu";
import { FloatingMenu } from "../../components/ui/FloatingMenu";
import { Input } from "../../components/ui/Input";
import { useLogout, useMe } from "../../hooks/useAuth";
import {
  useCalendarStats,
  useOverviewStats,
  useTags,
  useUpdateTagIcon
} from "../../hooks/useMemos";


import type { ViewMode } from "./navigation";
import { SidebarButton, TagIcon, TagIconDialog, TagSidebarItem } from "./TagSidebar";

/** 工作台侧边栏只依赖当前视图和导航动作。 */
type AppSidebarProps = {
  view: ViewMode;
  tag?: string;
  onSelectView: (view: ViewMode) => void;
  onTagSelect: (tag: string) => void;
  onRandomRoam: () => void;
  onOpenSubscription: () => void;
};

/**
 * 获取月份查询范围。
 */
function getHeatmapRange(weeks: number): { from: string; to: string; } {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const start = new Date(end);
  start.setDate(end.getDate() - weeks * 7);
  const from = start.toISOString();
  const to = end.toISOString();
  return { from, to };
}

/**
 * 获取本地时区相对 UTC 的分钟偏移，用于热力图按本地日期聚合。
 */
function getLocalUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/** 管理统计、标签筛选和侧边栏菜单。 */
export function AppSidebar({ view, tag, onSelectView, onTagSelect, onRandomRoam, onOpenSubscription }: AppSidebarProps) {
  const { data: userData } = useMe();
  const logout = useLogout();
  const isAdmin = userData?.user.role === "admin";
  const displayName = userData?.user.nickname || userData?.user.account || "FlowMemo";
  const updateTagIcon = useUpdateTagIcon();
  const tags = useTags();
  const overview = useOverviewStats();
  const heatmapWeeks = 18;
  const range = useMemo(() => getHeatmapRange(heatmapWeeks), []);
  const heatmapUtcOffsetMinutes = useMemo(() => getLocalUtcOffsetMinutes(), []);
  const calendar = useCalendarStats(range.from, range.to, heatmapUtcOffsetMinutes);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagMenuOpen, setTagMenuOpen] = useState<string | null>(null);
  const [iconDialogTagId, setIconDialogTagId] = useState<string | null>(null);

  const visibleTags = useMemo(() => {
    const allTags = tags.data?.tags ?? [];
    const keyword = tagSearch.trim().toLocaleLowerCase();
    if (!keyword) {
      return allTags.slice(0, 12);
    }
    return allTags.filter((item) => item.name.toLocaleLowerCase().includes(keyword));
  }, [tagSearch, tags.data?.tags]);
  const iconDialogTag = useMemo(
    () => (tags.data?.tags ?? []).find((item) => item.id === iconDialogTagId) ?? null,
    [iconDialogTagId, tags.data?.tags],
  );
  const profileMenuItems: FloatingMenuItem[] = [
    ...(isAdmin
      ? [
        {
          id: "admin",
          label: "管理员后台",
          icon: <ShieldCheck size={17} />,
          onSelect: () => onSelectView("admin"),
        },
        {
          id: "admin-separator",
          type: "separator" as const,
        },
      ]
      : []),
    {
      id: "profile",
      label: "个人信息",
      icon: <UserRound size={17} />,
      onSelect: () => onSelectView("profile"),
    },
    {
      id: "subscription",
      label: "权益与订阅",
      icon: <CreditCard size={17} />,
      onSelect: onOpenSubscription,
    },
    {
      id: "settings",
      label: "偏好设置",
      icon: <Settings size={17} />,
      onSelect: () => onSelectView("settings"),
    },
    {
      id: "logout",
      label: logout.isPending ? "退出中" : "退出",
      icon: <LogOut size={17} />,
      disabled: logout.isPending,
      onSelect: () => logout.mutate(),
    },
  ];
  /**
   * 切换标签列表展开状态。
   */
  function toggleTagsExpanded() {
    setTagsExpanded((current) => !current);
  }

  /**
   * 切换标签搜索框展示状态。
   */
  function toggleTagSearch() {
    setTagsExpanded(true);
    setTagSearchOpen((current) => {
      if (current) {
        setTagSearch("");
      }
      return !current;
    });
  }

  /**
   * 生成单个标签的更多菜单项。
   */
  function getTagMenuItems(item: Tag): FloatingMenuItem[] {
    return [
      {
        id: "change-icon",
        label: "更换图标",
        icon: (
          <TagIcon
            icon={item.icon}
            size={17}
          />
        ),
        onSelect: () => {
          setTagMenuOpen(null);
          setIconDialogTagId(item.id);
        },
      },
    ];
  }

  /**
   * 保存标签图标设置。
   */
  function updateSelectedTagIcon(item: Tag, icon: string | null) {
    updateTagIcon.mutate(
      { id: item.id, icon },
      {
        onSuccess: () => {
          toast.success("标签图标已更新");
          setIconDialogTagId(null);
        },
      },
    );
  }

  return (
    <>
      <aside className="app-sidebar">
        <section className="profile-panel">
          <FloatingMenu
            open={profileMenuOpen}
            items={profileMenuItems}
            onOpenChange={(open) => setProfileMenuOpen(open)}
            className="profile-menu"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="profile-menu-trigger"
                data-open={open ? "true" : undefined}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
              >
                <span className="min-w-0 truncate">{displayName}</span>
                <span
                  className="profile-badge"
                  data-plan={userData?.user.plan}
                >
                  {userData?.user.plan === "member" ? "PRO" : "FREE"}
                </span>
                <ChevronDown size={15} />
              </button>
            )}
          />
          <div className="profile-stats">
            <div>
              <strong>{overview.data?.totalMemos ?? 0}</strong>
              <span>笔记</span>
            </div>
            <div>
              <strong>{overview.data?.totalTags ?? 0}</strong>
              <span>标签</span>
            </div>
            <div>
              <strong>{overview.data?.activeDays ?? 0}</strong>
              <span>天</span>
            </div>
          </div>
          <CalendarHeatmap
            stats={calendar.data?.days ?? []}
            weeks={heatmapWeeks}
          />
        </section>

        <nav className="sidebar-section space-y-1">
          <SidebarButton
            active={view === "all" && !tag}
            icon={<Grid2X2 size={16} />}
            onClick={() => onSelectView("all")}
          >
            全部笔记
          </SidebarButton>
          <SidebarButton
            active={view === "pinned"}
            icon={<Pin size={16} />}
            onClick={() => onSelectView("pinned")}
          >
            置顶
          </SidebarButton>
          <SidebarButton
            active={view === "archive"}
            icon={<Archive size={16} />}
            onClick={() => onSelectView("archive")}
          >
            归档
          </SidebarButton>
          <SidebarButton
            active={view === "published"}
            icon={<Globe2 size={16} />}
            onClick={() => onSelectView("published")}
          >
            公开笔记
          </SidebarButton>
          <SidebarButton
            active={view === "ai"}
            icon={<Bot size={16} />}
            onClick={() => onSelectView("ai")}
          >
            Agent
          </SidebarButton>
          <SidebarButton
            active={view === "random"}
            icon={<Shuffle size={16} />}
            onClick={onRandomRoam}
          >
            随机漫游
          </SidebarButton>
        </nav>

        <section className="sidebar-section tag-section">
          <div className="tag-section-heading">
            <button
              type="button"
              className="tag-section-header"
              aria-expanded={tagsExpanded}
              onClick={toggleTagsExpanded}
            >
              <span>全部标签</span>
              <ChevronDown
                className="tag-section-arrow"
                size={14}
              />
            </button>
            <button
              type="button"
              className="tag-search-toggle"
              data-active={tagSearchOpen ? "true" : undefined}
              aria-label={tagSearchOpen ? "关闭标签搜索" : "搜索标签"}
              aria-pressed={tagSearchOpen}
              title={tagSearchOpen ? "关闭标签搜索" : "搜索标签"}
              onClick={toggleTagSearch}
            >
              <Search size={15} />
            </button>
          </div>
          {tagsExpanded && (
            <div className="tag-section-body">
              {tagSearchOpen && (
                <div className="tag-search-shell">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a3a3a3]"
                    size={14}
                  />
                  <Input
                    className="tag-search-input"
                    value={tagSearch}
                    onChange={(event) => setTagSearch(event.target.value)}
                    placeholder="搜索标签"
                    autoFocus
                  />
                </div>
              )}
              <div className="space-y-1">
                {visibleTags.map((item) => (
                  <TagSidebarItem
                    key={item.id}
                    tag={item}
                    active={tag === item.name}
                    menuOpen={tagMenuOpen === item.id}
                    menuItems={getTagMenuItems(item)}
                    onMenuOpenChange={(open) => setTagMenuOpen(open ? item.id : null)}
                    onSelect={() => onTagSelect(item.name)}
                  />
                ))}
                {(tags.data?.tags ?? []).length === 0 && <p className="px-2 text-sm text-muted-foreground">暂无标签</p>}
                {(tags.data?.tags ?? []).length > 0 && visibleTags.length === 0 && (
                  <p className="px-2 text-sm text-muted-foreground">没有匹配标签</p>
                )}
              </div>
            </div>
          )}
        </section>
      </aside>
      {iconDialogTag && <TagIconDialog tag={iconDialogTag} submitting={updateTagIcon.isPending}
        onClose={() => setIconDialogTagId(null)} onSelectIcon={(icon) => updateSelectedTagIcon(iconDialogTag, icon)} />}
    </>
  );
}
