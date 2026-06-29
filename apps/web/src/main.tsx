import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AppLayout } from "./pages/AppLayout";
import { ExplorePage } from "./pages/ExplorePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false
    }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/explore/:publicId" element={<ExplorePage />} />
          <Route path="/app" element={<AppLayout />} />
          <Route path="/app/pinned" element={<AppLayout initialView="pinned" />} />
          <Route path="/app/archive" element={<AppLayout initialView="archive" />} />
          <Route path="/app/published" element={<AppLayout initialView="published" />} />
          <Route path="/app/random" element={<AppLayout initialView="random" />} />
          <Route path="/app/profile" element={<AppLayout initialView="profile" />} />
          <Route path="/app/settings" element={<AppLayout initialView="settings" />} />
          <Route path="/app/subscription" element={<AppLayout initialView="subscription" />} />
          <Route path="/app/ai" element={<AppLayout initialView="ai" />} />
          <Route path="/app/admin" element={<AppLayout initialView="admin" />} />
          <Route path="/app/tags/:tagName" element={<AppLayout />} />
          <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
          <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  </StrictMode>
);
