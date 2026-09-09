import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Check, X, ShieldCheck, MessageSquare } from "lucide-react";
import { useState, useEffect } from "react";
import { ChatBox } from "@/components/chat-box";

export const Route = createFileRoute("/matches")({
  validateSearch: (search: Record<string, unknown>): { chatMatchId?: number } => ({
    chatMatchId: search.chatMatchId ? Number(search.chatMatchId) : undefined,
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("findit_auth_token")) {
      throw redirect({ to: "/login" });
    }
  },
  component: MatchesPage,
});

interface Match {
  id: number;
  lost_item_id: number;
  found_item_id: number;
  confidence_score: number;
  status: string;
  other_user_id?: number;
  created_at: string;
}

function MatchesPage() {
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const [activeChatMatchId, setActiveChatMatchId] = useState<number | null>(search.chatMatchId || null);
  
  useEffect(() => {
    if (search.chatMatchId) {
      setActiveChatMatchId(search.chatMatchId);
    }
  }, [search.chatMatchId]);
  
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: () => api.get<Match[]>("/api/matches/"),
  });

  const acceptMatchMutation = useMutation({
    mutationFn: (matchId: number) => api.post(`/api/matches/${matchId}/accept`),
    onSuccess: () => {
      toast.success("Match accepted");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to accept match");
    }
  });

  const rejectMatchMutation = useMutation({
    mutationFn: (matchId: number) => api.post(`/api/matches/${matchId}/reject`),
    onSuccess: () => {
      toast.success("Match rejected");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to reject match");
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Review</p>
          <h1 className="mt-2 font-display text-4xl">Candidate Matches</h1>
        </header>

        {isLoading ? (
          <div className="flex justify-center p-12 text-muted-foreground">Loading matches...</div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-16 text-center text-muted-foreground">
            No matches found yet. We'll notify you when the AI finds something.
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((m) => (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-xl">Match #{m.id}</h3>
                  <p className="text-sm font-medium mt-1">
                    {m.status === "PENDING" ? (
                      <span className="text-amber-600">AI Candidate Match — Ownership still needs verification</span>
                    ) : m.status === "VERIFICATION" ? (
                      <span className="text-blue-600">Verification in Progress</span>
                    ) : m.status === "ACCEPTED" ? (
                      <span className="text-green-600">Match Accepted & Resolved</span>
                    ) : m.status === "REJECTED" ? (
                      <span className="text-red-600">Match Rejected</span>
                    ) : (
                      <span className="text-muted-foreground">{m.status}</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    AI Similarity: {m.confidence_score.toFixed(1)}%
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <Link to="/item/$id" params={{ id: String(m.lost_item_id) }} className="text-sm text-primary hover:underline">View Lost Item</Link>
                    <Link to="/item/$id" params={{ id: String(m.found_item_id) }} className="text-sm text-primary hover:underline">View Found Item</Link>
                  </div>
                </div>
                
                {m.status === "PENDING" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link 
                      to="/claim/$id" params={{ id: String(m.id) }}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition border border-primary/20"
                    >
                      <ShieldCheck className="size-4" /> Verify Ownership
                    </Link>
                    <button 
                      onClick={() => acceptMatchMutation.mutate(m.id)}
                      disabled={acceptMatchMutation.isPending || rejectMatchMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-full bg-success/15 px-4 py-2 text-sm font-medium text-success hover:bg-success/25 transition disabled:opacity-50"
                    >
                      <Check className="size-4" /> Accept
                    </button>
                    <button 
                      onClick={() => rejectMatchMutation.mutate(m.id)}
                      disabled={acceptMatchMutation.isPending || rejectMatchMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/25 transition disabled:opacity-50"
                    >
                      <X className="size-4" /> Reject
                    </button>
                  </div>
                )}
                {m.status === "VERIFICATION" && (
                  <Link 
                    to="/claim/$id" params={{ id: String(m.id) }}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-500/20 transition"
                  >
                    <ShieldCheck className="size-4" /> Continue Verification
                  </Link>
                )}
                {m.status === "ACCEPTED" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1 rounded-full bg-success/15 px-4 py-2 text-sm font-medium text-success">
                      <Check className="size-4" /> Match Accepted
                    </div>
                    <button 
                      onClick={() => setActiveChatMatchId(m.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition border border-primary/20"
                    >
                      <MessageSquare className="size-4" /> Open Chat
                    </button>
                  </div>
                )}
                {m.status === "REJECTED" && (
                  <div className="inline-flex items-center gap-1 rounded-full bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
                    <X className="size-4" /> Match Rejected
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      
      {activeChatMatchId && (
        <ChatBox matchId={activeChatMatchId} onClose={() => setActiveChatMatchId(null)} />
      )}
    </div>
  );
}
