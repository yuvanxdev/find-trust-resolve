import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, MapPin, Clock, ShieldCheck, Lock, ScanLine, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { CATEGORY_LABEL, type ItemCategory, type ItemType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/report")({
  validateSearch: (search: Record<string, unknown>): { autoCategory?: ItemCategory; autoDescription?: string } => {
    return {
      autoCategory: (search.autoCategory as ItemCategory) || undefined,
      autoDescription: (search.autoDescription as string) || undefined,
    }
  },
  head: () => ({
    meta: [
      { title: "Report an item — FindIt AI" },
      { name: "description", content: "Report a lost or found item. If you are the finder, we'll ask a few private questions only the true owner will know." },
      { property: "og:title", content: "Report an item — FindIt AI" },
      { property: "og:description", content: "Submit a lost or found report; finders privately answer a few AI-generated ownership questions." },
    ],
  }),
  component: ReportPage,
});

const STEPS = ["Type", "Details", "Photo & location", "Submit"] as const;

function ReportPage() {
  const { autoCategory, autoDescription } = Route.useSearch();
  const navigate = useNavigate();
  const [step, setStep] = useState(autoCategory || autoDescription ? 1 : 0);
  const [type, setType] = useState<ItemType | null>(null);
  const [category, setCategory] = useState<ItemCategory>(autoCategory || "ELECTRONICS");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(autoDescription || "");
  const [location, setLocation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);
  const queryClient = useQueryClient();

  const handleAutoDescribe = async (selectedFile: File) => {
    setIsDescribing(true);
    setFile(selectedFile);
    toast.info("Analyzing image with AI...");
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      const data = await api.postForm<{
        item_name: string;
        category: string;
        color: string;
        brand: string;
        description: string;
      }>("/api/items/auto-describe", formData);
      
      if (data.item_name) setTitle(data.item_name);
      if (data.category) {
        const upperCategory = data.category.toUpperCase();
        if (Object.keys(CATEGORY_LABEL).includes(upperCategory)) {
          setCategory(upperCategory as ItemCategory);
        } else {
          setCategory("OTHER");
        }
      }
      if (data.description) {
        let desc = data.description;
        if (data.color) desc = `Color: ${data.color}\n` + desc;
        if (data.brand) desc = `Brand: ${data.brand}\n` + desc;
        setDescription(desc);
      }
      toast.success("Form auto-filled!");
    } catch (e: any) {
      toast.error("Failed to auto-describe image.");
      setFile(null);
    } finally {
      setIsDescribing(false);
    }
  };

  const canNext =
    (step === 0 && !!type) ||
    (step === 1 && title.trim().length > 2 && description.trim().length > 5) ||
    (step === 2 && location.trim().length > 1) ||
    step === 3;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("report_type", type === "LOST" ? "LOST" : "FOUND");
      formData.append("item_name", title);
      formData.append("description", description);
      formData.append("category", category);
      formData.append("location", location);
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error("File size exceeds 5MB limit.");
          setIsSubmitting(false);
          return;
        }
        formData.append("image", file);
      }

      await api.postForm("/api/items/", formData);
      toast.success(
        type === "FOUND"
          ? "Report submitted. We'll find candidate matches soon."
          : "Lost report submitted. We're already searching for candidate matches."
      );
      queryClient.invalidateQueries({ queryKey: ["items"] });
      navigate({ to: "/feed" });
    } catch (e: any) {
      console.error(e);
      // Let api client show the toast error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <button
          onClick={() => (step === 0 ? navigate({ to: "/" }) : back())}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </button>

        <Stepper step={step} />

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 md:p-8 card-elevated">
          {step === 0 && <StepType value={type} onChange={setType} />}
          {step === 1 && (
            <StepDetails
              category={category}
              onCategory={setCategory}
              title={title}
              onTitle={setTitle}
              description={description}
              onDescription={setDescription}
              isDescribing={isDescribing}
              onAutoDescribe={handleAutoDescribe}
              file={file}
            />
          )}
          {step === 2 && (
            <StepPhoto 
              location={location} 
              onLocation={setLocation} 
              onFileChange={setFile} 
              file={file} 
            />
          )}
          {step === 3 && (
            <StepReview
              type={type}
              category={category}
              title={title}
              description={description}
              location={location}
              file={file}
            />
          )}

          <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
            <button
              onClick={back}
              disabled={step === 0}
              className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> Previous
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={next}
                disabled={!canNext}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Continue <ArrowRight className="size-4" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit report"} <Check className="size-4" />
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium",
                done && "bg-primary text-primary-foreground",
                active && "bg-amber-accent text-amber-accent-foreground",
                !active && !done && "bg-secondary text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn("text-xs", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground/40">/</span>}
          </li>
        );
      })}
    </ol>
  );
}

