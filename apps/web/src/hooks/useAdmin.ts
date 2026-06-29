import type { UpdateInviteRegistrationRequest, UpdateUserMembershipRequest } from "@flowmemo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "../lib/api";

/**
 * 查询后台用户列表。
 */
export function useAdminUsers(query: { q?: string; cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => api.listAdminUsers(query)
  });
}

/**
 * 查询邀请注册设置和邀请码列表。
 */
export function useAdminInvites() {
  return useQuery({
    queryKey: ["admin", "invites"],
    queryFn: api.listAdminInvites
  });
}

/**
 * 生成一个新的邀请码。
 */
export function useCreateAdminInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.createAdminInvite,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "invites"] });
      toast.success(`邀请码已生成：${data.code.code}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "生成邀请码失败");
    }
  });
}

/**
 * 更新邀请注册开关。
 */
export function useUpdateInviteRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateInviteRegistrationRequest) => api.updateInviteRegistration(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "invites"] });
      toast.success("邀请注册设置已更新");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "更新邀请注册设置失败");
    }
  });
}

/**
 * 更新用户会员状态。
 */
export function useUpdateUserMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { id: string } & UpdateUserMembershipRequest) =>
      api.updateUserMembership(payload.id, {
        plan: payload.plan,
        membershipExpiresAt: payload.membershipExpiresAt
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("会员状态已更新");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "更新会员状态失败");
    }
  });
}
