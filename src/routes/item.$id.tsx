import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Clock, ShieldCheck, ScanLine, Sparkles, Lock } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ItemCard, StatusBadge, TypePill } from "@/components/item-card";
import { CATEGORY_LABEL } from "@/lib/types";
import { getImageUrl } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiItem } from "@/components/item-card";

// Matches API return type
interface ApiMatch {
  id: number;
  lost_item_id: number;
  found_item_id: number;
  confidence_score: number;
  status: string;
}

export const Route = createFileRoute("/item/$id")({
  head: () => {
    return {
      meta: [
        { title: `Item Details — FindIt AI` },
      ],
    };
  },
  component: ItemDetailPage,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl">Item not found</h1>
        <p className="mt-2 text-muted-foreground">The report you're looking for doesn't exist or was removed.</p>
        <Link to="/feed" className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">
          Back to feed
        </Link>
      </div>
    </div>
  );
}

function ItemDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  
  const { data: item, isLoading: itemLoading, error: itemError } = useQuery({
    queryKey: ["item", id],
    queryFn: () => api.get<ApiItem>(`/api/items/public/${id}`),
  });

  const { data: allMatches = [] } = useQuery({
    queryKey: ["matches"],
    queryFn: () => api.get<ApiMatch[]>("/api/matches/"),
  });

  if (itemLoading) {
    return <div className="min-h-screen bg-background flex justify-center p-12 text-muted-foreground">Loading item...</div>;
  }
  if (itemError || !item) return <NotFound />;

  const isDocument = item.category === "documents";
  
  // Filter matches for this item
  const relatedMatches = allMatches.filter(
    (m) => m.lost_item_id === item.id || m.found_item_id === item.id
  );
  
  const imageUrl = getImageUrl(item.image_path);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <button
          onClick={() => navigate({ to: "/feed" })}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to feed
        </button>

        <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              <img
                src={imageUrl}
                alt={item.item_name}
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <TypePill type={item.report_type} />
              <StatusBadge status={item.status} />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {item.category}
              </span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl leading-tight">{item.item_name}</h1>
            <p className="text-muted-foreground">{item.description}</p>

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
              <Meta icon={<MapPin className="size-4" />} label="Location" value={item.location} />
              <Meta icon={<Clock className="size-4" />} label="Reported" value={new Date(item.created_at).toLocaleString()} />
              <Meta icon={<Sparkles className="size-4" />} label="Type" value={item.report_type} />
              {typeof item.matchScore === "number" && (
                <Meta
                  icon={<ShieldCheck className="size-4" />}
                  label="Best match"
                  value={`${Math.round(item.matchScore * 100)}%`}
                />
              )}
            </div>

            {item.status === "released" ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="size-4" /> Owner verified & returned
                </div>
                <p className="mt-1 text-primary/80">
                  Ownership was verified and contact details were released.
                </p>
              </div>
            ) : item.report_type === "FOUND" ? (
              <div className="flex flex-col gap-2">
                  <Link
                    to={`/matches`}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
                  >
                    <ShieldCheck className="size-4" /> View Matches
                  </Link>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3" />
                  Contact info is hidden until verification passes.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-accent/30 bg-amber-accent/10 p-4 text-sm text-amber-accent-foreground">
                <p className="font-medium">Lost report — waiting for a match.</p>
                <p className="mt-1 text-muted-foreground">
                  Anyone who reports this as found will trigger a private verification challenge.
                </p>
              </div>
            )}
          </div>
        </div>

        {relatedMatches.length > 0 && (
          <section className="mt-14">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Candidate matches</p>
                <h2 className="mt-1 font-display text-3xl">
                  {relatedMatches.length} Matches Found
                </h2>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
              {relatedMatches.map((m) => (
                <div key={m.id} className="rounded-2xl border border-border bg-card p-4">
                  <p className="font-medium">Match #{m.id}</p>
                  <p className="text-sm text-muted-foreground">Score: {(m.confidence_score * 100).toFixed(1)}%</p>
                  <p className="text-sm mt-1">Status: {m.status}</p>
                  <Link to="/matches" className="text-primary text-sm hover:underline mt-2 inline-block">Review in matches &rarr;</Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="truncate text-sm">{value}</span>
    </div>
  );
}