import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ScanLine, Check, AlertTriangle, Sparkles, IdCard } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";

export const Route = createFileRoute("/scan")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      matchId: Number(search.matchId) || undefined,
    }
  },
  head: () => ({
    meta: [
      { title: "Scan an ID card — FindIt AI" },
      { name: "description", content: "OCR-based instant identity resolution." },
    ],
  }),
  component: ScanPage,
});

type Phase = "capture" | "scanning" | "result";

interface OCRResultData {
  confidence_score: number;
  extracted_fields: Record<string, any>;
  verification_status: string;
}

function ScanPage() {
  const { matchId } = Route.useSearch();
  const [phase, setPhase] = useState<Phase>("capture");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OCRResultData | null>(null);
  const navigate = useNavigate();

  const scanMutation = useMutation({
    mutationFn: (uploadFile: File) => {
      const formData = new FormData();
      formData.append("document_type", "ID_PROOF");
      formData.append("file", uploadFile);
      if (!matchId) throw new Error("Match ID is required for OCR verification");
      return api.postForm<OCRResultData>(`/api/documents/verify/${matchId}`, formData);
    },
    onSuccess: (data) => {
      setResult(data);
      setPhase("result");
    },
    onError: (err: any) => {
      console.error(err);
      setPhase("capture");
      setFile(null);
    }
  });

  const handleFile = (selectedFile: File | null) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setPhase("scanning");
    scanMutation.mutate(selectedFile);
  };

  if (!matchId) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="size-12 text-amber-accent mb-4" />
          <h1 className="text-2xl font-display mb-2">No Match ID provided</h1>
          <p className="text-muted-foreground mb-4">Please start the document verification process from a candidate match.</p>
          <button onClick={() => navigate({ to: "/matches" })} className="text-primary hover:underline">Go to Matches</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <button
          onClick={() => navigate({ to: "/" })}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </button>

        <header className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Documents route</p>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">Scan an ID or document</h1>
          <p className="mt-2 text-muted-foreground">
            For ID cards and registration documents, EasyOCR extracts the identity fields and
            auto-resolves the owner — no challenge needed.
          </p>
        </header>

        {phase === "capture" && (
          <div className="rounded-3xl border border-border bg-card p-6 md:p-8 card-elevated">
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-dashed border-border bg-background">
              <div className="absolute inset-6 rounded-xl border-2 border-primary/40" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <IdCard className="mx-auto size-10 text-muted-foreground" />
                  <p className="mt-3 font-display text-xl">Align the ID card inside the frame</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    We'll auto-check for blur and glare before running OCR.
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-6 top-8 h-px animate-[scan_2s_linear_infinite] bg-primary/70" />
              <style>{`@keyframes scan { 0% { transform: translateY(0);} 100% { transform: translateY(200px);} }`}</style>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm transition hover:bg-primary/90">
                <ScanLine className="size-4" /> Upload Document Image
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>
          </div>
        )}

        {phase === "scanning" && (
          <div className="rounded-3xl border border-border bg-card p-10 text-center card-elevated">
            <div className="mx-auto grid size-14 animate-pulse place-items-center rounded-full bg-primary/10 text-primary">
              <ScanLine className="size-6" />
            </div>
            <h2 className="mt-4 font-display text-2xl">Running EasyOCR…</h2>
            <p className="mt-2 text-sm text-muted-foreground">Extracting fields and confidence scores.</p>
          </div>
        )}

        {phase === "result" && result && (
          <OCRResult 
            result={result}
            onDone={() => { navigate({ to: "/dashboard" }); }} 
            onFallback={() => navigate({ to: "/matches" })} 
          />
        )}
      </main>
    </div>
  );
}

function OCRResult({ result, onDone, onFallback }: { result: OCRResultData; onDone: () => void; onFallback: () => void }) {
  const highConfidence = result.verification_status === "APPROVED" || result.verification_status === "RESOLVED";
  const fields = result.extracted_fields || {};

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-3xl border p-6 card-elevated",
          highConfidence ? "border-success/30 bg-success/10" : "border-amber-accent/40 bg-amber-accent/10",
        )}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          {highConfidence ? (
            <>
              <Check className="size-4 text-success" />
              High-confidence extraction · {(result.confidence_score * 100).toFixed(0)}% Match
            </>
          ) : (
            <>
              <AlertTriangle className="size-4 text-amber-accent" />
              Extraction returned below threshold · Status: {result.verification_status}
            </>
          )}
        </div>
        <h2 className="mt-2 font-display text-3xl">Owner auto-resolved</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The document itself is identity proof — no challenge-response needed.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6">
        <p className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">Extracted fields</p>
        <ul className="divide-y divide-border">
          {Object.entries(fields).map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
                <p className="truncate font-display text-lg">{String(v)}</p>
              </div>
            </li>
          ))}
          {Object.keys(fields).length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">No text could be reliably extracted from the image.</li>
          )}
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onDone}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <Sparkles className="size-4" /> Notify owner & release
        </button>
        <button
          onClick={onFallback}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm"
        >
          Fallback to full report
        </button>
      </div>
    </div>
  );
}
