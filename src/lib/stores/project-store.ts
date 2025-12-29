import { create } from "zustand";

interface ProjectState {
  projectId: string | null;
  projectKey: string | null;
  setProjectId: (projectId: string | null) => void;
  setProject: (project: { id: string; key: string } | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectId: null,
  projectKey: null,
  setProjectId: (projectId) => set({ projectId }), // Keep for backward compatibility if needed, but prefer setProject
  setProject: (project) => set({ projectId: project?.id ?? null, projectKey: project?.key ?? null })
}));
