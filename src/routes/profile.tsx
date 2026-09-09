import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth-context";
import { 
  User, 
  SlidersHorizontal, 
  Lock, 
  Trash2, 
  X, 
  Check, 
  Mail, 
  Phone, 
  MapPin,
  Camera,
  Upload
} from "lucide-react";
import { cn, getImageUrl } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/profile")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("findit_auth_token")) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Profile — FindIt AI" },
      { name: "description", content: "Manage your personal details, notification preferences, and account security." },
    ],
  }),
  component: ProfilePage,
});

const TABS = [
  { id: "personal", label: "Personal", icon: User },
  { id: "preferences", label: "Preferences & Alerts", icon: SlidersHorizontal },
  { id: "security", label: "Security", icon: Lock },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("personal");
  const [tabSlideDirection, setTabSlideDirection] = useState<"left" | "right" | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number; ignored: boolean } | null>(null);
  const gestureLockRef = useRef<"horizontal" | "vertical" | null>(null);

  const switchToTab = (targetTab: TabId, direction: "left" | "right") => {
    setTabSlideDirection(direction);
    setActiveTab(targetTab);
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10);
      }
    } catch {
      // Ignore vibration error
    }
  };

  useEffect(() => {
    if (!tabSlideDirection) return;
    const t = setTimeout(() => setTabSlideDirection(null), 250);
    return () => clearTimeout(t);
  }, [tabSlideDirection]);

  const handleProfileTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touchStartRef.current = null;
      gestureLockRef.current = null;
      return;
    }
    const target = e.target as HTMLElement;
    // Ignore swipe on interactive inputs, buttons, sliders, file inputs
    const ignored = !!target.closest("input, textarea, select, button, [role='slider'], [data-no-swipe], .no-swipe");
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
      ignored,
    };
    gestureLockRef.current = null;
  };

  const handleProfileTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || touchStartRef.current.ignored || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    if (!gestureLockRef.current) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        gestureLockRef.current = "vertical";
      } else if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        gestureLockRef.current = "horizontal";
      }
    }
  };

  const handleProfileTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || touchStartRef.current.ignored || gestureLockRef.current === "vertical") {
      touchStartRef.current = null;
      gestureLockRef.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;

    touchStartRef.current = null;
    gestureLockRef.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const velocity = absDx / (dt || 1);

    const isHorizontalSwipe = (absDx >= 50 || (absDx >= 35 && velocity > 0.35)) && absDx > absDy * 1.5 && dt < 550;
    if (!isHorizontalSwipe) return;

    if (dx < 0) {
      // SWIPE LEFT (Finger right-to-left) -> Next sub-tab
      if (activeTab === "personal") {
        e.stopPropagation();
        switchToTab("preferences", "left");
      } else if (activeTab === "preferences") {
        e.stopPropagation();
        switchToTab("security", "left");
      }
    } else if (dx > 0) {
      // SWIPE RIGHT (Finger left-to-right) -> Previous sub-tab
      if (activeTab === "security") {
        e.stopPropagation();
        switchToTab("preferences", "right");
      } else if (activeTab === "preferences") {
        e.stopPropagation();
        switchToTab("personal", "right");
      }
      // If activeTab === "personal", do not stopPropagation so global swipe takes user back to /notifications!
    }
  };

  // Form states
  const nameParts = user?.name?.split(" ") || ["", ""];
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || "");
  const [bio, setBio] = useState(user?.bio || "");

  const [preferredCategories, setPreferredCategories] = useState<string[]>(user?.preferred_categories || []);
  const [preferredLocations, setPreferredLocations] = useState<string[]>(user?.preferred_locations || []);
  const [preferenceNotificationsEnabled, setPreferenceNotificationsEnabled] = useState<boolean>(
    user?.preference_notifications_enabled ?? true
  );
  const [customCategory, setCustomCategory] = useState("");
  const [customLocation, setCustomLocation] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch("/api/auth/me", data),
    onSuccess: () => {
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast.success("Profile saved successfully!");
    },
    onError: () => {
      toast.error("Failed to update profile. Please try again.");
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.postForm("/api/auth/me/avatar", formData);
    },
    onSuccess: () => {
      toast.success("Profile photo updated successfully!");
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: () => {
      toast.error("Failed to upload photo. Must be an image under 5MB.");
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be under 5MB");
        return;
      }
      uploadAvatarMutation.mutate(file);
    }
  };

  const passwordMutation = useMutation({
    mutationFn: (data: any) => api.patch("/api/auth/password", data),
    onSuccess: () => {
      toast.success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to change password.");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => api.delete("/api/auth/me"),
    onSuccess: () => {
      logout();
      toast.success("Account deleted successfully.");
    },
    onError: () => {
      toast.error("Failed to delete account.");
    },
  });

  const handleSave = () => {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!fullName || !email) {
      toast.error("Name and email are required");
      return;
    }
    updateMutation.mutate({
      name: fullName,
      email,
      phone_number: phoneNumber,
      bio,
      preferred_categories: preferredCategories,
      preferred_locations: preferredLocations,
      preference_notifications_enabled: preferenceNotificationsEnabled,
    });
  };

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    passwordMutation.mutate({ current_password: currentPassword, new_password: newPassword });
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      <main 
        onTouchStart={handleProfileTouchStart}
        onTouchMove={handleProfileTouchMove}
        onTouchEnd={handleProfileTouchEnd}
        className="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-6"
      >
        
        {/* Tab Navigation directly at top */}
        <div data-no-swipe="true" className="flex border-b border-border gap-1 sm:gap-2 overflow-x-auto no-scrollbar mb-5 no-swipe">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  const currIdx = TABS.findIndex((t) => t.id === activeTab);
                  const nextIdx = TABS.findIndex((t) => t.id === tab.id);
                  if (currIdx !== nextIdx) {
                    switchToTab(tab.id, nextIdx > currIdx ? "left" : "right");
                  }
                }}
                className={cn(
                  "flex items-center gap-2 px-3.5 sm:px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap -mb-px",
                  isActive
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panels */}
        <div 
          className={cn(
            "rounded-3xl border border-border bg-card p-4 sm:p-7 shadow-sm transition-transform duration-200",
            tabSlideDirection === "left" && "animate-screen-slide-left",
            tabSlideDirection === "right" && "animate-screen-slide-right"
          )}
        >
          
          {/* 1. Personal */}
          {activeTab === "personal" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Personal Details</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Manage your profile picture, personal information, and contact details.
                </p>
              </div>

              {/* Embedded Profile Photo Upload */}
              <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-border bg-secondary/20 p-4">
                <div className="relative group shrink-0">
                  <div className="size-20 rounded-full overflow-hidden bg-secondary border-2 border-border shadow-inner">
                    <img 
                      src={user?.avatar_path ? getImageUrl(user.avatar_path) : `https://api.dicebear.com/7.x/notionists/svg?seed=${user?.name || 'user'}`} 
                      alt="Profile" 
                      className="h-full w-full object-cover" 
                    />
                  </div>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleAvatarChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAvatarMutation.isPending}
                    className="absolute bottom-0 right-0 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:scale-105 active:scale-95 disabled:opacity-50"
                    title="Change Photo"
                  >
                    <Camera className="size-3.5" />
                  </button>
                </div>
                <div className="text-center sm:text-left flex-1 min-w-0">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <p className="font-semibold text-foreground text-sm sm:text-base truncate">{user?.name || "Profile Photo"}</p>
                    {uploadAvatarMutation.isPending && (
                      <span className="text-xs text-primary animate-pulse font-medium">Uploading...</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap the camera or button to upload your picture (PNG, JPEG, WebP up to 5MB).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatarMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition shrink-0"
                >
                  <Upload className="size-3.5 text-primary" />
                  <span>Upload Photo</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="size-4 absolute left-3.5 top-3 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">Phone Number</label>
                  <div className="relative">
                    <Phone className="size-4 absolute left-3.5 top-3 text-muted-foreground" />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">Bio / Notes</label>
                  <textarea
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Brief description about yourself on campus..."
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. Preferences & Alerts */}
          {activeTab === "preferences" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Notification Preferences</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Receive real-time alerts whenever items matching your preferences are reported on campus.
                </p>
              </div>

              {/* Master toggle */}
              <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/20 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Enable preference notifications</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Notify me when lost or found items matching my categories or areas appear.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreferenceNotificationsEnabled(!preferenceNotificationsEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    preferenceNotificationsEnabled ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                      preferenceNotificationsEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {/* Preferred Categories */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">
                  Monitored Categories
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {preferredCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {cat}
                      <button
                        type="button"
                        onClick={() => setPreferredCategories(preferredCategories.filter((c) => c !== cat))}
                        className="hover:text-destructive transition"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {preferredCategories.length === 0 && (
                    <span className="text-xs text-muted-foreground">No categories monitored yet.</span>
                  )}
                </div>
                <div className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="e.g. ELECTRONICS, KEYS, ID_CARD"
                    className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customCategory.trim() && !preferredCategories.includes(customCategory.trim().toUpperCase())) {
                        setPreferredCategories([...preferredCategories, customCategory.trim().toUpperCase()]);
                        setCustomCategory("");
                      }
                    }}
                    className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Preferred Locations */}
              <div className="border-t border-border pt-5">
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">
                  Monitored Locations
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {preferredLocations.map((loc) => (
                    <span
                      key={loc}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-accent/15 border border-amber-accent/30 px-3 py-1 text-xs font-medium text-amber-accent-foreground"
                    >
                      <MapPin className="size-3" />
                      {loc}
                      <button
                        type="button"
                        onClick={() => setPreferredLocations(preferredLocations.filter((l) => l !== loc))}
                        className="hover:text-destructive transition"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {preferredLocations.length === 0 && (
                    <span className="text-xs text-muted-foreground">No locations monitored yet.</span>
                  )}
                </div>
                <div className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="e.g. Library, Cafeteria, Tech Block"
                    className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customLocation.trim() && !preferredLocations.includes(customLocation.trim())) {
                        setPreferredLocations([...preferredLocations, customLocation.trim()]);
                        setCustomLocation("");
                      }
                    }}
                    className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Security */}
          {activeTab === "security" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Security & Password</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Change your password or manage your account security.
                </p>
              </div>

              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">
                    Current password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">
                    New password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePasswordChange}
                  disabled={passwordMutation.isPending}
                  className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-medium hover:bg-foreground/90 transition disabled:opacity-50"
                >
                  {passwordMutation.isPending ? "Updating..." : "Update Password"}
                </button>
              </div>

              {/* Delete account */}
              <div className="border-t border-border pt-6 mt-8">
                <h3 className="text-base font-semibold text-destructive mb-1">Danger Zone</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Permanently delete your account, reports, and match history. This action cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Are you absolutely sure you want to delete your account? All data will be permanently removed.")) {
                      deleteAccountMutation.mutate();
                    }
                  }}
                  disabled={deleteAccountMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  {deleteAccountMutation.isPending ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            </div>
          )}

          {/* Bottom Save bar */}
          <div className="mt-8 border-t border-border pt-5 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50 w-full sm:w-auto"
            >
              <Check className="size-4" />
              {updateMutation.isPending ? "Saving..." : "Save All Changes"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
