import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, X, Send, ArrowLeft, User as UserIcon, Camera, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { cn, getImageUrl } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface ChatMessage {
  id: number;
  session_id: number;
  sender_id: number;
  message?: string | null;
  image_path?: string | null;
  created_at: string;
}

export function ChatBox({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fullViewImage, setFullViewImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Live Camera Viewfinder State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setIsCameraStarting(false);
  };

  const startCamera = async (mode: "user" | "environment") => {
    try {
      setIsCameraStarting(true);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraStarting(false);
    } catch (err) {
      console.warn("Could not access camera via getUserMedia, falling back to file input", err);
      stopCamera();
      cameraInputRef.current?.click();
    }
  };

  const handleCameraClick = () => {
    if (typeof window !== "undefined" && Boolean(navigator?.mediaDevices?.getUserMedia)) {
      setIsCameraOpen(true);
      startCamera(facingMode);
    } else {
      cameraInputRef.current?.click();
    }
  };

  const handleFlipCamera = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error("Camera not ready. Please wait a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `snap_${Date.now()}.jpg`, { type: "image/jpeg" });
        setSelectedImage(file);
        setImagePreview(canvas.toDataURL("image/jpeg", 0.9));
        stopCamera();
        toast.success("Photo captured! Ready to send.");
      }
    }, "image/jpeg", 0.9);
  };

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);
  
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat", matchId],
    queryFn: () => api.get<ChatMessage[]>(`/api/chat/${matchId}`),
    refetchInterval: 4000,
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => api.post<ChatMessage>(`/api/chat/${matchId}`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", matchId] });
      setNewMessage("");
    },
    onError: () => {
      toast.error("Failed to send message. Please try again.");
    }
  });

  const sendImageMutation = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      const formData = new FormData();
      formData.append("image", file);
      if (caption && caption.trim()) {
        formData.append("message", caption.trim());
      }
      return api.postForm<ChatMessage>(`/api/chat/${matchId}/image`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", matchId] });
      clearSelectedImage();
      setNewMessage("");
    },
    onError: () => {
      toast.error("Failed to send photo. Must be an image under 5MB.");
    }
  });

  const isSending = sendMutation.isPending || sendImageMutation.isPending;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be under 5MB");
        return;
      }
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;

    if (selectedImage) {
      sendImageMutation.mutate({ file: selectedImage, caption: newMessage });
    } else if (newMessage.trim()) {
      sendMutation.mutate(newMessage.trim());
    }
  };

  const { data: partner } = useQuery({
    queryKey: ["chat_partner", matchId],
    queryFn: () => api.get<{ id: number; name: string; email: string }>(`/api/chat/${matchId}/partner`),
  });

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs sm:hidden z-[90] animate-in fade-in duration-200" 
        onClick={onClose} 
      />

      {/* Hidden File Inputs for Camera and Gallery */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Full-View Image Modal */}
      {fullViewImage && (
        <div 
          className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setFullViewImage(null)}
        >
          <button
            type="button"
            onClick={() => setFullViewImage(null)}
            className="absolute top-4 right-4 z-[130] size-10 rounded-full bg-white/20 text-white grid place-items-center hover:bg-white/30 transition"
            title="Close"
          >
            <X className="size-6" />
          </button>
          <img
            src={fullViewImage}
            alt="Full size chat attachment"
            className="max-h-[85vh] max-w-[95vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Live Camera Viewfinder Modal (Instagram Style) */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[140] bg-black flex flex-col items-center justify-between p-4 animate-in fade-in duration-200">
          {/* Top Bar: Controls */}
          <div className="w-full max-w-md flex items-center justify-between text-white py-2 z-10">
            <button
              type="button"
              onClick={stopCamera}
              className="size-10 rounded-full bg-white/20 grid place-items-center hover:bg-white/30 transition text-white"
              title="Close camera"
            >
              <X className="size-6" />
            </button>
            <div className="flex items-center gap-2 bg-black/40 px-3.5 py-1 rounded-full backdrop-blur-xs border border-white/10">
              <Camera className="size-4 text-primary" />
              <span className="text-xs font-semibold tracking-wider uppercase text-white">Live Camera</span>
            </div>
            <button
              type="button"
              onClick={handleFlipCamera}
              className="size-10 rounded-full bg-white/20 grid place-items-center hover:bg-white/30 transition text-white"
              title="Flip camera"
            >
              <RefreshCw className={cn("size-5", isCameraStarting && "animate-spin")} />
            </button>
          </div>

          {/* Viewfinder Window */}
          <div className="relative w-full max-w-md flex-1 rounded-3xl overflow-hidden bg-zinc-950 my-2 flex items-center justify-center border border-white/10 shadow-2xl">
            {isCameraStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10 text-white gap-2">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-xs text-zinc-300">Starting camera...</p>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover",
                facingMode === "user" && "scale-x-[-1]"
              )}
            />
          </div>

          {/* Bottom Bar: Instagram-style Shutter Button */}
          <div className="w-full max-w-md flex items-center justify-center py-4 z-10">
            <button
              type="button"
              onClick={capturePhoto}
              disabled={isCameraStarting}
              className="group relative size-20 rounded-full border-4 border-white flex items-center justify-center transition active:scale-95 disabled:opacity-50"
              title="Take photo"
            >
              <div className="size-16 rounded-full bg-white group-hover:scale-95 transition-transform shadow-lg" />
            </button>
          </div>
        </div>
      )}

      {/* Responsive Chat Container */}
      <div className={cn(
        "fixed z-[100] flex flex-col bg-background shadow-2xl overflow-hidden transition-all duration-200",
        // Mobile: full dynamic viewport strictly above bottom nav
        "inset-0 h-[100dvh] w-full",
        // Desktop / Tablet: floating card in bottom-right corner
        "sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[420px] sm:h-[600px] sm:max-h-[85vh] sm:rounded-3xl sm:border sm:border-border"
      )}>
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pt-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button 
              type="button"
              onClick={onClose} 
              className="sm:hidden -ml-1.5 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition"
              aria-label="Back to matches"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="size-8 sm:size-9 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
              <UserIcon className="size-4 sm:size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-sm sm:text-base text-foreground truncate">
                {partner ? partner.name : `Match #${matchId} Chat`}
              </h3>
              <p className="text-[11px] text-muted-foreground truncate">
                {partner?.email || "Encrypted handover chat"}
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose} 
            className="hidden sm:grid size-8 place-items-center hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition"
            title="Close chat"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 min-h-0 bg-background/50">
          {isLoading ? (
            <div className="m-auto text-xs text-muted-foreground py-6 text-center">
              Loading chat messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="m-auto text-center max-w-[260px] py-10">
              <div className="size-12 rounded-2xl bg-secondary/80 text-muted-foreground grid place-items-center mx-auto mb-3">
                <MessageSquare className="size-6" />
              </div>
              <p className="text-sm font-medium text-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Say hello or snap a photo of the item to coordinate handover safely!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              const hasImage = !!msg.image_path;
              const imgUrl = hasImage ? getImageUrl(msg.image_path) : "";

              return (
                <div 
                  key={msg.id} 
                  className={cn(
                    "flex flex-col max-w-[85%] sm:max-w-[78%]",
                    isMe ? "self-end items-end" : "self-start items-start"
                  )}
                >
                  <div 
                    className={cn(
                      "rounded-2xl text-sm leading-relaxed shadow-xs overflow-hidden break-words",
                      isMe 
                        ? "bg-primary text-primary-foreground rounded-br-xs" 
                        : "bg-secondary text-foreground rounded-bl-xs border border-border/50"
                    )}
                  >
                    {/* Attached Photo */}
                    {hasImage && (
                      <div 
                        className="relative cursor-pointer group bg-black/5 overflow-hidden"
                        onClick={() => setFullViewImage(imgUrl)}
                        title="Tap to view full image"
                      >
                        <img 
                          src={imgUrl} 
                          alt="Chat attachment" 
                          className="w-full max-h-64 sm:max-h-72 object-cover transition-transform group-hover:scale-102 duration-150"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      </div>
                    )}

                    {/* Text Message / Caption */}
                    {msg.message && (
                      <div className={cn("px-3.5 py-2.5", hasImage && "pt-2")}>
                        {msg.message}
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1 font-medium">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Selected Image Preview Strip (Instagram-style) */}
        {imagePreview && (
          <div className="px-3 pt-2.5 pb-1 bg-card border-t border-border/70 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-150">
            <div className="relative size-14 rounded-xl overflow-hidden border border-primary/30 shadow-xs shrink-0 group">
              <img src={imagePreview} alt="Selected preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={clearSelectedImage}
                className="absolute inset-0 bg-black/50 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove photo"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                Photo ready to send
              </p>
              <p className="text-[11px] text-muted-foreground">
                Add an optional caption below or tap send
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelectedImage}
              className="size-7 rounded-full bg-secondary text-muted-foreground hover:text-foreground grid place-items-center shrink-0 transition"
              title="Remove photo"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        
        {/* Chat Input Bar (Instagram DM Style) */}
        <form 
          onSubmit={handleSend} 
          className="p-2.5 sm:p-3 border-t border-border bg-card flex items-center gap-1.5 sm:gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-3 shrink-0 shadow-lg"
        >
          {/* 1. Take Photo with Camera (Live Viewfinder & Shutter) */}
          <button
            type="button"
            onClick={handleCameraClick}
            disabled={isSending}
            className="size-9 sm:size-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 grid place-items-center shrink-0 transition active:scale-95 disabled:opacity-40"
            title="Open camera to take photo"
            aria-label="Open camera"
          >
            <Camera className="size-5" />
          </button>

          {/* 2. Upload Photo from Gallery */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isSending}
            className="size-9 sm:size-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 grid place-items-center shrink-0 transition active:scale-95 disabled:opacity-40"
            title="Upload photo from gallery"
            aria-label="Upload photo"
          >
            <ImageIcon className="size-5" />
          </button>

          {/* 3. Text & Caption Input */}
          <input 
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={selectedImage ? "Add a caption..." : "Message..."}
            className="flex-1 min-w-0 bg-background border border-border rounded-full px-4 py-2 sm:py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
            disabled={isSending}
            autoFocus={false}
          />

          {/* 4. Send Button */}
          <button 
            type="submit" 
            disabled={(!newMessage.trim() && !selectedImage) || isSending}
            className={cn(
              "size-9 sm:size-10 rounded-full grid place-items-center shrink-0 transition shadow-xs active:scale-95",
              (newMessage.trim() || selectedImage) && !isSending
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"
            )}
            title="Send"
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 className="size-4 sm:size-5 animate-spin" />
            ) : (
              <Send className="size-4 sm:size-5" />
            )}
          </button>
        </form>
      </div>
    </>
  );
}
