import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../lib/cn";

export type FloatingMenuItem =
  | {
      id: string;
      type: "separator";
    }
  | {
      id: string;
      type?: "item";
      label: string;
      description?: string;
      icon?: ReactNode;
      trailing?: ReactNode;
      disabled?: boolean;
      danger?: boolean;
      children?: FloatingMenuItem[];
      onSelect?: () => void;
    };

type FloatingMenuActionItem = Extract<FloatingMenuItem, { type?: "item" }>;

function isActionItem(item: FloatingMenuItem): item is FloatingMenuActionItem {
  return item.type !== "separator";
}

type FloatingMenuRootEvent = ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>;

type FloatingMenuProps = {
  open: boolean;
  items: FloatingMenuItem[];
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  onOpenChange: (open: boolean) => void;
  align?: "start" | "end";
  className?: string;
};

/**
 * 通用悬浮菜单，支持一级菜单项与右侧二级菜单。
 */
export function FloatingMenu({ open, items, trigger, onOpenChange, align = "start", className }: FloatingMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const activeSubmenuItem = items.filter(isActionItem).find((item) => item.id === activeSubmenuId && item.children);
  const activeSubmenu = activeSubmenuItem?.children;

  /**
   * 切换菜单展开状态。
   */
  function toggleMenu() {
    onOpenChange(!open);
  }

  /**
   * 阻止菜单触发器和面板事件冒泡到外层可交互容器。
   */
  function stopMenuEvent(event: FloatingMenuRootEvent) {
    event.stopPropagation();
  }

  /**
   * 关闭菜单并重置二级菜单焦点。
   */
  function closeMenu() {
    setActiveSubmenuId(null);
    onOpenChange(false);
  }

  /**
   * 处理菜单项点击。
   */
  function handleItemSelect(item: FloatingMenuActionItem) {
    if (item.disabled) {
      return;
    }
    if (item.children?.length) {
      setActiveSubmenuId((current) => (current === item.id ? null : item.id));
      return;
    }
    item.onSelect?.();
    closeMenu();
  }

  /**
   * 根据当前悬停项更新二级菜单激活状态。
   */
  function handleItemHover(item: FloatingMenuActionItem) {
    setActiveSubmenuId(item.children?.length ? item.id : null);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    /**
     * 点击菜单外部时收起菜单。
     */
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }

    /**
     * 按下 Esc 时收起菜单。
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn("floating-menu-root", className)}
      onPointerDown={stopMenuEvent}
      onClick={stopMenuEvent}
      onDoubleClick={stopMenuEvent}
    >
      {trigger({ open, toggle: toggleMenu })}
      <AnimatePresence>
        {open && (
          <motion.div
            className="floating-menu-panel"
            data-align={align}
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
            onMouseLeave={() => setActiveSubmenuId(null)}
          >
            {items.map((item) =>
              !isActionItem(item) ? (
                <div key={item.id} className="floating-menu-separator" role="separator" />
              ) : (
                <button
                  key={item.id}
                  type="button"
                  className="floating-menu-item"
                  data-active={activeSubmenuId === item.id ? "true" : undefined}
                  data-danger={item.danger ? "true" : undefined}
                  disabled={item.disabled}
                  role="menuitem"
                  onClick={() => handleItemSelect(item)}
                  onMouseEnter={() => handleItemHover(item)}
                  onFocus={() => handleItemHover(item)}
                >
                  <span className="floating-menu-icon">{item.icon}</span>
                  <span className="floating-menu-copy">
                    <span className="floating-menu-label">{item.label}</span>
                    {item.description && <span className="floating-menu-description">{item.description}</span>}
                  </span>
                  <span className="floating-menu-trailing">
                    {item.children?.length ? <ChevronRight size={16} /> : item.trailing}
                  </span>
                </button>
              )
            )}
            <AnimatePresence>
              {activeSubmenu && (
                <motion.div
                  className="floating-menu-submenu"
                  role="menu"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -3 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  style={{ transformOrigin: "top left" }}
                >
                  {activeSubmenu.map((item) =>
                    !isActionItem(item) ? (
                      <div key={item.id} className="floating-menu-separator" role="separator" />
                    ) : (
                      <button
                        key={item.id}
                        type="button"
                        className="floating-menu-item"
                        data-danger={item.danger ? "true" : undefined}
                        disabled={item.disabled}
                        role="menuitem"
                        onClick={() => handleItemSelect(item)}
                      >
                        <span className="floating-menu-icon">{item.icon}</span>
                        <span className="floating-menu-copy">
                          <span className="floating-menu-label">{item.label}</span>
                          {item.description && <span className="floating-menu-description">{item.description}</span>}
                        </span>
                        <span className="floating-menu-trailing">{item.trailing}</span>
                      </button>
                    )
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
