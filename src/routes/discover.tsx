import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ItemCard, ApiItem } from "@/components/item-card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const Route = createFileRoute("/discover")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("findit_auth_token")) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Discover Items — FindIt AI" },
      { name: "description", content: "Discover lost and found items reported by others." },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const [type, setType] = useState<"all" | "LOST" | "FOUND">("all");
  const [query, setQuery] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["discover_items"],
    queryFn: () => api.get<ApiItem[]>("/api/items/discover"),
  });

  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (type !== "all" && i.report_type !== type) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !i.item_name.toLowerCase().includes(q) &&
          !i.description.toLowerCase().includes(q) &&
          !i.location.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [items, type, query]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Discover Items</p>
            <h1 className="mt-2 font-display text-4xl md:text-5xl">Community Reports</h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Browse items reported by others in the community to see if your lost item was found, or if an item you found belongs to someone.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
            {filteredItems.length} results
          </span>
        </header>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-background px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by keyword, location…"
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-background p-1">
            {(["all", "LOST", "FOUND"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition " +
                  (type === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <section>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
              <p className="mt-4 text-sm font-medium">Discovering community items...</p>
            </div>
          ) : filteredItems.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}