import type { ApiTokenListResponse, CreateApiTokenRequest } from "@flowmemo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const apiTokensKey = ["api-tokens"];

/** 查询当前用户的 API Token，统一交给 React Query 管理缓存。 */
export function useApiTokens() {
  return useQuery({ queryKey: apiTokensKey, queryFn: api.listApiTokens });
}

/** 创建成功后刷新列表，错误由调用方按当前交互展示。 */
export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateApiTokenRequest) => api.createApiToken(payload),
    onSuccess: (data) => {
      queryClient.setQueryData<ApiTokenListResponse>(apiTokensKey, (current) => ({
        tokens: [data.apiToken, ...(current?.tokens ?? [])]
      }));
      void queryClient.invalidateQueries({ queryKey: apiTokensKey });
    }
  });
}

/** 撤销后立即从缓存移除，避免继续展示已失效的 Token。 */
export function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.revokeApiToken,
    onSuccess: (_, id) => {
      queryClient.setQueryData<ApiTokenListResponse>(apiTokensKey, (current) => ({
        tokens: (current?.tokens ?? []).filter((token) => token.id !== id)
      }));
      void queryClient.invalidateQueries({ queryKey: apiTokensKey });
    }
  });
}
