/**
 * u3's bundled library in Studio (components/U3LibraryPanel, studio/server/u3-library.mjs): its sound effects listed,
 * found by name or category, and dragged onto the timeline. A sound dragged is not a file of the project yet: the drag
 * carries its id (`u3Library`) and the drop puts it in the project first (`placeU3Sfx`), then on the timeline.
 *
 * The functions above the line are pure: no React, no DOM, so `node --test` runs them.
 */
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

/* ── Studio's API (not pure) ── */

/** The sounds there are; `dir` null when there is no library here. */
export async function listU3Sfx(): Promise<{ dir: string | null; items: U3Sfx[] }> {
  const res = await fetch('/api/u3/library/sfx');
  const body = await res.json().catch(() => ({})) as { dir?: string | null; items?: U3Sfx[]; error?: string };
  if (!res.ok) throw new Error(String(body.error ?? `Studio answered ${res.status}`));
  return { dir: body.dir ?? null, items: Array.isArray(body.items) ? body.items : [] };
}

/** A sound's address, to listen to. */
export const u3SfxUrl = (id: string) => `/api/u3/library/file?id=${encodeURIComponent(id)}`;

/** The sound `id` put in the project: its path there. */
export async function placeU3Sfx(projectId: string, id: string): Promise<string> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/u3/library/place`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
  });
  const body = await res.json().catch(() => ({})) as { path?: string; error?: string };
  if (!res.ok || typeof body.path !== 'string') throw new Error(String(body.error ?? `Studio answered ${res.status}`));
  return body.path;
}
