
export type ViewMode =
  | "all"
  | "pinned"
  | "archive"
  | "published"
  | "random"
  | "profile"
  | "settings"
  | "subscription"
  | "ai"
  | "admin";

type RouteViewState = {
  view: ViewMode;
  tag?: string;
};

/**
 * 根据视图生成应用内路由。
 */
export function getViewPath(view: ViewMode): string {
  if (view === "pinned") {
    return "/app/pinned";
  }
  if (view === "archive") {
    return "/app/archive";
  }
  if (view === "published") {
    return "/app/published";
  }
  if (view === "random") {
    return "/app/random";
  }
  if (view === "settings") {
    return "/app/settings";
  }
  if (view === "profile") {
    return "/app/profile";
  }
  if (view === "subscription") {
    return "/app/subscription";
  }
  if (view === "ai") {
    return "/app/ai";
  }
  if (view === "admin") {
    return "/app/admin";
  }
  return "/app";
}

/**
 * 根据标签名称生成标签筛选路由。
 */
export function getTagPath(tagName: string): string {
  return `/app/tags/${encodeURIComponent(tagName)}`;
}

/**
 * 从当前路径解析应用视图状态。
 */
export function getRouteViewState(pathname: string, fallbackView: ViewMode): RouteViewState {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === "/app/pinned") {
    return { view: "pinned" };
  }
  if (normalizedPath === "/app/archive") {
    return { view: "archive" };
  }
  if (normalizedPath === "/app/published") {
    return { view: "published" };
  }
  if (normalizedPath === "/app/random") {
    return { view: "random" };
  }
  if (normalizedPath === "/app/settings" || normalizedPath === "/settings") {
    return { view: "settings" };
  }
  if (normalizedPath === "/app/profile" || normalizedPath === "/profile") {
    return { view: "profile" };
  }
  if (normalizedPath === "/app/subscription") {
    return { view: "subscription" };
  }
  if (normalizedPath === "/app/ai") {
    return { view: "ai" };
  }
  if (normalizedPath === "/app/admin") {
    return { view: "admin" };
  }
  if (normalizedPath.startsWith("/app/tags/")) {
    const encodedTag = normalizedPath.slice("/app/tags/".length);
    if (encodedTag) {
      try {
        return { view: "all", tag: decodeURIComponent(encodedTag) };
      } catch {
        return { view: "all" };
      }
    }
  }
  return { view: fallbackView };
}
