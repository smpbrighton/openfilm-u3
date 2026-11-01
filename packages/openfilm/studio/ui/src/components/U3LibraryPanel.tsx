/**
 * The u3 Library panel: u3's bundled sound effects (lib/u3-library, studio/server/u3-library.mjs), left of the
 * picture beside the Layers panel. A search and a category narrow the list; a row's play button listens to it (one
 * at a time); a row dragged onto the timeline puts the sound in the project's assets/audio/sfx/ and a sound clip
 * where it was dropped (ProjectView `dropAsset`).
 */
import React from 'react';
import { Pause, Play, Search, X } from 'lucide-react';
import { useT } from '@/i18n';
import { clearResourceDrag, setResourceDragData } from '@/lib/resource-drag';
import { filterU3Sfx, listU3Sfx, u3Categories, u3DragItem, u3SfxUrl, type U3Sfx } from '@/lib/u3-library';
import { PANE_BAR, PANE_BTN, PANE_ICON, PANE_TITLE } from './dock-pane-bar';
import { MIN_VIEWER, PaneDivider } from './PaneDivider';
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

export function U3LibraryPanel({ onClose }: { onClose: () => void }) {
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
      <div className="flex shrink-0 flex-col gap-1.5 px-2.5 pb-1.5">
        <label className="flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2 text-[12.5px] text-[var(--text-muted)]">
          <Search size={13} className="shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('u3Library.search')} aria-label={t('u3Library.search')}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            className="min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]" />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('u3Library.category')}
          className="h-7 rounded-md bg-[var(--bg-hover)] px-1.5 text-[12.5px] text-[var(--text)] outline-none">
          <option value="">{t('u3Library.all')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {problem ? <p className="px-4 pt-4 text-[12px] leading-relaxed text-[var(--text-muted)]" role="alert">{problem}</p>
        : missing ? <p className="px-4 pt-4 text-[12px] leading-relaxed text-[var(--text-muted)]">{t('u3Library.missing')}</p>
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
