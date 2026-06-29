import type { MemoListQuery } from "@flowmemo/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "../lib/api";

/**
 * memo 列表查询。
 */
export function useMemos(query: MemoListQuery) {
  return useQuery({
    queryKey: ["memos", query],
    queryFn: () => api.listMemos(query)
  });
}

/**
 * memo 列表无限滚动查询。
 */
export function useInfiniteMemos(query: MemoListQuery) {
  return useInfiniteQuery({
    queryKey: ["memos", "infinite", query],
    queryFn: ({ pageParam }) => api.listMemos({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });
}

/**
 * 标签列表查询。
 */
export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags
  });
}

/**
 * 当前用户已公开 memo 列表查询。
 */
export function usePublishedMemos() {
  return useQuery({
    queryKey: ["memos", "published"],
    queryFn: api.listPublishedMemos
  });
}

/**
 * 更新标签图标 mutation。
 */
export function useUpdateTagIcon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { id: string; icon: string | null }) => api.updateTagIcon(payload.id, payload.icon),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "更新标签图标失败");
    }
  });
}

/**
 * 日历统计查询。
 */
export function useCalendarStats(from: string, to: string, utcOffsetMinutes: number) {
  return useQuery({
    queryKey: ["stats", "calendar", from, to, utcOffsetMinutes],
    queryFn: () => api.calendarStats(from, to, utcOffsetMinutes)
  });
}

/**
 * 侧边栏概览统计查询。
 */
export function useOverviewStats() {
  return useQuery({
    queryKey: ["stats", "overview"],
    queryFn: api.overviewStats
  });
}

/**
 * 创建 memo mutation。
 */
export function useCreateMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.createMemo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "overview"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "保存失败");
    }
  });
}

/**
 * 更新 memo mutation。
 */
export function useUpdateMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { id: string; content?: string; pinned?: boolean; archived?: boolean }) =>
      api.updateMemo(payload.id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "overview"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "更新失败");
    }
  });
}

/**
 * 公开发布 memo mutation。
 */
export function usePublishMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.publishMemo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "生成公开链接失败");
    }
  });
}

/**
 * 取消公开发布 memo mutation。
 */
export function useUnpublishMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.unpublishMemo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "取消公开失败");
    }
  });
}

/**
 * 永久删除 memo mutation。
 */
export function useDeleteMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.deleteMemo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "overview"] });
      toast.success("已永久删除");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "删除失败");
    }
  });
}

/**
 * 清空归档 memo mutation。
 */
export function useClearArchivedMemos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.clearArchivedMemos,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["stats", "overview"] });
      toast.success(data.deleted > 0 ? `已永久删除 ${data.deleted} 条归档 memo` : "归档已是空的");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "清空归档失败");
    }
  });
}
