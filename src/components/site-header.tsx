import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Plus, LayoutDashboard, Bell, Inbox, LogOut, Menu, X, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getImageUrl } from "@/lib/utils";

export function SiteHeader() {
  const { isAuthenticated, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const { data: unreadData } = useQuery({
    queryKey: ["notificationUnreadCount"],
    queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count"),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground font-display text-xl">
            F
          </span>
          <span className="font-display text-xl sm:text-2xl leading-none">
            FindIt<span className="text-amber-accent">.</span>
            <span className="text-muted-foreground text-sm sm:text-base italic ml-0.5">ai</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        {isAuthenticated && (
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            <NavLink to="/dashboard" icon={<LayoutDashboard className="size-4" />}>Dashboard</NavLink>
            <NavLink to="/feed" icon={<Search className="size-4" />}>My Items</NavLink>
            <NavLink to="/discover" icon={<Search className="size-4" />}>Discover</NavLink>
            <NavLink to="/matches" icon={<Inbox className="size-4" />}>Matches</NavLink>
            <NavLink to="/notifications" icon={
              <div className="relative">
                <Bell className="size-4" />
                {unreadData && unreadData.count > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-bold text-destructive-foreground">
                    {unreadData.count > 99 ? '99+' : unreadData.count}
                  </span>
                )}
              </div>
            }>
              Notifications
            </NavLink>
          </nav>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {!isAuthenticated ? (
            <>
              <Link
                to="/login"
                className="inline-flex h-8 sm:h-9 items-center rounded-full px-3 text-xs sm:text-sm font-medium transition hover:bg-secondary"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex h-8 sm:h-9 items-center rounded-full bg-primary px-3 sm:px-4 text-xs sm:text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/profile"
                className="hidden md:flex items-center gap-2 text-sm font-medium text-muted-foreground mr-1 hover:text-foreground"
              >
                <div className="size-7 rounded-full overflow-hidden bg-secondary border border-border">
                  <img 
                    src={user?.avatar_path ? getImageUrl(user.avatar_path) : `https://api.dicebear.com/7.x/notionists/svg?seed=${user?.name || 'user'}`} 
                    alt="Profile" 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <span className="max-w-[100px] truncate">{user?.name}</span>
              </Link>
              <Link
                to="/report"
                className="inline-flex h-8 sm:h-9 items-center gap-1 rounded-full bg-primary px-2.5 sm:px-3.5 text-xs sm:text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                <Plus className="size-3.5 sm:size-4" />
                <span>Report</span>
              </Link>

              {/* Mobile Menu Trigger Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="inline-flex md:hidden size-8 sm:size-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-secondary"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </button>

              <button
                onClick={logout}
                className="hidden md:inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                title="Log out"
              >
                <LogOut className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Navigation Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="border-t border-border bg-background/95 backdrop-blur-lg px-4 py-4 md:hidden shadow-xl animate-in slide-in-from-top-2 duration-200">
          {isAuthenticated && user && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <div className="size-10 rounded-full overflow-hidden bg-secondary border border-border shrink-0">
                <img 
                  src={user?.avatar_path ? getImageUrl(user.avatar_path) : `https://api.dicebear.com/7.x/notionists/svg?seed=${user?.name || 'user'}`} 
                  alt="Profile" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          )}

          <nav className="flex flex-col gap-1">
            {isAuthenticated ? (
              <>
                <MobileNavLink to="/dashboard" onClick={() => setMobileMenuOpen(false)} icon={<LayoutDashboard className="size-4" />}>
                  Dashboard
                </MobileNavLink>
                <MobileNavLink to="/feed" onClick={() => setMobileMenuOpen(false)} icon={<Search className="size-4" />}>
                  My Items
                </MobileNavLink>
                <MobileNavLink to="/discover" onClick={() => setMobileMenuOpen(false)} icon={<Search className="size-4" />}>
                  Discover Community Items
                </MobileNavLink>
                <MobileNavLink to="/matches" onClick={() => setMobileMenuOpen(false)} icon={<Inbox className="size-4" />}>
                  Matches & Claims
                </MobileNavLink>
                <MobileNavLink to="/notifications" onClick={() => setMobileMenuOpen(false)} icon={
                  <div className="relative">
                    <Bell className="size-4" />
                    {unreadData && unreadData.count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-destructive" />
                    )}
                  </div>
                }>
                  Notifications {unreadData && unreadData.count > 0 ? `(${unreadData.count})` : ''}
                </MobileNavLink>
                <div className="my-2 border-t border-border" />
                <MobileNavLink to="/profile" onClick={() => setMobileMenuOpen(false)} icon={<UserIcon className="size-4" />}>
                  Profile
                </MobileNavLink>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 text-left"
                >
                  <LogOut className="size-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <MobileNavLink to="/login" onClick={() => setMobileMenuOpen(false)}>Sign In</MobileNavLink>
                <MobileNavLink to="/register" onClick={() => setMobileMenuOpen(false)}>Create Account</MobileNavLink>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function MobileNavLink({
  to,
  icon,
  children,
  onClick,
}: {
  to: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      activeProps={{ className: "bg-secondary text-foreground font-semibold" }}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      activeProps={{ className: "bg-secondary text-foreground" }}
    >
      {icon}
      {children}
    </Link>
  );
}