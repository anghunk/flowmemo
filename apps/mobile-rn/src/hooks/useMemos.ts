import type { MemoListQuery } from "@flowmemo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

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
 * 标签列表查询。
 */
export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags
  });
}

/**
 * 当前用户公开 memo 列表查询。
 */
export function usePublishedMemos() {
  return useQuery({
    queryKey: ["memos", "published"],
    queryFn: api.listPublishedMemos
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    }
  });
}

/**
 * 生成公开链接 mutation。
 */
export function usePublishMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.publishMemo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["memos", "published"] });
    }
  });
}

/**
 * 取消公开链接 mutation。
 */
export function useUnpublishMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.unpublishMemo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["memos", "published"] });
    }
  });
}
