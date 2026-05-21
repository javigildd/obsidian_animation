import { AnimProp } from '../timeline/store';
import { Keyframe } from '../timeline/interpolate';

const STORAGE_KEY = 'obsidian_animation.sessions.v1';

/** Persistable snapshot of the timeline (the bits a user would want to keep). */
export interface SessionData {
  duration: number;
  fps: number;
  loop: boolean;
  defaults: Record<AnimProp, number>;
  tracks: Record<AnimProp, Keyframe[]>;
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  data: SessionData;
}

function safeRead(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(sessions: Session[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to persist sessions', err);
  }
}

export function listSessions(): Session[] {
  return safeRead().sort((a, b) => b.createdAt - a.createdAt);
}

export function saveSession(name: string, data: SessionData): Session {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const session: Session = { id, name, createdAt: Date.now(), data };
  const all = safeRead();
  all.push(session);
  safeWrite(all);
  return session;
}

export function overwriteSession(id: string, data: SessionData): void {
  const all = safeRead();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], data, createdAt: Date.now() };
  safeWrite(all);
}

export function renameSession(id: string, name: string): void {
  const all = safeRead();
  const s = all.find((x) => x.id === id);
  if (!s) return;
  s.name = name;
  safeWrite(all);
}

export function deleteSession(id: string): void {
  safeWrite(safeRead().filter((s) => s.id !== id));
}

/** Best-effort JSON parse + shape check for imported sessions. */
export function parseSessionFromJson(text: string): SessionData | null {
  try {
    const obj = JSON.parse(text);
    if (
      obj &&
      typeof obj === 'object' &&
      typeof obj.duration === 'number' &&
      typeof obj.fps === 'number' &&
      obj.defaults &&
      obj.tracks
    ) {
      return obj as SessionData;
    }
    // Some users may export the wrapped Session — accept that too.
    if (obj && obj.data && obj.data.tracks) return obj.data as SessionData;
    return null;
  } catch {
    return null;
  }
}
