import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * 查询当前账号可用的 AI 模式。
 */
export function useAiEntitlement() {
  return useQuery({
    queryKey: ["ai", "entitlement"],
    queryFn: api.aiEntitlement
  });
}
