// Everything a host may restyle is a --tm-* variable on .tm-root.
export const styles = /* css */ `
.tm-root {
  --tm-paper: #fbfaf6;
  --tm-ink: #2a2926;
  --tm-faint: #9a968c;
  --tm-rule: #e9e5db;
  --tm-serif: "Iowan Old Style", "Palatino Linotype", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", Georgia, serif;
  --tm-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
  --tm-size: 18px;
  --tm-measure: 34em;
  --tm-note-l: 38%;
  --tm-note-bg-l: 96%;
  position: relative;
  height: 100%;
  background: var(--tm-paper);
  color: var(--tm-ink);
  font: var(--tm-size)/1.85 var(--tm-serif);
  -webkit-font-smoothing: antialiased;
}
.tm-root.tm-dark {
  --tm-paper: #1a1917;
  --tm-ink: #e4e0d6;
  --tm-faint: #77736a;
  --tm-rule: #2e2c28;
  --tm-note-l: 72%;
  --tm-note-bg-l: 15%;
}
.tm-root *, .tm-root *::before { box-sizing: border-box; }
.tm-scroll { height: 100%; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--tm-rule) transparent; }
.tm-page {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, var(--tm-measure)) minmax(14em, 21em);
  column-gap: 3.5em;
  justify-content: center;
  padding: 14vh 2em 45vh;
}
.tm-narrow .tm-page { grid-template-columns: minmax(0, var(--tm-measure)); padding: 2.2em 1.3em 55vh; }

.tm-text { outline: none; white-space: pre-wrap; overflow-wrap: break-word; caret-color: var(--tm-ink); min-height: 1.85em; }
.tm-text p { margin: 0; }
.tm-text p.tm-far { content-visibility: auto; contain-intrinsic-size: auto 1.85em; }
.tm-text.tm-empty::before { content: attr(data-placeholder); color: var(--tm-faint); pointer-events: none; position: absolute; }
.tm-text ::selection { background: color-mix(in srgb, var(--tm-ink) 16%, transparent); }

.tm-foot { min-height: 1.85em; margin-top: 1.1em; color: var(--tm-faint); font-style: italic; }
.tm-whisper { animation: tm-rise .6s ease both; }
.tm-whisper b { font: 600 .68em/1 var(--tm-sans); font-style: normal; letter-spacing: .09em; text-transform: uppercase; color: hsl(var(--tm-h) 45% var(--tm-note-l)); margin-right: .9em; }
.tm-busy { display: inline-flex; gap: .32em; padding: .7em 0; }
.tm-busy i { width: .26em; height: .26em; border-radius: 50%; background: var(--tm-faint); animation: tm-breathe 1.4s ease-in-out infinite; }
.tm-busy i:nth-child(2) { animation-delay: .18s; }
.tm-busy i:nth-child(3) { animation-delay: .36s; }
.tm-flash { font: .72em/1.5 var(--tm-sans); font-style: normal; color: #b4482f; cursor: pointer; }

.tm-margin { position: relative; font: .76em/1.6 var(--tm-sans); }
.tm-narrow .tm-margin { display: none; }
.tm-tray { display: none; }
.tm-narrow .tm-tray {
  display: block; position: absolute; left: 0; right: 0; bottom: 0; padding: 0 .8em .8em;
  font: .8em/1.6 var(--tm-sans); pointer-events: none;
}
.tm-narrow .tm-tray .tm-note {
  position: static; pointer-events: auto; background: var(--tm-paper);
  box-shadow: 0 6px 28px rgb(0 0 0 / .14), 0 0 0 1px var(--tm-rule); border-radius: 10px; padding: .9em 2.2em .9em 1.1em;
  max-height: 55vh; overflow-y: auto;
  animation: tm-rise .3s ease both;
}

.tm-note {
  position: absolute; left: 0; right: 0; top: 0; z-index: 1;
  padding: .1em 1.7em .15em .9em;
  border-left: 2px solid hsl(var(--tm-h) 60% var(--tm-note-l) / .55);
  border-radius: 0 6px 6px 0;
  color: color-mix(in srgb, var(--tm-ink) 78%, var(--tm-paper));
  transition: background-color .2s;
  animation: tm-arrive .5s ease both;
  cursor: default;
}
.tm-note.tm-placed { transition: transform .28s cubic-bezier(.2,.8,.2,1), background-color .2s; }
.tm-note.tm-lost, .tm-note.tm-behind { display: none; }
.tm-body { margin: 0; white-space: pre-wrap; overflow-wrap: break-word; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--tm-lines, none); }
.tm-voice { font-weight: 600; font-size: .86em; letter-spacing: .09em; text-transform: uppercase; margin-right: .8em; color: hsl(var(--tm-h) 45% var(--tm-note-l)); }
.tm-threaded .tm-say::after { content: " ↩"; color: var(--tm-faint); }
.tm-thread, .tm-answer { display: none; }
/* Read in full: laid over the notes below, never pushing them. */
.tm-note:hover, .tm-note.tm-active, .tm-tray .tm-note {
  z-index: 3; background: hsl(var(--tm-h) 55% var(--tm-note-bg-l)); color: var(--tm-ink);
  border-left-color: hsl(var(--tm-h) 60% var(--tm-note-l));
  box-shadow: 0 4px 18px rgb(0 0 0 / .08);
}
.tm-note.tm-active { z-index: 4; }
.tm-note:hover .tm-body, .tm-note.tm-active .tm-body, .tm-tray .tm-body { -webkit-line-clamp: none; }
.tm-note:hover .tm-thread, .tm-note.tm-active .tm-thread, .tm-tray .tm-thread { display: block; max-height: 40vh; overflow-y: auto; }
.tm-note.tm-active .tm-answer { display: block; }
.tm-turn { margin-top: .5em; white-space: pre-wrap; overflow-wrap: break-word; }
.tm-turn.tm-me { color: var(--tm-faint); padding-left: .9em; border-left: 1px solid var(--tm-rule); }
.tm-answer {
  width: 100%; margin-top: .6em; padding: .25em 0; border: 0; border-bottom: 1px solid var(--tm-rule);
  background: none; color: var(--tm-ink); font: inherit; outline: none;
}
.tm-answer::placeholder { color: var(--tm-faint); }
.tm-x, .tm-more {
  position: absolute; top: .1em; right: .25em; height: 1.5em; border: 0; background: none; color: var(--tm-faint);
  font: inherit; line-height: 1; cursor: pointer; border-radius: 4px; padding: 0 .2em;
}
.tm-x { opacity: 0; }
/* Several notes on one line take turns; the count says so and a click brings the next. */
.tm-more { font-size: .82em; font-variant-numeric: tabular-nums; }
.tm-note:hover .tm-more, .tm-note.tm-active .tm-more { right: 1.7em; }
.tm-note:has(.tm-more) { padding-right: 3em; }
.tm-note:hover .tm-x, .tm-note.tm-active .tm-x, .tm-tray .tm-x { opacity: 1; }
.tm-x:hover, .tm-more:hover { color: var(--tm-ink); }

/* How far along the next note is. */
.tm-energy { position: absolute; left: 1.2em; bottom: .9em; width: 4.5em; height: 3px; border-radius: 3px; background: color-mix(in srgb, var(--tm-ink) 10%, transparent); overflow: hidden; pointer-events: none; }
.tm-narrow .tm-energy { bottom: auto; top: .8em; left: auto; right: 1.2em; }
.tm-energy-fill { height: 100%; width: 0; border-radius: 3px; background: color-mix(in srgb, var(--tm-ink) 38%, transparent); transition: width .25s ease; }
.tm-energy.tm-pulse { animation: tm-pulse .6s ease-out; }
@keyframes tm-pulse { 0% { transform: scaleY(1); } 30% { transform: scaleY(2.6); } 100% { transform: scaleY(1); } }

@keyframes tm-arrive { from { opacity: 0; translate: .6em 0; } }
@keyframes tm-rise { from { opacity: 0; translate: 0 .4em; } }
@keyframes tm-breathe { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .tm-root * { animation: none !important; transition: none !important; } }
`
