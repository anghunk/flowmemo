import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, ApiError, clearSessionToken, saveSessionToken } from "../lib/api";

/**
 * 查询当前登录用户。
 */
export function useMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.me
  });
}

/**
 * 登录 mutation。
 */
export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (payload: { account: string; password: string }) => api.login(payload.account, payload.password),
    onSuccess: (data) => {
      saveSessionToken(data.sessionToken);
      queryClient.setQueryData(["auth", "me"], data);
      navigate("/app", { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "登录失败");
    }
  });
}

/**
 * 注册 mutation。
 */
export function useRegister() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (payload: { account: string; password: string; inviteCode: string }) =>
      api.register(payload.account, payload.password, payload.inviteCode),
    onSuccess: (data) => {
      saveSessionToken(data.sessionToken);
      queryClient.setQueryData(["auth", "me"], data);
      navigate("/app", { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "注册失败");
    }
  });
}

/**
 * 退出登录 mutation。
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      clearSessionToken();
      queryClient.clear();
      navigate("/login", { replace: true });
    }
  });
}

/**
 * 更新当前用户资料 mutation。
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { nickname: string }) => api.updateProfile(payload.nickname),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data);
      toast.success("昵称已更新");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "更新昵称失败");
    }
  });
}
