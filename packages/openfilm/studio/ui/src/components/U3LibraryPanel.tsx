/**
 * The u3 Library panel: u3's bundled sound effects and memes (lib/u3-library, studio/server/u3-library.mjs), left of
 * the picture beside the Layers panel, one tab each. Sound effects: a search and a category narrow the list; a row's
 * play button listens to it (one at a time). Memes: a search and an emotion page the server's ranked list, 24 at a
 * time; a row hovered plays its small preview, muted. A row dragged onto the timeline puts the file in the project (assets/audio/sfx/,
 * assets/video/memes/) and a clip where it was dropped (ProjectView `dropAsset`).
 */
import React from 'react';
import { Pause, Play, Search, X } from 'lucide-react';
import { useT } from '@/i18n';
import { clearResourceDrag, setResourceDragData } from '@/lib/resource-drag';
import {
  filterU3Sfx, listU3Memes, listU3Sfx, mergeU3MemePage, U3_MEME_EMOTIONS, u3Categories, u3DragItem, u3MemeDragItem, u3MemeUrl, u3SfxUrl,
  type U3Meme, type U3MemePage, type U3Sfx,
} from '@/lib/u3-library';
import { PANE_BAR, PANE_BTN, PANE_BTN_ON, PANE_ICON, PANE_TITLE } from './dock-pane-bar';
import { MIN_VIEWER, PaneDivider } from './PaneDivider';
import { useNearViewport } from './MediaPreview';
import { Tooltip } from './Tooltip';

const PANE = 'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[7px]';
const MIN_W = 200;

/** The panel in its pane, with the divider that resizes it: `rowRef` is the row of panes it is in. */
export function U3LibraryPane({ rowRef, onClose }: { rowRef: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const t = useT();
  const [width, setWidth] = React.useState(260);
  const pane = React.useRef<HTMLDivElement | null>(null);
  return <>
    <div ref={pane} className={`${PANE} shrink-0 bg-[var(--dock-pane)]`} style={{ width }}>
      <U3LibraryPanel onClose={onClose} />
    </div>
    {/* the divider measures from the row's left edge: the panes left of this one are taken off */}
    <PaneDivider width={width} containerRef={rowRef} label={t('u3Library.resize')} min={MIN_W} minRest={MIN_VIEWER}
      onResize={(w) => {
        const left = (pane.current?.getBoundingClientRect().left ?? 0) - (rowRef.current?.getBoundingClientRect().left ?? 0);
        setWidth(Math.max(MIN_W, w - left));
      }} />
  </>;
}

const TAB = 'h-[22px] shrink-0 rounded-md px-2 text-[12px] text-[var(--text-dim)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]';
const FIELD = 'flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2 text-[12.5px] text-[var(--text-muted)]';
const SELECT = 'h-7 rounded-md bg-[var(--bg-hover)] px-1.5 text-[12.5px] text-[var(--text)] outline-none';
const NOTE = 'px-4 pt-4 text-[12px] leading-relaxed text-[var(--text-muted)]';

export function U3LibraryPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = React.useState<'sfx' | 'memes'>('sfx');
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-u3-library="">
      <div className={PANE_BAR}>
        <span className={`${PANE_TITLE} px-1`}>{t('u3Library.title')}</span>
        <span className="min-w-0 flex-1" />
        <Tooltip label={t('u3Library.hide')} side="bottom">
          <button type="button" onClick={onClose} aria-label={t('u3Library.hide')} className={PANE_BTN}>
            <X size={PANE_ICON} />
          </button>
        </Tooltip>
      </div>
      <div role="tablist" className="flex shrink-0 gap-1 px-2.5 pb-1.5">
        {(['sfx', 'memes'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`${TAB} ${tab === k ? PANE_BTN_ON : ''}`}>{t(k === 'sfx' ? 'u3Library.tabSfx' : 'u3Library.tabMemes')}</button>
        ))}
      </div>
      {tab === 'sfx' ? <SfxTab /> : <MemesTab />}
    </div>
  );
}

function SfxTab() {
  const t = useT();
  const [items, setItems] = React.useState<U3Sfx[] | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [playing, setPlaying] = React.useState<string | null>(null);
  const audio = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    let live = true;
    listU3Sfx().then(({ dir, items: all }) => {
      if (!live) return;
      setMissing(dir === null);
      setItems(all);
    }, (e: unknown) => { if (live) setProblem(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; audio.current?.pause(); };
  }, []);

  const categories = React.useMemo(() => u3Categories(items ?? []), [items]);
  const shown = React.useMemo(() => filterU3Sfx(items ?? [], query, category), [items, query, category]);

  const listen = (id: string) => {
    const player = audio.current;
    if (!player) return;
    if (playing === id) { player.pause(); setPlaying(null); return; }
    player.src = u3SfxUrl(id);
    player.currentTime = 0;
    void player.play().then(() => setPlaying(id), () => setPlaying(null));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 px-2.5 pb-1.5">
        <label className={FIELD}>
          <Search size={13} className="shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('u3Library.search')} aria-label={t('u3Library.search')}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            className="min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]" />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('u3Library.category')} className={SELECT}>
          <option value="">{t('u3Library.all')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {problem ? <p className={NOTE} role="alert">{problem}</p>
        : missing ? <p className={NOTE}>{t('u3Library.missing')}</p>
          : items && !shown.length ? <p className="px-4 pt-4 text-center text-[12px] text-[var(--text-muted)]">{t('u3Library.none')}</p>
            : null}
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" aria-label={t('u3Library.title')}>
        {shown.map((item) => (
          <li key={item.id} draggable title={item.title}
            onDragStart={(e) => { setResourceDragData(e.dataTransfer, u3DragItem(item)); e.dataTransfer.effectAllowed = 'copy'; }}
            onDragEnd={() => clearResourceDrag()}
            className="group flex h-8 cursor-default select-none items-center gap-1.5 rounded-md px-1 hover:bg-[var(--bg-hover)]">
            <button type="button" onClick={() => listen(item.id)} aria-label={t(playing === item.id ? 'u3Library.stop' : 'u3Library.listen')}
              className={PANE_BTN}>
              {playing === item.id ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text)]">{item.title}</span>
            <span className="shrink-0 text-[11px] text-[var(--text-faint)]">{item.category}</span>
            {item.durationSec ? <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-faint)]">{item.durationSec.toFixed(1)}s</span> : null}
          </li>
        ))}
      </ul>
      <audio ref={audio} preload="none" onEnded={() => setPlaying(null)} className="hidden" />
    </div>
  );
}

