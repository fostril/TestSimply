import { ReactNode } from "react";
import { CheckSquare } from "lucide-react";
import { ProjectSwitcher } from "@/components/project-switcher";
import { CommandPalette } from "@/components/ui/command-palette";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SidebarNavigation } from "@/components/layout/sidebar-navigation";
import { UserProfile } from "@/components/layout/user-profile";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
          <div className="mb-5 flex items-center gap-2 px-1">
            <CheckSquare className="h-5 w-5 text-blue-600" />
            <span className="text-base font-semibold tracking-tight text-slate-900">
              TestSimply
            </span>
          </div>
          <ProjectSwitcher />
          <SidebarNavigation />
          <UserProfile />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <CheckSquare className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-semibold text-slate-900">TestSimply</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <CommandPalette />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
