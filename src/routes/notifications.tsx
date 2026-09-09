import { createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";
import { SiteHeader } from "@/components/site-header";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Bell, Check, Trash2, ArrowRight, MessageSquare, ShieldCheck, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/notifications")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("findit_auth_token")) {
      throw redirect({ to: "/login" });
    }
  },
  component: NotificationsPage,
});

interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  related_match_id?: number;
  related_verification_id?: number;
  related_item_id?: number;
  related_user_id?: number;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  items: Notification[];
  total: number;
  page: number;
  limit: number;
}

function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationsResponse>("/api/notifications/?limit=50"),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationUnreadCount"] });
    }
  });
  
  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch("/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationUnreadCount"] });
      toast.success("All marked as read");
    }
  });

  const notifications = data?.items || [];

  React.useEffect(() => {
    if (notifications.some(n => !n.is_read)) {
      markAllReadMutation.mutate();
    }
  }, [notifications, markAllReadMutation]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-display text-4xl">Notifications</h1>
          </div>
          <button 
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || notifications.every(n => n.is_read)}
            className="text-sm text-primary hover:underline disabled:opacity-50"
          >
            Mark all as read
          </button>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="mt-4 text-sm font-medium">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-20 text-center text-muted-foreground">
            <Bell className="mx-auto size-10 opacity-50" />
            <h3 className="mt-4 font-display text-xl text-foreground">No notifications</h3>
            <p className="mt-2 text-sm text-muted-foreground">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div 
                key={n.id} 
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  n.is_read ? "border-border bg-card opacity-70" : "border-primary/30 bg-primary/5"
                )}
              >
                <div className="flex gap-4">
                  <div className="mt-1">
                    <Bell className={cn("size-5", n.is_read ? "text-muted-foreground" : "text-primary")} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-medium text-sm">{n.title}</h3>
                      <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                    
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {!n.is_read && (
                        <button 
                          onClick={() => markReadMutation.mutate(n.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Mark as read
                        </button>
                      )}

                      {/* 1. Chat Message Notification Link */}
                      {(n.type?.includes("CHAT") || n.title?.toLowerCase().includes("chat") || n.title?.toLowerCase().includes("message")) && n.related_match_id && (
                        <Link 
                          to="/matches"
                          search={{ chatMatchId: n.related_match_id }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 border border-primary/20 transition shadow-xs"
                        >
                          <MessageSquare className="size-3.5" />
                          <span>View Chat</span>
                        </Link>
                      )}

                      {/* 2. Verification Required Notification Link */}
                      {n.related_verification_id && (
                        <Link 
                          to="/claim/$id"
                          params={{ id: String(n.related_verification_id) }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-500/20 border border-blue-500/20 transition shadow-xs"
                        >
                          <ShieldCheck className="size-3.5" />
                          <span>View Verification</span>
                        </Link>
                      )}

                      {/* 3. Match Notification Link */}
                      {n.related_match_id && !(n.type?.includes("CHAT") || n.title?.toLowerCase().includes("chat") || n.title?.toLowerCase().includes("message")) && (
                        <Link 
                          to="/matches"
                          className="inline-flex items-center gap-1.5 rounded-full bg-amber-accent/15 px-3.5 py-1.5 text-xs font-medium text-amber-accent-foreground hover:bg-amber-accent/25 border border-amber-accent/30 transition shadow-xs"
                        >
                          <Inbox className="size-3.5" />
                          <span>View Match</span>
                        </Link>
                      )}

                      {/* 4. Related Item Notification Link */}
                      {n.related_item_id && (
                        <Link 
                          to="/item/$id"
                          params={{ id: String(n.related_item_id) }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 border border-border transition shadow-xs"
                        >
                          <span>View Item</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
