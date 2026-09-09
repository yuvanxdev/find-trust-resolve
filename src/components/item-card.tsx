import { Link } from "@tanstack/react-router";
import { MapPin, Clock } from "lucide-react";
import { cn, getImageUrl } from "@/lib/utils";

export interface ApiItem {
  id: number;
  item_name: string;
  description: string;
  category: string;
  location: string;
  report_type: "LOST" | "FOUND";
  image_path?: string;
  created_at: string;
  matchScore?: number; // Optional for when displayed inside a match context
  status?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function TypePill({ type }: { type: string }) {
  const isLost = type === "LOST";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        isLost
          ? "bg-amber-accent/25 text-amber-accent-foreground"
          : "bg-primary/10 text-primary",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isLost ? "bg-amber-accent" : "bg-primary",
        )}
      />
      {type}
    </span>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const label = status === "unmatched" ? "Awaiting match" : status;
  const className = status === "unmatched" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", className)}>
      {label}
    </span>
  );
}

export function ItemCard({ item }: { item: ApiItem }) {
  const imageUrl = getImageUrl(item.image_path);

  return (
    <Link
      to="/item/$id"
      params={{ id: item.id.toString() }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:card-elevated"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <img
          src={imageUrl}
          alt={item.item_name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <TypePill type={item.report_type} />
        </div>
        {typeof item.matchScore === "number" && (
          <div className="absolute right-3 top-3 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
            match {Math.round(item.matchScore * 100)}%
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {item.category}
          </span>
          <StatusBadge status={item.status} />
        </div>
        <h3 className="font-display text-xl leading-tight">{item.item_name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{item.location}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Clock className="size-3.5" />
            {timeAgo(item.created_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}