function StepType({ value, onChange }: { value: ItemType | null; onChange: (t: ItemType) => void }) {
  return (
    <div>
      <h2 className="font-display text-3xl">What are you reporting?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose whether you have lost an item or found someone else's item.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <TypeCard
          selected={value === "LOST"}
          onClick={() => onChange("LOST")}
          badge="lost"
          title="I lost something"
          body="You'll be notified when a matching found report appears. You'll answer the verification questions when you claim."
          tone="amber"
        />
        <TypeCard
          selected={value === "FOUND"}
          onClick={() => onChange("FOUND")}
          badge="found"
          title="I found something"
          body="Report an item you've found so the owner can claim it safely."
          tone="primary"
        />
      </div>
    </div>
  );
}

function TypeCard({
  selected,
  onClick,
  badge,
  title,
  body,
  tone,
}: {
  selected: boolean;
  onClick: () => void;
  badge: string;
  title: string;
  body: string;
  tone: "amber" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group rounded-2xl border p-5 text-left transition",
        selected
          ? tone === "amber"
            ? "border-amber-accent bg-amber-accent/10"
            : "border-primary bg-primary/5"
          : "border-border bg-background hover:border-foreground/20",
      )}
    >
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
          tone === "amber" ? "bg-amber-accent/25 text-amber-accent-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {badge}
      </span>
      <h3 className="mt-3 font-display text-2xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </button>
  );
}

function StepDetails({
  category,
  onCategory,
  title,
  onTitle,
  description,
  onDescription,
  isDescribing,
  onAutoDescribe,
  file,
}: {
  category: ItemCategory;
  onCategory: (c: ItemCategory) => void;
  title: string;
  onTitle: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  isDescribing: boolean;
  onAutoDescribe: (f: File) => void;
  file: File | null;
}) {
  const [isScanning, setIsScanning] = useState(false);

  return (
    <div className="space-y-5">
      {isScanning && (
        <CameraScanner 
          onCancel={() => setIsScanning(false)}
          onCapture={(f) => {
            setIsScanning(false);
            onAutoDescribe(f);
          }}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">Describe the item</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Text + image embeddings feed the matching engine. Be specific — colour, brand, marks.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs sm:text-sm font-medium transition cursor-pointer hover:bg-secondary",
            isDescribing && "opacity-70 cursor-not-allowed"
          )}>
            <Camera className="size-4 text-primary" />
            <span>Camera photo</span>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              onChange={(e) => {
                if (e.target.files?.[0]) onAutoDescribe(e.target.files[0]);
              }} 
              className="hidden" 
              disabled={isDescribing}
            />
          </label>

          <label className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-2 text-xs sm:text-sm font-medium transition cursor-pointer shadow-sm",
            isDescribing 
              ? "bg-secondary text-muted-foreground opacity-70 cursor-not-allowed" 
              : file 
                ? "bg-amber-accent text-amber-accent-foreground hover:bg-amber-accent/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}>
            {isDescribing ? (
              <><Loader2 className="size-4 animate-spin" /> Analyzing...</>
            ) : (
              <>
                {file ? <Sparkles className="size-4" /> : <Upload className="size-4" />}
                {file ? "Change photo" : "Upload photo"}
              </>
            )}
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp" 
              onChange={(e) => {
                if (e.target.files?.[0]) onAutoDescribe(e.target.files[0]);
              }} 
              className="hidden" 
              disabled={isDescribing}
            />
          </label>
        </div>
      </div>
      <Field label="Category">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(CATEGORY_LABEL) as [ItemCategory, string][]).map(([k, v]) => (
            <button
              key={k}
              onClick={() => onCategory(k)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                category === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Short title">
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="e.g. Black wireless earbuds case"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          rows={4}
          placeholder="Include colour, brand, any visible marks or stickers…"
          className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
        />

      </Field>
    </div>
  );
}

function StepPhoto({ 
  location, 
  onLocation, 
  onFileChange, 
  file,
}: { 
  location: string; 
  onLocation: (v: string) => void; 
  onFileChange: (f: File | null) => void; 
  file: File | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-3xl">Add a photo and location</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CLIP will embed the photo into the same vector space as the description.
        </p>
      </div>

      <Field label="Photo">
        {file ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-border">
            <img src={URL.createObjectURL(file)} alt="Preview" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onFileChange(null)}
              className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur p-2 text-foreground hover:bg-destructive hover:text-destructive-foreground transition shadow-md"
              title="Remove photo"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex aspect-[16/9] sm:aspect-auto sm:min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-4 text-muted-foreground transition hover:border-primary hover:text-foreground">
              <Camera className="size-6 text-primary" />
              <p className="text-sm font-medium text-foreground">Take Photo with Camera</p>
              <p className="text-xs text-muted-foreground">Launches device camera directly</p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>

            <label className="flex aspect-[16/9] sm:aspect-auto sm:min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-4 text-muted-foreground transition hover:border-primary hover:text-foreground">
              <Upload className="size-6 text-primary" />
              <p className="text-sm font-medium text-foreground">Upload from Files / Gallery</p>
              <p className="text-xs text-muted-foreground">PNG, JPEG, WebP up to 5MB</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>
        )}
      </Field>

      <Field label="Where">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
          <MapPin className="size-4 text-muted-foreground" />
          <input
            value={location}
            onChange={(e) => onLocation(e.target.value)}
            placeholder="e.g. LH-204, Academic Block B"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </Field>

      <div className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-xs text-secondary-foreground">
        <Clock className="size-4" />
        Time is captured automatically and used in the time-decay match score.
      </div>
    </div>
  );
}



