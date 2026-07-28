export const FAVORITE_OWNER_STORAGE_KEY = 'darling.favoriteOwner.v1';

export interface OwnerPreferenceSnapshot {
  readonly owner: string | null;
  readonly persisted: boolean;
  readonly revision: number;
}

export interface OwnerPreferenceSetResult {
  accepted: boolean;
  persisted: boolean;
  snapshot: OwnerPreferenceSnapshot;
  reason?: 'invalid-owner' | 'storage-unavailable';
}

export interface OwnerPreferenceService {
  getSnapshot(): OwnerPreferenceSnapshot;
  validOwners(): readonly string[];
  set(owner: string | null): OwnerPreferenceSetResult;
  subscribe(listener: (snapshot: OwnerPreferenceSnapshot) => void): () => void;
  dispose(): void;
}

interface OwnerPreferenceOptions {
  storage?: Storage | null;
  storageKey?: string;
}

export function canonicalOwners(values: readonly string[]): readonly string[] {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function createOwnerPreferenceService(
  ownerValues: readonly string[],
  win: Window,
  options: OwnerPreferenceOptions = {},
): OwnerPreferenceService {
  const owners = canonicalOwners(ownerValues);
  const ownerSet = new Set(owners);
  const storageKey = options.storageKey || FAVORITE_OWNER_STORAGE_KEY;
  const listeners = new Set<(snapshot: OwnerPreferenceSnapshot) => void>();
  let disposed = false;
  let storage: Storage | null = null;
  let storageAvailable = true;
  try {
    storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage || null : win.localStorage;
    storageAvailable = !!storage;
  } catch {
    storageAvailable = false;
  }

  let initialOwner: string | null = null;
  if (storage) {
    try {
      const stored = storage.getItem(storageKey);
      if (stored && ownerSet.has(stored)) initialOwner = stored;
      else if (stored !== null) storage.removeItem(storageKey);
    } catch {
      storageAvailable = false;
    }
  }
  let snapshot: OwnerPreferenceSnapshot = {
    owner: initialOwner,
    persisted: storageAvailable,
    revision: 0,
  };

  const publish = (owner: string | null, persisted: boolean): OwnerPreferenceSnapshot => {
    if (snapshot.owner === owner && snapshot.persisted === persisted) return snapshot;
    snapshot = { owner, persisted, revision: snapshot.revision + 1 };
    if (!disposed) listeners.forEach(listener => listener(snapshot));
    return snapshot;
  };

  const persist = (owner: string | null): boolean => {
    if (!storage) return false;
    try {
      if (owner === null) storage.removeItem(storageKey);
      else storage.setItem(storageKey, owner);
      return true;
    } catch {
      return false;
    }
  };

  const set = (owner: string | null): OwnerPreferenceSetResult => {
    if (owner !== null && !ownerSet.has(owner)) {
      return { accepted: false, persisted: snapshot.persisted, snapshot, reason: 'invalid-owner' };
    }
    const persisted = persist(owner);
    const next = publish(owner, persisted);
    return {
      accepted: true,
      persisted,
      snapshot: next,
      reason: persisted ? undefined : 'storage-unavailable',
    };
  };

  const onStorage = (event: StorageEvent) => {
    if (disposed || event.key !== storageKey) return;
    const incoming = event.newValue;
    if (incoming === null || ownerSet.has(incoming)) publish(incoming, true);
    else publish(null, persist(null));
  };
  win.addEventListener('storage', onStorage);

  return {
    getSnapshot: () => snapshot,
    validOwners: () => owners,
    set,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      win.removeEventListener('storage', onStorage);
    },
  };
}
