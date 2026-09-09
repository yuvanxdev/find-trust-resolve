import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles, ShieldCheck, Search, Bell, ScanLine } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ItemCard } from "@/components/item-card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// Assume these match the backend schemas
interface Item {
  id: number;
  item_name: string;
  description: string;
  category: string;
  location: string;
  report_type: "LOST" | "FOUND";
  image_path?: string;
  created_at: string;
}

interface Match {
  id: number;
  lost_item_id: number;
  found_item_id: number;
  confidence_score: number;
  status: string;
  created_at: string;
}

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    // Basic route protection, actual protection relies on AuthContext inside component
    if (typeof window !== "undefined" && !localStorage.getItem("findit_auth_token")) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Dashboard — FindIt AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get<Item[]>("/api/items/?limit=10"),
  });

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: () => api.get<Match[]>("/api/matches/"),
  });

  const { data: unreadData } = useQuery({
    queryKey: ["notificationUnreadCount"],
    queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count"),
  });

  const recentItems = items?.slice(0, 4) || [];
  const pendingMatches = matches?.filter((m) => m.status === "PENDING").slice(0, 3) || [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Dashboard</p>
          <h1 className="font-display text-4xl md:text-5xl">Welcome back{user?.name ? `, ${user.name}` : ''}.</h1>
          <p className="text-muted-foreground">Here's what the matching and verification engines have been up to.</p>
        </header>

        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {items !== undefined && <StatCard label="Your reports" value={items.length} icon={<Search className="size-4" />} />}
          {matches !== undefined && <StatCard label="Your AI matches" value={matches.length} icon={<Sparkles className="size-4" />} tint="amber" />}
          {unreadData !== undefined && <StatCard label="Unread Notifs" value={unreadData.count} icon={<Bell className="size-4" />} tint="primary" />}
        </section>

        <section className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Your reports</p>
                <h2 className="mt-1 font-display text-3xl">Recent items</h2>
              </div>
              <Link
                to="/feed"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View all <ArrowUpRight className="size-4" />
              </Link>
            </div>
            
            {itemsLoading ? (
              <p className="text-muted-foreground">Loading items...</p>
            ) : recentItems.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2">
                {recentItems.map((it: any) => (
                  <ItemCard key={it.id} item={it} />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Action Required</p>
              <h3 className="mt-1 font-display text-2xl">{pendingMatches.length} pending matches</h3>
              {matchesLoading ? (
                <p className="mt-4 text-sm text-muted-foreground">Loading matches...</p>
              ) : pendingMatches.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {pendingMatches.map((m) => (
                    <PendingRow key={m.id} matchId={m.id} score={m.confidence_score} status={m.status} />
                  ))}
                </ul>
              )}
            </div>

          </aside>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tint?: "amber" | "primary";
}) {
  const chip =
    tint === "amber"
      ? "bg-amber-accent/25 text-amber-accent-foreground"
      : tint === "primary"
      ? "bg-primary/10 text-primary"
      : "bg-secondary text-secondary-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={"grid size-7 place-items-center rounded-full " + chip}>{icon}</span>
      </div>
      <p className="mt-3 font-display text-4xl">{value}</p>
    </div>
  );
}

function PendingRow({
  matchId,
  score,
  status,
}: {
  matchId: number;
  score: number;
  status: string;
}) {
  return (
    <li className="flex items-center justify-between rounded-2xl border border-border bg-background p-3">
      <div className="min-w-0 flex-1 ml-2">
        <p className="text-sm font-medium">Match #{matchId}</p>
        <p className="text-xs text-muted-foreground">Score: {score.toFixed(1)}%</p>
      </div>
      <Link 
        to={`/matches`} 
        className="text-xs font-medium bg-secondary px-3 py-1.5 rounded-full hover:bg-secondary/80"
      >
        Review
      </Link>
    </li>
  );
}