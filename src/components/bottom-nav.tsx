import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Search, Plus, Inbox, Bell, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { isAuthenticated } = useAuth();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const { data: unreadData } = useQuery({
    queryKey: ["notificationUnreadCount"],
    queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count"),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  if (!isAuthenticated) {
    return null;
  }

  const navItems = [
    {
      to: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: currentPath === "/dashboard",
    },
    {
      to: "/discover",
      label: "Discover",
      icon: Search,
      active: currentPath === "/discover",
    },
    {
      to: "/report",
      label: "Report",
      icon: Plus,
      isSpecial: true,
      active: currentPath === "/report",
    },
    {
      to: "/matches",
      label: "Matches",
      icon: Inbox,
      active: currentPath === "/matches" || currentPath.startsWith("/claim"),
    },
    {
      to: "/notifications",
      label: "Alerts",
      icon: Bell,
      badge: unreadData && unreadData.count > 0 ? unreadData.count : undefined,
      active: currentPath === "/notifications",
    },
    {
      to: "/profile",
      label: "Profile",
      icon: User,
      active: currentPath === "/profile" || currentPath === "/settings",
    },
  ];

  return (
    <nav 
      aria-label="Mobile Navigation" 
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur-md pb-[max(0.35rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isSpecial) {
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group relative -top-3.5 flex flex-col items-center"
              >
                <div className={cn(
                  "flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 group-hover:scale-105",
                  item.active && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}>
                  <Icon className="size-6 stroke-[2.5]" />
                </div>
                <span className="mt-1 text-[10px] font-semibold text-primary">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center py-1 transition-colors",
                item.active 
                  ? "text-primary font-semibold" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn("size-5 transition-transform", item.active && "scale-110 stroke-[2.25]")} />
                {item.badge !== undefined && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[10px] tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
