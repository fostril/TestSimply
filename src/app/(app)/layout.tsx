import { ReactNode } from "react";
import { ProjectSwitcher } from "@/components/project-switcher";
import { CommandPalette } from "@/components/ui/command-palette";
import { AuthGuard } from "@/components/auth/auth-guard";


import { SidebarNavigation } from "@/components/layout/sidebar-navigation";
import { UserProfile } from "@/components/layout/user-profile";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
        <aside className="hidden w-64 flex-col border-r border-border bg-card/50 backdrop-blur-xl p-6 lg:flex">
          <div className="mb-8">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <div className="h-4 w-4 rounded-sm bg-primary" />
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight text-foreground">TestSimply</div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Toolkit</p>
              </div>
            </div>
          </div>
          <ProjectSwitcher />
          <SidebarNavigation />
          <UserProfile />
        </aside>
        <main className="flex-1 overflow-y-auto bg-background/95">
          <CommandPalette />
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
// Force rebuild
