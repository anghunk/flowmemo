import { createPortal } from "react-dom";
import type { Tag } from "@flowmemo/shared";
import {
  Check,
  Hash,
  MoreHorizontal,
  X
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import type { FloatingMenuItem } from "../../components/ui/FloatingMenu";
import { FloatingMenu } from "../../components/ui/FloatingMenu";

const TagEmojiPicker = lazy(() =>
  import("../../components/TagEmojiPicker").then((module) => ({ default: module.TagEmojiPicker })),
);

const legacyTagIconEmoji: Record<string, string> = {
  book: "📖",
  briefcase: "💼",
  calendar: "📅",
  code: "💻",
  heart: "❤️",
  home: "🏠",
  lightbulb: "💡",
  star: "⭐",
  user: "👤",
};

/**
 * 获取标签图标展示文本，兼容旧版内置图标 id。
 */
function getTagIconText(icon: string | null | undefined): string | null {
  if (!icon) {
    return null;
  }
  return legacyTagIconEmoji[icon] ?? icon;
}

/**
 * 渲染标签图标，未设置时显示井号。
 */
export function TagIcon({ icon, size = 15 }: { icon: string | null | undefined; size?: number; }) {
  const iconText = getTagIconText(icon);
  if (!iconText) {
    return <Hash size={size} />;
  }
  return (
    <span
      className="tag-emoji-icon"
      style={{ fontSize: size + 1 }}
      aria-hidden="true"
    >
      {iconText}
    </span>
  );
}

type SidebarButtonProps = {
  active?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
};

type TagSidebarItemProps = {
  tag: Tag;
  active?: boolean;
  menuOpen: boolean;
  menuItems: FloatingMenuItem[];
  onMenuOpenChange: (open: boolean) => void;
  onSelect: () => void;
};

type TagIconDialogProps = {
  tag: Tag;
  submitting: boolean;
  onClose: () => void;
  onSelectIcon: (icon: string | null) => void;
};

/**
 * 标签图标选择弹窗。
 */
export function TagIconDialog({ tag, submitting, onClose, onSelectIcon }: TagIconDialogProps) {
  const currentIcon = getTagIconText(tag.icon);

  useEffect(() => {
    /**
     * 按下 Esc 时关闭图标选择弹窗。
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <motion.div
      className="dialog-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="tag-icon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-icon-dialog-title"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tag-icon-dialog-header">
          <div className="tag-icon-dialog-title-row">
            <span className="tag-icon-dialog-preview">
              {currentIcon ? (
                <span
                  className="tag-icon-dialog-emoji"
                  aria-hidden="true"
                >
                  {currentIcon}
                </span>
              ) : (
                <Hash size={24} />
              )}
            </span>
            <div className="min-w-0">
              <h2 id="tag-icon-dialog-title">更换图标</h2>
              <p>#{tag.name}</p>
            </div>
          </div>
          <button
            type="button"
            className="dialog-close-button"
            aria-label="关闭弹窗"
            title="关闭"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
        <div className="tag-icon-dialog-toolbar">
          <button
            type="button"
            className="tag-icon-default-button"
            data-selected={!tag.icon ? "true" : undefined}
            disabled={submitting}
            onClick={() => onSelectIcon(null)}
          >
            <span>
              <Hash size={16} />
              默认
            </span>
            {!tag.icon && <Check size={15} />}
          </button>
        </div>
        <div className="tag-icon-picker-shell">
          <Suspense fallback={<div className="tag-icon-picker-loading">正在加载表情</div>}>
            <TagEmojiPicker onSelect={onSelectIcon} />
          </Suspense>
        </div>
      </motion.section>
    </motion.div>,
    document.body
  );
}

/**
 * 左侧栏标签项，包含标签筛选与更多操作。
 */
export function TagSidebarItem({ tag, active, menuOpen, menuItems, onMenuOpenChange, onSelect }: TagSidebarItemProps) {
  return (
    <div
      className="tag-sidebar-item"
      data-active={active ? "true" : undefined}
      data-menu-open={menuOpen ? "true" : undefined}
    >
      <button
        type="button"
        className="tag-sidebar-select"
        onClick={onSelect}
      >
        <span className="tag-sidebar-icon">
          <TagIcon
            icon={tag.icon}
            size={15}
          />
        </span>
        <span className="tag-sidebar-name">{tag.name}</span>
        <span className="tag-sidebar-count">{tag.memoCount}</span>
      </button>
      <FloatingMenu
        open={menuOpen}
        items={menuItems}
        align="end"
        onOpenChange={onMenuOpenChange}
        className="tag-item-menu"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className="tag-item-menu-trigger"
            data-open={open ? "true" : undefined}
            aria-label={`${tag.name} 更多操作`}
            aria-haspopup="menu"
            aria-expanded={open}
            title="更多操作"
            onClick={toggle}
          >
            <MoreHorizontal size={17} />
          </button>
        )}
      />
    </div>
  );
}

/**
 * 左侧栏按钮。
 */
export function SidebarButton({ active, icon, children, onClick }: SidebarButtonProps) {
  return (
    <button
      type="button"
      className="sidebar-button"
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
