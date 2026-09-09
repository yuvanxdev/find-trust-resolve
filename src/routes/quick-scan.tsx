import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ScanLine, IdCard, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/quick-scan")({
  head: () => ({
    meta: [
      { title: "Quick Scan ID — FindIt AI" },
      { name: "description", content: "Auto-scan and notify owners of found IDs." },
    ],
  }),
  component: QuickScanPage,
});

function QuickScanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [matchResult, setMatchResult] = useState<{
    matched: boolean;
    owner_name?: string;
    item_id?: number;
    details?: any;
    message: string;
  } | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const scanMutation = useMutation({
    mutationFn: (uploadFile: File) => {
      const formData = new FormData();
      formData.append("file", uploadFile);
      return api.postForm<any>("/api/ocr/scan-id", formData);
    },
    onSuccess: (data) => {
      setMatchResult(data);
      if (data.matched) {
        toast.success("Owner found and notified!");
        queryClient.invalidateQueries({ queryKey: ["items"] });
      } else {
        toast.info("No matching user found in our database.");
      }
    },
    onError: (err: any) => {
      console.error(err);
      toast.error("Failed to process ID.");
    }
  });

  const handleFile = (selectedFile: File | null) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    scanMutation.mutate(selectedFile);
  };

  const handleManualFallback = () => {
    if (!matchResult?.details) {
      navigate({ to: "/report" });
      return;
    }
    
    // Redirect to normal report page with extracted details pre-filled
    navigate({
      to: "/report",
      search: {
        autoCategory: "DOCUMENTS",
        autoDescription: matchResult.details.summary || "Extracted from ID Card:\n" + JSON.stringify(matchResult.details, null, 2),
      }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <button
          onClick={() => navigate({ to: "/" })}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Dashboard
        </button>

        <header className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Quick Action</p>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">Scan Found ID</h1>
          <p className="mt-2 text-muted-foreground">
            Instantly identify the owner of an ID card and automatically notify them without filling out a manual report.
          </p>
        </header>

        {scanMutation.isPending ? (
          <div className="rounded-3xl border border-border bg-card p-10 text-center card-elevated">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="size-6 animate-spin" />
            </div>
            <h2 className="mt-4 font-display text-2xl">Scanning & Matching...</h2>
            <p className="mt-2 text-sm text-muted-foreground">Running AI character recognition and checking user database.</p>
          </div>
        ) : matchResult ? (
          <div className="rounded-3xl border border-border bg-card p-8 card-elevated text-center">
            {matchResult.matched ? (
              <>
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-green-500/10 text-green-500">
                  <CheckCircle2 className="size-8" />
                </div>
                <h2 className="mt-4 font-display text-3xl">Owner Identified!</h2>
                <p className="mt-2 text-lg">We found <strong>{matchResult.owner_name}</strong> in our system.</p>
                <p className="mt-1 text-muted-foreground">
                  A found report has been automatically created, and {matchResult.owner_name} has just been notified!
                </p>
                <div className="mt-8 flex justify-center gap-4">
                  <Link
                    to="/feed"
                    className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    View in Feed
                  </Link>
                  <button
                    onClick={() => setMatchResult(null)}
                    className="rounded-full border border-border bg-background px-6 py-3 text-sm font-medium transition hover:bg-secondary"
                  >
                    Scan Another
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-amber-500/10 text-amber-500">
                  <AlertCircle className="size-8" />
                </div>
                <h2 className="mt-4 font-display text-3xl">No Registered User Found</h2>
                <p className="mt-2 text-muted-foreground">
                  We successfully read the ID, but the owner doesn't seem to be registered in our system yet.
                </p>
                <div className="mt-6 text-left rounded-xl bg-secondary/50 p-4 border border-border text-sm">
                  <p className="font-semibold mb-2">Extracted Details:</p>
                  <pre className="whitespace-pre-wrap font-sans text-muted-foreground">
                    {matchResult.details.summary}
                  </pre>
                </div>
                <div className="mt-8">
                  <button
                    onClick={handleManualFallback}
                    className="rounded-full bg-primary w-full px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    Continue to Manual Report
                  </button>
                  <button
                    onClick={() => setMatchResult(null)}
                    className="mt-3 block w-full rounded-full border border-border bg-background px-6 py-3 text-sm font-medium transition hover:bg-secondary"
                  >
                    Try Again
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-card p-6 md:p-8 card-elevated">
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-dashed border-border bg-background">
              <div className="absolute inset-6 rounded-xl border-2 border-primary/40" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <IdCard className="mx-auto size-10 text-muted-foreground" />
                  <p className="mt-3 font-display text-xl">Place the ID inside the frame</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[280px] mx-auto">
                    Ensure name and student ID/email are clearly visible.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm transition hover:bg-primary/90">
                <ScanLine className="size-4" /> Scan / Upload ID
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => handleFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