function StepReview({
  type,
  category,
  title,
  description,
  location,
  file,
}: {
  type: ItemType | null;
  category: ItemCategory;
  title: string;
  description: string;
  location: string;
  file: File | null;
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-3xl">Review & submit</h2>
      <div className="rounded-2xl border border-border bg-background p-4 text-sm">
        <Row k="Type" v={type ?? "—"} />
        <Row k="Category" v={CATEGORY_LABEL[category]} />
        <Row k="Title" v={title} />
        <Row k="Description" v={description} multi />
        <Row k="Location" v={location} />
        <Row k="Photo attached" v={file ? file.name : "No photo"} />
      </div>
      <p className="text-xs text-muted-foreground">
        By submitting, you agree to encrypted storage of your report and, if applicable, your
        private verification answers.
      </p>
    </div>
  );
}

function Row({ k, v, multi }: { k: string; v: string; multi?: boolean }) {
  return (
    <div className={cn("grid gap-1 border-b border-border py-2 last:border-0", multi ? "" : "sm:grid-cols-[140px_1fr]") }>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className="text-sm">{v || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function CameraScanner({ onCapture, onCancel }: { onCapture: (f: File) => void, onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const [streamError, setStreamError] = useState(false);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API unavailable in this browser environment");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' } 
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
    } catch (err) {
      console.warn("Camera stream not available, switching to device camera capture:", err);
      setStreamError(true);
      setTimeout(() => {
        fallbackInputRef.current?.click();
      }, 100);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capture = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
            onCapture(file);
          }
        }, "image/jpeg", 0.9);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fallbackInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            onCapture(e.target.files[0]);
          }
        }}
      />

      {streamError ? (
        <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-card/95 p-6 text-center text-foreground shadow-2xl backdrop-blur-lg">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Camera className="size-8" />
          </div>
          <h3 className="text-lg font-semibold">Open Device Camera</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Tap below to take a picture directly using your phone's camera.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => fallbackInputRef.current?.click()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90"
            >
              <Camera className="size-4" />
              Launch Camera
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-secondary px-5 text-sm font-medium text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-black shadow-2xl">
            <video ref={videoRef} autoPlay playsInline className="w-full h-auto aspect-[3/4] object-cover" />
          </div>
          <div className="mt-8 flex items-center gap-6">
            <button onClick={onCancel} className="rounded-full bg-white/20 px-6 py-3 text-sm font-medium text-white hover:bg-white/30">Cancel</button>
            <button onClick={capture} className="flex size-16 items-center justify-center rounded-full bg-white p-1 hover:scale-105 transition-transform" title="Take photo">
              <div className="size-full rounded-full border-4 border-black" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}