import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";
import { ArrowLeft, User as UserIcon } from "lucide-react";
import { getImageUrl } from "@/lib/utils";

export const Route = createFileRoute("/profile/$id")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !localStorage.getItem("findit_auth_token")) {
      throw redirect({ to: "/login" });
    }
  },
  component: UserProfilePage,
});

interface PublicUser {
  id: number;
  name: string;
  email: string;
  avatar_path?: string;
  phone_number?: string;
  bio?: string;
  department?: string;
  year_of_study?: string;
  section_class?: string;
  graduation_year?: string;
  campus?: string;
  building?: string;
  floor?: string;
  classroom?: string;
  lab_room?: string;
  hostel?: string;
}

function UserProfilePage() {
  const { id } = Route.useParams();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ["publicProfile", id],
    queryFn: () => api.get<PublicUser>(`/api/users/${id}/profile`),
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <Link to="/notifications" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowLeft className="size-4" /> Back
            </Link>
            <h1 className="font-display text-4xl">User Profile</h1>
          </div>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="mt-4 text-sm font-medium">Loading profile...</p>
          </div>
        ) : isError || !user ? (
          <div className="rounded-3xl border border-dashed border-border py-20 text-center text-muted-foreground">
            <UserIcon className="mx-auto size-10 opacity-50" />
            <h3 className="mt-4 font-display text-xl text-foreground">Profile not found</h3>
            <p className="mt-2 text-sm text-muted-foreground">This user might not exist or their profile is private.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-6">
              <div className="flex items-center gap-6 pb-6 border-b border-border">
                 <div className="size-20 rounded-full bg-secondary overflow-hidden border border-border">
                   <img 
                     src={user.avatar_path ? getImageUrl(user.avatar_path) : `https://api.dicebear.com/7.x/notionists/svg?seed=${user.name}`} 
                     alt="Profile" 
                     className="w-full h-full object-cover" 
                   />
                 </div>
                 <div>
                   <h2 className="text-2xl font-semibold">{user.name}</h2>
                   {user.email && <p className="text-muted-foreground">{user.email}</p>}
                   {user.department && <p className="text-sm mt-1">{user.department} {user.year_of_study ? `• ${user.year_of_study}` : ''}</p>}
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                {user.phone_number && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                    <div className="mt-1 font-medium">{user.phone_number}</div>
                  </div>
                )}
                {user.bio && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Bio / About me</label>
                    <div className="mt-1 font-medium">{user.bio}</div>
                  </div>
                )}
                {user.section_class && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Section / Class</label>
                    <div className="mt-1 font-medium">{user.section_class}</div>
                  </div>
                )}
                {user.graduation_year && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Graduation Year</label>
                    <div className="mt-1 font-medium">{user.graduation_year}</div>
                  </div>
                )}
                {user.campus && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Campus</label>
                    <div className="mt-1 font-medium">{user.campus}</div>
                  </div>
                )}
                {user.building && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Building / Block</label>
                    <div className="mt-1 font-medium">{user.building}</div>
                  </div>
                )}
                {user.floor && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Floor</label>
                    <div className="mt-1 font-medium">{user.floor}</div>
                  </div>
                )}
                {user.classroom && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Classroom</label>
                    <div className="mt-1 font-medium">{user.classroom}</div>
                  </div>
                )}
                {user.lab_room && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Lab / Room</label>
                    <div className="mt-1 font-medium">{user.lab_room}</div>
                  </div>
                )}
                {user.hostel && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Hostel / Residence</label>
                    <div className="mt-1 font-medium">{user.hostel}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
