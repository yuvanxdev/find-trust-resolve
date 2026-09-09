import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ScanLine, Sparkles, ShieldCheck, MapPin, Clock, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ItemCard, ApiItem } from "@/components/item-card";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
// Mock items have been removed. We now fetch genuine public items from the backend.

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FindIt AI — Campus Lost & Found with Ownership Verification" },
      {
        name: "description",
        content:
          "FindIt AI matches lost and found items with multi-modal AI, then proves the real owner through LLM-generated challenge-response verification before releasing contact details.",
      },
      { property: "og:title", content: "FindIt AI — Prove the owner, not just the match" },
      {
        property: "og:description",
        content: "Multi-modal matching + semantic ownership verification for campus lost & found.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { data: discoverItems } = useQuery({
    queryKey: ["discover_latest"],
    queryFn: () => api.get<ApiItem[]>("/api/items/discover?limit=3"),
  });

  const highlighted = discoverItems?.slice(0, 3) || [];
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grain-bg absolute inset-0 -z-10" />
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3.5 text-amber-accent" />
                B.Tech PBL · Mobile App Development
              </span>
              <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">
                Prove the <em className="text-primary not-italic">owner</em>,
                <br />
                not just the <span className="italic text-amber-accent">match</span>.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                FindIt AI matches lost and found items across image, text, location
                and time — then asks a few AI-generated questions only the real
                owner could answer, before any contact details are released.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/feed"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  Browse the feed
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/report"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary"
                >
                  Report an item
                </Link>
              </div>

              {/* Mock stats removed */}
            </div>

            <HeroFlow />
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">How it works</p>
            <h2 className="mt-2 font-display text-4xl md:text-5xl">Three modules, one recovery flow.</h2>
          </div>
          <p className="hidden max-w-sm text-sm text-muted-foreground md:block">
            Every part uses pretrained models — no training, no dataset collection, no GPU cluster.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Pillar
            icon={<Sparkles className="size-5" />}
            kicker="Module 01"
            title="Multi-modal matching"
            body="CLIP for images, sentence-transformers for text, fused with location proximity and a time-decay factor. Candidates ranked with FAISS."
            tag="Adopted from literature"
          />
          <Pillar
            icon={<ShieldCheck className="size-5" />}
            kicker="Module 02"
            title="Semantic ownership verification"
            body="An LLM generates 2–3 hidden questions from private item details. A cross-encoder scores the claimant's answers against the finder's — automatically."
            tag="Core novelty"
            accent
          />
        </div>
      </section>

      {/* Live feed preview */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Recent reports</p>
            <h2 className="mt-2 font-display text-3xl md:text-4xl">On the feed right now</h2>
          </div>
          <Link
            to="/feed"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            See all <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
          {highlighted.map((it) => (
            <ItemCard key={it.id} item={it} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-3xl">{value}</dd>
    </div>
  );
}

function Pillar({
  icon,
  kicker,
  title,
  body,
  tag,
  accent,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  body: string;
  tag: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col gap-4 rounded-3xl border p-6 " +
        (accent
          ? "border-primary/30 bg-primary text-primary-foreground card-elevated"
          : "border-border bg-card")
      }
    >
      <div className="flex items-center justify-between">
        <span
          className={
            "grid size-10 place-items-center rounded-full " +
            (accent ? "bg-primary-foreground/10" : "bg-secondary text-primary")
          }
        >
          {icon}
        </span>
        <span
          className={
            "text-[10px] uppercase tracking-widest " +
            (accent ? "text-primary-foreground/70" : "text-muted-foreground")
          }
        >
          {kicker}
        </span>
      </div>
      <h3 className="font-display text-2xl leading-tight">{title}</h3>
      <p className={"text-sm " + (accent ? "text-primary-foreground/85" : "text-muted-foreground")}>{body}</p>
      <span
        className={
          "mt-2 inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium " +
          (accent
            ? "bg-amber-accent text-amber-accent-foreground"
            : "bg-secondary text-secondary-foreground")
        }
      >
        {tag}
      </span>
    </div>
  );
}

function HeroFlow() {
  return (
    <div className="relative">
      <div className="rounded-3xl border border-border bg-card p-6 card-elevated">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Verification preview
          </span>
        </div>
        <p className="font-display text-2xl leading-snug">
          "There is a small mark on the item. Where is it located and what does it look like?"
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-2xl border border-border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Finder</p>
            <p className="mt-1">A small scratch on the lid, near the hinge.</p>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-primary">Claimant</p>
            <p className="mt-1">There's a scratch on the top of the case, close to where it opens.</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-success" />
          Auto-approved · contact info released to claimant
        </div>
      </div>
      <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-border bg-card p-3 shadow-sm md:block">
        <div className="flex items-center gap-2 text-xs">
          <MapPin className="size-3.5 text-primary" />
          LH-204 · <Clock className="size-3.5" /> 2h ago
        </div>
      </div>
    </div>
  );
}

    <footer className="border-t border-border bg-secondary/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          <span className="font-display text-base text-foreground">FindIt AI</span> · A 2-student
          Mobile App PBL project · Zero-training, pretrained-only pipeline.
        </p>
        <p className="text-xs">FindIt AI — Built for trust and reliability.</p>
      </div>
    </footer>
