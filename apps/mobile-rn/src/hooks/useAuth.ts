import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, clearSessionToken, saveSessionToken } from "../lib/api";

/**
 * 查询当前登录用户。
 */
export function useMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.me,
    retry: false
  });
}

/**
 * 登录 mutation。
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { account: string; password: string }) => api.login(payload.account, payload.password),
    onSuccess: async (data) => {
      await saveSessionToken(data.sessionToken);
      queryClient.setQueryData(["auth", "me"], data);
    }
  });
}

/**
 * 注册 mutation。
 */
export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { account: string; password: string; inviteCode: string }) =>
      api.register(payload.account, payload.password, payload.inviteCode),
    onSuccess: async (data) => {
      await saveSessionToken(data.sessionToken);
      queryClient.setQueryData(["auth", "me"], data);
    }
  });
}

/**
 * 退出登录 mutation。
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.logout,
    onSettled: async () => {
      await clearSessionToken();
      queryClient.clear();
    }
  });
}

/**
 * 更新个人资料 mutation。
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { nickname: string }) => api.updateProfile(payload.nickname),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data);
    }
  });
}
