import type { Entry, Collection, Effect, LeagueLore, Trigger } from '../data/generated/asset-types';

export type { Collection, Effect, Entry, LeagueLore, Trigger };

export interface LoreSearchDocument {
  id: string;
  category: 'lore';
  title: string;
  subtitle: string;
  keywords: string[];
  priority: number;
  action: { kind: 'lore'; targetType: 'entry' | 'collection'; targetId: string };
}

export interface LoreScope {
  readonly id: string;
  clear(): void;
  timer(callback: () => void, duration: number): number;
  add(node: Node): void;
}

export interface LoreRevealOptions {
  scope?: LoreScope;
  opener?: HTMLElement | null;
  context?: Record<string, unknown>;
  effectId?: string;
}

export interface LoreService {
  hydrate(asset: LeagueLore | null): void;
  entry(id: string): Entry | null;
  collection(id: string): Collection | null;
  effect(id: string): Effect | null;
  searchDocuments(): LoreSearchDocument[];
  trigger(id: string, context?: Record<string, unknown>): boolean;
  reveal(targetType: 'entry' | 'collection', targetId: string, options?: LoreRevealOptions): Promise<boolean>;
  createScope(id: string): LoreScope;
  setReducedMotion(reduced: boolean): void;
  clearTransient(): void;
  dispose(): void;
  isEnabled(): boolean;
}

export type LoreTrigger = Trigger;
