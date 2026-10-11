import type { PlayerProgress } from "./progress";

export interface Page {
  root: HTMLElement;
  onShow?(): void;
}

export interface Feature {
  id: string;
  title: string;
  summary: string;
  ready: boolean;
  isDone?(progress: PlayerProgress): boolean;
  createPage(progress: PlayerProgress): Page;
}
