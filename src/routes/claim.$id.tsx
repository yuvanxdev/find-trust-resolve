import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Lock, Sparkles, Check, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/claim/$id")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("findit_auth_token")) {
      throw redirect({ to: "/login" });
    }
  },
  component: ClaimPage,
});

type Phase = "intro" | "questions" | "scoring" | "result";

interface Match {
  id: number;
  lost_item_id: number;
  found_item_id: number;
  confidence_score: number;
  status: string;
}

interface Question {
  question_id: string;
  question_text: string;
}

interface VerificationStartResponse {
  verification_id: number;
  match_id: number;
  status: string;
  claimant_status: string;
  finder_status: string;
  claimant_user_id: number;
  finder_user_id: number;
  questions: Question[];
}

interface VerificationResponse {
  verification_id: number;
  match_id: number;
  status: string;
  claimant_status: string;
  finder_status: string;
  confidence_score: number | null;
}

function ClaimPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("intro");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [verificationResult, setVerificationResult] = useState<VerificationResponse | null>(null);

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => api.get<Match>(`/api/matches/${id}`),
  });

  const startVerification = useMutation({
    mutationFn: () => api.post<VerificationStartResponse>(`/api/verification/start/${id}`),
    onSuccess: (data) => {
      const isClaimant = user?.id === data.claimant_user_id;
      const myStatus = isClaimant ? data.claimant_status : data.finder_status;
      
      if (myStatus === "ANSWERED") {
        setPhase("result");
        setVerificationResult(data as unknown as VerificationResponse);
      } else {
        setPhase("questions");
      }
    }
  });

  const submitAnswers = useMutation({
    mutationFn: (verificationId: number) => {
      // The backend expects a dictionary of answers: { "q_id": "answer" }
      return api.post<VerificationResponse>(`/api/verification/answer/${verificationId}`, { answers: answers });
    },
    onSuccess: (data) => {
      setVerificationResult(data);
      setPhase("result");
    },
    onError: (error: any) => {
      setPhase("questions");
      // api.ts already handles global toast.error, but we can set a local error state if we want.
      // We rely on the global toast for now.
    }
  });

  if (matchLoading) {
    return <div className="min-h-screen bg-background flex justify-center p-12 text-muted-foreground">Loading match details...</div>;
  }
  if (!match) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="font-display text-3xl">Match not found</h1>
          <Link to="/matches" className="mt-4 inline-flex text-sm text-primary hover:underline">
            Back to matches
          </Link>
        </div>
      </div>
    );
  }

  const questions = startVerification.data?.questions || [];
  const q = questions[idx];
  const canNext = q && (answers[q.question_id] ?? "").trim().length > 3;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <button
          onClick={() => navigate({ to: "/matches" })}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to matches
        </button>

        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Claiming Match #{match.id}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Lock className="size-3" /> private
          </span>
        </div>

        {phase === "intro" && (
          <Intro 
            onStart={() => startVerification.mutate()} 
            isLoading={startVerification.isPending} 
          />
        )}

        {phase === "questions" && questions.length > 0 && (
          <div className="rounded-3xl border border-border bg-card p-6 md:p-8 card-elevated">
            <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Question {idx + 1} of {questions.length}
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3.5 text-amber-accent" /> LLM-generated
              </span>
            </div>
            <p className="font-display text-2xl leading-snug">{q.question_text}</p>
            <textarea
              rows={4}
              value={answers[q.question_id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.question_id]: e.target.value })}
              placeholder="Answer in your own words…"
              className="mt-4 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
            />
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="size-3" /> The finder's answer is hidden. A cross-encoder scores semantic similarity.
            </p>

            <div className="mt-6 flex items-center justify-between">
              <button
                disabled={idx === 0}
                onClick={() => setIdx((i) => i - 1)}
                className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <ArrowLeft className="size-4" /> Previous
              </button>
              {idx < questions.length - 1 ? (
                <button
                  disabled={!canNext}
                  onClick={() => setIdx((i) => i + 1)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Next <ArrowRight className="size-4" />
                </button>
              ) : (
                <button
                  disabled={!canNext || submitAnswers.isPending}
                  onClick={() => {
                    setPhase("scoring");
                    submitAnswers.mutate(startVerification.data!.verification_id);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {submitAnswers.isPending ? "Scoring..." : "Submit for scoring"} <ShieldCheck className="size-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {phase === "scoring" && <Scoring />}

        {phase === "result" && verificationResult && (
          <Result 
            score={verificationResult.confidence_score ?? 0} 
            status={verificationResult.status} 
            onRetry={() => {
              setAnswers({});
              setIdx(0);
              setPhase("intro");
            }} 
            matchId={match.id.toString()} 
          />
        )}
      </main>
    </div>
  );
}

function Intro({ onStart, isLoading }: { onStart: () => void, isLoading: boolean }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 md:p-8 card-elevated">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
        <ShieldCheck className="size-3.5" /> Ownership verification
      </div>
      <h1 className="mt-4 font-display text-4xl">Prove this is yours</h1>
      <p className="mt-3 text-muted-foreground">
        Answer short questions about details of the item that aren't visible in the
        listing photo. Your answers are compared to the finder's using a cross-encoder — you never see theirs.
      </p>
      <ul className="mt-6 space-y-3 text-sm">
        {[
          "Auto-verified above 82% confidence — contact info released instantly.",
          "Between 60% and 82% — routed to admin manual review.",
          "Below 60% — automatically rejected. You can appeal via admin.",
        ].map((t, i) => (
          <li key={i} className="flex items-start gap-2 rounded-xl border border-border bg-background p-3">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onStart}
        disabled={isLoading}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {isLoading ? "Starting..." : "Start verification"} <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

function Scoring() {
  return (
    <div className="rounded-3xl border border-border bg-card p-10 text-center card-elevated">
      <div className="mx-auto grid size-14 animate-pulse place-items-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="size-6" />
      </div>
      <h2 className="mt-4 font-display text-2xl">Scoring your answers…</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Encoding both answer sets and computing cross-encoder similarity.
      </p>
      <div className="mx-auto mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-secondary">
        <div className="h-full w-1/2 animate-[loading_1.4s_ease-in-out_infinite] bg-primary" />
      </div>
      <style>{`@keyframes loading { 0% { transform: translateX(-100%);} 100% { transform: translateX(200%);} }`}</style>
    </div>
  );
}

function Result({
  score,
  status,
  onRetry,
  matchId,
}: {
  score: number;
  status: string;
  onRetry: () => void;
  matchId: string;
}) {
  // Backend returns VERIFIED or REJECTED (Gemini) or ERROR or PARTIAL
  const isVerified = status === "VERIFIED" || status === "APPROVED" || status === "RESOLVED";
  const isReview = status === "MANUAL_REVIEW";
  const isError = status === "ERROR";
  const isPartial = status === "PARTIAL";
  
  // Gemini returns confidence_score as 0-100; normalize to 0-1 for display
  const normalizedScore = score > 1 ? score / 100 : score;
  
  const cfg = isVerified ? {
      icon: <Check className="size-6" />,
      title: "Verified — match accepted",
      body: "You've been verified! You can now chat with the other user on the match page to arrange the handover.",
      tone: "bg-success/10 text-success border-success/30",
      pill: "bg-success text-primary-foreground",
    } : isReview ? {
      icon: <AlertTriangle className="size-6" />,
      title: "Sent for manual review",
      body: "Your score is in the review band. An admin will make the final call within 24 hours.",
      tone: "bg-amber-accent/10 text-amber-accent-foreground border-amber-accent/40",
      pill: "bg-amber-accent text-amber-accent-foreground",
    } : isError ? {
      icon: <AlertTriangle className="size-6" />,
      title: "Verification service temporarily unavailable",
      body: "The verification engine encountered an error. Please try again shortly.",
      tone: "bg-amber-accent/10 text-amber-accent-foreground border-amber-accent/40",
      pill: "bg-amber-accent text-amber-accent-foreground",
    } : isPartial ? {
      icon: <ShieldCheck className="size-6 animate-pulse" />,
      title: "Waiting for other user",
      body: "Your answers have been submitted successfully. We are waiting for the other user to complete their verification.",
      tone: "bg-primary/10 text-primary border-primary/30",
      pill: "bg-primary text-primary-foreground",
    } : {
      icon: <X className="size-6" />,
      title: "Not enough signal to verify ownership",
      body: "Your answers didn't match closely enough. If you're certain the item is yours, you can try again or appeal to an admin.",
      tone: "bg-destructive/10 text-destructive border-destructive/30",
      pill: "bg-destructive text-destructive-foreground",
    };

  return (
    <div className={cn("rounded-3xl border p-6 md:p-8 card-elevated", cfg.tone)}>
      <div className="flex items-center gap-3">
        <div className={cn("grid size-12 place-items-center rounded-full", cfg.pill)}>{cfg.icon}</div>
        <div>
          <p className="text-xs uppercase tracking-wider opacity-80">Verification result</p>
          <h2 className="font-display text-3xl">{cfg.title}</h2>
        </div>
      </div>
      <p className="mt-4 text-sm opacity-90">{cfg.body}</p>

      {!isPartial && (
        <div className="mt-6 rounded-2xl bg-background p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Confidence score</span>
            <span className="font-mono text-foreground">{score.toFixed(1)}%</span>
          </div>
          <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="absolute left-[60%] top-0 h-full w-px bg-amber-accent" />
            <div className="absolute left-[82%] top-0 h-full w-px bg-success" />
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.round(normalizedScore * 100))}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span>60% review</span>
            <span>82% approve</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {isVerified && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-foreground">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Next Steps</p>
          <p className="mt-1 font-display text-xl">Head back to the match page to chat and arrange handover.</p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/matches"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground"
        >
          Back to matches
        </Link>
        {!isVerified && !isPartial && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}