function MemesTab() {
  const t = useT();
  const [query, setQuery] = React.useState('');
  const [emotion, setEmotion] = React.useState('');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 px-2.5 pb-1.5">
        <label className={FIELD}>
          <Search size={13} className="shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('u3Library.searchMemes')} aria-label={t('u3Library.searchMemes')}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            className="min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]" />
        </label>
        <select value={emotion} onChange={(e) => setEmotion(e.target.value)} aria-label={t('u3Library.emotion')} className={SELECT}>
          <option value="">{t('u3Library.all')}</option>
          {U3_MEME_EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      {/* A new filter owns a new list: scroll, pages, timer and in-flight requests reset together. */}
      <MemeResults key={JSON.stringify([query.trim(), emotion])} query={query.trim()} emotion={emotion} />
    </div>
  );
}

function MemeResults({ query, emotion }: { query: string; emotion: string }) {
  const t = useT();
  const [page, setPage] = React.useState<U3MemePage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [problem, setProblem] = React.useState<string | null>(null);
  const list = React.useRef<HTMLUListElement | null>(null);
  const end = React.useRef<HTMLLIElement | null>(null);
  const live = React.useRef(false);
  const busy = React.useRef(false);
  const request = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async (offset: number) => {
    if (!live.current || busy.current) return;
    busy.current = true;
    setLoading(true);
    setProblem(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await listU3Memes({ query, emotion, offset }, controller.signal);
      if (live.current && !controller.signal.aborted) setPage((was) => mergeU3MemePage(was, result, offset));
    } catch (error) {
      if (live.current && !controller.signal.aborted) setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
      if (live.current && !controller.signal.aborted) setLoading(false);
    }
  }, [query, emotion]);

  React.useEffect(() => {
    live.current = true;
    const timer = window.setTimeout(() => { void load(0); }, 250);
    return () => {
      live.current = false;
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [load]);

  React.useEffect(() => {
    if (loading || problem || page?.next == null || !list.current || !end.current) return;
    const offset = page.next;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(offset);
    }, { root: list.current });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [page, loading, problem, load]);

  return <>
      {problem ? <p className={NOTE} role="alert">{problem}</p>
        : page?.dir === null ? <p className={NOTE}>{t('u3Library.missingMemes')}</p>
          : page && !page.items.length ? <p className="px-4 pt-4 text-center text-[12px] text-[var(--text-muted)]">{t('u3Library.noMemes')}</p>
            : null}
      <ul ref={list} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" aria-label={t('u3Library.tabMemes')} aria-busy={loading}>
        {page?.items.map((item) => <MemeRow key={item.id} item={item} />)}
        {page?.next != null ? <li ref={end} aria-hidden="true" className="h-px" /> : null}
      </ul>
  </>;
}

function MemeRow({ item }: { item: U3Meme }) {
  const [nearRef, near] = useNearViewport<HTMLLIElement>();
  const video = React.useRef<HTMLVideoElement | null>(null);
  React.useEffect(() => {
    const player = video.current;
    return () => { player?.pause(); };
  }, []);

  return (
    <li ref={nearRef} draggable title={item.description || item.id}
      onDragStart={(e) => { setResourceDragData(e.dataTransfer, u3MemeDragItem(item)); e.dataTransfer.effectAllowed = 'copy'; }}
      onDragEnd={() => clearResourceDrag()}
      onMouseEnter={() => { void video.current?.play().catch(() => {}); }}
      onMouseLeave={() => { const player = video.current; if (player) { player.pause(); player.currentTime = 0; } }}
      className="group flex h-14 cursor-default select-none items-center gap-1.5 rounded-md px-1.5 hover:bg-[var(--bg-hover)]">
      <video ref={video} src={near ? u3MemeUrl(item.id) : undefined} muted loop playsInline preload="metadata"
        className="h-10 w-16 shrink-0 rounded bg-black object-contain" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text)]">{item.description || item.id}</span>
      <span className="shrink-0 text-[11px] text-[var(--text-faint)]">{item.emotion}</span>
      {item.durationSec ? <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-faint)]">{item.durationSec.toFixed(1)}s</span> : null}
    </li>
  );
}
