/**
 * u3's bundled library in Studio (components/U3LibraryPanel, studio/server/u3-library.mjs): its sound effects and
 * memes listed, found by name, category or emotion, and dragged onto the timeline. An item dragged is not a file of
 * the project yet: the drag carries its id (`u3Library`) and the drop puts it in the project first (`placeU3Sfx`,
 * `placeU3Meme`), then on the timeline; a meme as u3 puts one, centered, 60% of the stage's width (`u3MemeBox`).
 *
 * The functions above the line are pure: no React, no DOM, so `node --test` runs them.
 */
import type { FilmBox } from './film.ts';
import type { ResourceDragItem } from './resource-drag.ts';

/** One sound effect as the library lists it. */
export interface U3Sfx { id: string; category: string; title: string; durationSec: number | null }

/** The library's categories, in name order. */
export function u3Categories(items: readonly U3Sfx[]): string[] {
  return [...new Set(items.map((i) => i.category))].sort();
}

/** The sounds of `category` ('' every one) whose name, category or id has `query` in it, in the order listed. */
export function filterU3Sfx(items: readonly U3Sfx[], query: string, category: string): U3Sfx[] {
  const q = query.trim().toLocaleLowerCase();
  return items.filter((i) => (!category || i.category === category)
    && (!q || [i.title, i.category, i.id].some((v) => v.toLocaleLowerCase().includes(q))));
}

/** Where a sound lands in the project (the server says where it did: this is the drag's stand-in until then). */
export const u3SfxPath = (item: U3Sfx) => `assets/audio/sfx/${item.id}.mp3`;

/** A sound as the timeline takes a drag: a sound clip of its length, named by its title, with its id to place. */
export function u3DragItem(item: U3Sfx): ResourceDragItem {
  const durationMs = item.durationSec && item.durationSec > 0 ? Math.round(item.durationSec * 1000) : undefined;
  return {
    path: u3SfxPath(item), name: item.title, kind: 'audio', dir: 'assets/audio/sfx', size: 0, mtimeMs: 0,
    ...(durationMs ? { durationMs } : {}), u3Library: item.id,
  };
}

/** One meme as the library lists it. */
export interface U3Meme {
  id: string; emotion: string; situations: string[]; description: string; durationSec: number | null; width: number | null; height: number | null;
}

/** The memes' emotions, each once, in name order. */
export function u3Emotions(items: readonly U3Meme[]): string[] {
  return [...new Set(items.map((i) => i.emotion))].sort();
}

const fold = (v: string) => v.normalize('NFC').toLocaleLowerCase();

/** The memes of `emotion` ('' every one) whose description, situations, emotion or id has `query` in it, in the order listed. */
export function filterU3Memes(items: readonly U3Meme[], query: string, emotion: string): U3Meme[] {
  const q = fold(query.trim());
  return items.filter((i) => (!emotion || i.emotion === emotion)
    && (!q || [i.description, i.emotion, i.id, ...i.situations].some((v) => fold(v).includes(q))));
}

/** The width of the stage a meme takes when dropped (u3: a small picture, centered). */
export const MEME_WIDTH = 0.6;

/**
 * Where a dropped meme sits: 60% of the stage's width, in its own shape, centered; less wide when that would be taller
 * than the stage, so all of it shows. None when the stage or the meme's size is not known.
 */
export function u3MemeBox(meme: { w?: number | undefined; h?: number | undefined }, stage: { w: number; h: number } | null | undefined): FilmBox | null {
  if (!stage || !(stage.w > 0 && stage.h > 0) || !(meme.w && meme.w > 0 && meme.h && meme.h > 0)) return null;
  let w = Math.round(stage.w * MEME_WIDTH);
  let h = Math.round((w * meme.h) / meme.w);
  if (h > stage.h) { h = stage.h; w = Math.round((h * meme.w) / meme.h); }
  return { x: Math.round((stage.w - w) / 2), y: Math.round((stage.h - h) / 2), w, h };
}

/** Where a meme lands in the project (the server says where it did: this is the drag's stand-in until then). */
export const u3MemePath = (item: U3Meme) => `assets/video/memes/${item.id}.mp4`;

/** A meme as the timeline takes a drag: a video clip of its length and size, named by its id, with its id to place. */
export function u3MemeDragItem(item: U3Meme): ResourceDragItem {
  const durationMs = item.durationSec && item.durationSec > 0 ? Math.round(item.durationSec * 1000) : undefined;
  return {
    path: u3MemePath(item), name: item.id, kind: 'video', dir: 'assets/video/memes', size: 0, mtimeMs: 0,
    ...(durationMs ? { durationMs } : {}), ...(item.width && item.height ? { w: item.width, h: item.height } : {}), u3Library: item.id,
  };
}

/* ── Studio's API (not pure) ── */

/** The sounds there are; `dir` null when there is no library here. */
export async function listU3Sfx(): Promise<{ dir: string | null; items: U3Sfx[] }> {
  const res = await fetch('/api/u3/library/sfx');
  const body = await res.json().catch(() => ({})) as { dir?: string | null; items?: U3Sfx[]; error?: string };
  if (!res.ok) throw new Error(String(body.error ?? `Studio answered ${res.status}`));
  return { dir: body.dir ?? null, items: Array.isArray(body.items) ? body.items : [] };
}

/** The memes there are; `dir` null when there are none here. */
export async function listU3Memes(): Promise<{ dir: string | null; items: U3Meme[] }> {
  const res = await fetch('/api/u3/library/memes');
  const body = await res.json().catch(() => ({})) as { dir?: string | null; items?: U3Meme[]; error?: string };
  if (!res.ok) throw new Error(String(body.error ?? `Studio answered ${res.status}`));
  return { dir: body.dir ?? null, items: Array.isArray(body.items) ? body.items : [] };
}

/** A sound's address, to listen to. */
export const u3SfxUrl = (id: string) => `/api/u3/library/file?id=${encodeURIComponent(id)}`;
/** A meme's address, to watch. */
export const u3MemeUrl = (id: string) => `/api/u3/library/file?kind=meme&id=${encodeURIComponent(id)}`;

/** The sound `id` put in the project: its path there. */
export const placeU3Sfx = (projectId: string, id: string) => place(projectId, { id });
/** The meme `id` put in the project: its path there. */
export const placeU3Meme = (projectId: string, id: string) => place(projectId, { id, kind: 'meme' });

async function place(projectId: string, what: { id: string; kind?: 'meme' }): Promise<string> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/u3/library/place`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(what),
  });
  const body = await res.json().catch(() => ({})) as { path?: string; error?: string };
  if (!res.ok || typeof body.path !== 'string') throw new Error(String(body.error ?? `Studio answered ${res.status}`));
  return body.path;
}
