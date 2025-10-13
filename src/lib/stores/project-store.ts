import { create } from "zustand";

interface ProjectState {
  projectId: string | null;
  setProjectId: (projectId: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectId: null,
  setProjectId: (projectId) => set({ projectId })
}));
