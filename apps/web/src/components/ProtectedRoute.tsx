import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "../hooks/useAuth";

type ProtectedRouteProps = {
  children: ReactNode;
};

/**
 * 保护登录后才能访问的页面。
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { data, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <LoaderCircle className="protected-route-loading-icon" size={18} aria-hidden="true" />
        正在确认登录状态
      </div>
    );
  }

  if (isError || !data?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
