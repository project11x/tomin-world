# tomin.world / shouli.de — Feature-Inventar

> **Zweck:** Der komplette Überblick, was die Seite kann — als Referenz fürs Bug-Testen,
> für neue Features und um nichts zu vergessen.
>
> **Pflege:** Bei jedem `feat`/`fix`-Commit die betroffene Zeile hier mitziehen
> (Neues eintragen, Entferntes streichen). Die Smoke-Checkliste unten ist die
> Kurzfassung zum Durchklicken nach einem Deploy.
>
> **Stand:** 2026-07-10 · Commit `d535edd`

---

## 1. Architektur in 5 Zeilen

- **Hosting:** Ein Cloudflare Worker (`tomin-world`, [src/worker.js](../src/worker.js)) bedient `shouli.de`, `www.shouli.de` und `tomin.world`. `/api/*` geht an Endpoint-Module, alles andere kommt als Static Asset aus `dist/` (SPA-Fallback). Medien-Dateien bekommen `Cache-Control: immutable` (URLs sind via `?v=<mtime>` versioniert).
- **Daten:** Portfolio-Medien liegen als Ordner im Repo-Root (`debut`, `milano`, `5am in munich`, …). `sync.cjs` generiert daraus [data.js](../data.js) (`portfolioData`). Nach dem Boot merged [portfolio-sync.js](../src/utils/portfolio-sync.js) live Neues aus `/api/portfolio` (R2-Listing) dazu.
- **Persistenz:** D1 (Pinboard, Weekly Vote, Passport-Codes — siehe [migrations/](../migrations)), R2 (Portfolio-Medien + Game-Assets unter `game/`), localStorage (aller Journal-/Engagement-State clientseitig).
- **Medien-Auslieferung:** Bilder über Cloudflare Image Transforms (`media.shouli.de`), Videos über Cloudflare Stream (HLS).
- **Auth:** Admin-Aktionen sind über Cloudflare Access geschützt — das `CF_Authorization`-JWT wird serverseitig gegen die Team-JWKS verifiziert ([src/api/access.js](../src/api/access.js)).

---

## 2. Oberflächen (Shells / Themes)

Die Seite hat **fünf Shells**. Auswahl über Theme-Picker; `theme-pink` (Fiona) ist versteckt und wird still auf Aero zurückgestuft.

### 2.1 Aero-Desktop (Default, ≥768px) — macOS-Metapher

| Feature | Was es tut | Code |
|---|---|---|
| Intro-Sequenz | Einmal pro Browser-Session choreografieren sich Menüleiste, Dock und Icons beim Boot ein ("Login-Moment") | [intro.js](../src/desktop/intro.js) |
| Menüleiste / System Bar | Uhr, Menüs (u.a. "Hide Dock") | [system-bar.js](../src/desktop/system-bar.js) |
| Dock | Magnification mit Cosinus-Falloff zur Cursor-Distanz, Pressed-States, ein-/ausblendbar | [dock-magnify.js](../src/desktop/dock-magnify.js) |
| Desktop-Icons | Data-driven aus `portfolioData`, Auswahl per Klick, Öffnen per Doppelklick | [desktop-icons.js](../src/desktop/desktop-icons.js) |
| Finder-Fenster | Drag, Fullscreen (grüner Button, animiert), Grid-/Listen-Ansicht, Favoriten-Sidebar, gecachte Ordner-Views (Thumbnails laden bei Revisit nicht neu), mehrere Fenster parallel, NEW-Tag auf neuen Items | [windows.js](../src/desktop/windows.js) |
| Kontextmenü | Rechtsklick auf Desktop-Icons und Finder-Items | [context-menu.js](../src/desktop/context-menu.js) |
| Quick Look | Vorschau-Modal für Bild/Video aus dem Finder | [quick-look.js](../src/desktop/quick-look.js) |
| Spaces | 3-Space-Band: Edits (−1) \| Desktop (0) \| Magazine (+1), alle Panels sliden simultan; interaktiver Edge-Swipe | [spaces.js](../src/desktop/spaces.js) |
| Magazine-Reader | Vollbild-Reader im Magazine-Space | [spaces.js](../src/desktop/spaces.js) |
| Edits-Viewer | Vollbild-Reel aller Kurzvideos, mit Ambilight + Smart Layout, BTS-Poster | [edits-viewer.js](../src/desktop/edits-viewer.js) |
| About-/Contact-Modal | Über den Dock-Kontakt-Button, Chrome passend zu Finder-Fenstern | [windows.js](../src/desktop/windows.js) |
| Hell/Dunkel-Toggle | Weicher Farbübergang beim Umschalten | app.js / index.html |
| Changelog-Widget | iOS-Style "grow from widget"-Overlay, Daten aus `/api/commits` | [changelog.js](../changelog.js) |
| URL-Router | `/projects/<folder>` ↔ offene Fenster, `?also=a,b` für Hintergrund-Fenster; Deep-Links funktionieren | [router.js](../src/utils/router.js) |
| Share | Native Share-Sheet auf Mobile, Clipboard+Toast auf Desktop | [share.js](../src/utils/share.js) |

### 2.2 iOS-Shell (Mobile-Default)

| Feature | Was es tut | Code |
|---|---|---|
| Homescreen + Dock | App-Icons mit roten Badges (Items der letzten 90 Tage) | [ios/index.js](../src/ios/index.js), [ios/badges.js](../src/ios/badges.js) |
| Apps | Magazines, Edits, BTS, Contact (mit Push-Toggle), Journal | [ios/index.js](../src/ios/index.js) |
| Edge-Swipe-Back | Interaktive Zurück-Geste, Screen folgt dem Finger 1:1, Parent parallaxt dahinter | [edge-swipe.js](../src/ios/edge-swipe.js) |
| Rotation-Lock | Counter-Rotation hält die PWA optisch in Portrait (iOS ignoriert Manifest-Orientation) | [rotation-lock.js](../src/ios/rotation-lock.js) |
| Smart Stack | Gesten-Karussell (Infinite Loop) mit Live Activities: Zeit & Wetter Berlin, Portfolio-Timeline (visit-order-aware) | [smart-stack.js](../src/widgets/smart-stack.js), [weather.js](../src/widgets/weather.js), [portfolio-timeline.js](../src/widgets/portfolio-timeline.js) |
| Widget-Morph | FLIP-Expand/Collapse — geteilte Inhalte gleiten zwischen Kompakt- und Groß-Layout, Drag-to-dismiss | [changelog.js](../changelog.js) |
| App-Icon-Picker | Alternative Icons (MugEddie, "fuck instagram") inkl. passender PWA-Manifeste, Wahl in localStorage | public/manifest-*.json |
| Theme-Picker | schaltet u.a. `html.ios-dark` | app.js |

### 2.3 Material-3-Shell (`theme-material`)

| Feature | Was es tut | Code |
|---|---|---|
| Mobile: Bottom-Nav-Tabs | Home/Edits/Magazines/… mit per-Tab Scroll-Memory | [android/tabs.js](../src/android/tabs.js) |
| Home-Widgets | Zeit & Wetter, Portfolio, Changelog (Daten von den iOS-Modulen) | [android/widgets.js](../src/android/widgets.js) |
| Ripple | M3-State-Layer ab Touch-Punkt, delegiert (auch dynamische Items) | [android/ripple.js](../src/android/ripple.js) |
| Badges + NEU-Pills | Rote Pills auf Nav/Rail + NEU-Pills auf Listen-Items (30-Tage-Fenster, BTS bewusst ausgenommen) | [android/badges.js](../src/android/badges.js) |
| Magazines-Reader | Vollbild, vertikaler Scroll-Snap, schwebender Seiten-Indikator | [magazines-reader.js](../src/android/magazines-reader.js) |
| Edits-Viewer | Vollbild mit M3 Top App Bar + Video-Stage + Controls | [android/edits-viewer.js](../src/android/edits-viewer.js) |
| BTS-Viewer | Swipebare Vollbild-Galerie (nutzt Reader-Chrome) | [android/bts-viewer.js](../src/android/bts-viewer.js) |
| Desktop-Variante | Rail + List + Detail statt macOS-Desktop, wenn `theme-material` auf Desktop aktiv | [m3-shell.js](../src/desktop/m3-shell.js) |

### 2.4 TUI-Shell (`theme-tui`, ≥768px)

Interaktives Terminal-REPL als komplette Alternative zum Desktop — [tui-shell.js](../src/desktop/tui-shell.js). (Verknüpft mit dem Secret-Stamp "Terminal".)

### 2.5 Wii-Shell (`theme-wii`) — pointer-free

| Feature | Was es tut | Code |
|---|---|---|
| Channel-Grid | Wii-Menü-Kacheln + Apple-TV-Fokus; Öffnen fliegt die Kachel per Shared-Element-Transition in die Coverflow-Mitte | [wii-shell.js](../src/desktop/wii-shell.js) |
| Magazin-Kachel | Eigene "fanned cover"-Darstellung für den Magazin-Index | [wii-shell.js](../src/desktop/wii-shell.js) |
| Gamepad-Support | Gamepad-API-Polling → D-Pad/Stick werden zu Fokus-Navigation; TV-Fernbedienungen laufen über die Keyboard-Handler | [wii-gamepad.js](../src/desktop/wii-gamepad.js) |
| Auto-Detect | Erkennt Controller-/TV-Besucher und bietet (nie silent!) einen per A/B bzw. Enter/Esc bedienbaren Umschalt-Prompt an | [wii-detect.js](../src/desktop/wii-detect.js) |

Offene Roadmap (siehe Memory/Planung): Touch-Bedienung, Sound.

---

## 3. Journal — der Engagement-Layer (Desktop + iOS)

Zentrale App für alles Spielerische. State liegt komplett in localStorage; Module kommunizieren über Custom Events (`journal:stamps-changed`, `journal:game-opened`, …).

| Feature | Was es tut | Code |
|---|---|---|
| Rings | Apple-Watch-artige Tagesziele | [journal-rings.js](../src/desktop/journal-rings.js) |
| Hero-Cards | Fortschritts-Karten (Today/Sidebar), `--hero-progress` färbt Burgund über Grau | [journal-hero-cards.js](../src/desktop/journal-hero-cards.js) |
| Stamps | **24 Stück**: 14 Travel (eins pro Portfolio-Ordner, beim Öffnen verdient) · 6 Skill (Schwellen wie "Frame Master", "First Try") · 4 Secret (5am Club, Konami, Terminal, Vollmond). Idempotente Auswertung | [journal-stamps.js](../src/desktop/journal-stamps.js) |
| Celebration-Toasts | Feiern nur Skill- + Secret-Stamps und das 4/4-explored-Finale | [journal-celebration.js](../src/desktop/journal-celebration.js) |
| Passport | Alle 24 Stamps nach Art gruppiert, locked/earned, generierte SVG-Stamps | [journal-passport.js](../src/desktop/journal-passport.js), [journal-stamp-svg.js](../src/desktop/journal-stamp-svg.js) |
| Passport-Code | Opt-in Cross-Device-Sync: 6-stelliger Code ↔ JSON-Blob in D1 (alle Journal-Keys) | [journal-passport-code.js](../src/desktop/journal-passport-code.js), [api/passport.js](../src/api/passport.js) |
| Board | Kork-Pinnwand — Besucher pinnen Items (mit Sticker), gespeist aus `/api/pinboard` | [journal-board.js](../src/desktop/journal-board.js), [api/pin.js](../src/api/pin.js) |
| Weekly Vote | Wochen-Matchup, eine Stimme pro Besucher, dann Tally-Anzeige | [journal-vote.js](../src/desktop/journal-vote.js), [api/vote.js](../src/api/vote.js) |
| Insights | Activity-Kalender + persönliche Stats + Game-Bestleistungen | [journal-insights.js](../src/desktop/journal-insights.js) |
| iOS-Spiegel | Gleiche App im iOS-Shell | [ios/journal-app.js](../src/ios/journal-app.js) |

### 3.1 Games (Play-Tab, 6 Stück live)

| Spiel | Prinzip | Code |
|---|---|---|
| Daily Frame | Edit anhand eines Frames erraten — tägliches Puzzle aus `/api/daily-frame`; auch standalone unter [daily-frame.html](../daily-frame.html) (läuft im Journal als iframe) | [games/daily-frame.js](../src/desktop/games/daily-frame.js) |
| Connect | 16 Frames in 4 Edits gruppieren | [games/connect.js](../src/desktop/games/connect.js) |
| Order the Edit | Frames chronologisch ordnen | [games/order-the-edit.js](../src/desktop/games/order-the-edit.js) |
| Higher or Lower | Welcher Edit rankt höher? | [games/higher-or-lower.js](../src/desktop/games/higher-or-lower.js) |
| Silent Clip | Stummer S/W-Clip — Edit benennen | [games/silent-clip.js](../src/desktop/games/silent-clip.js) |
| Dominant Color | Palette dem Edit zuordnen | [games/dominant-color.js](../src/desktop/games/dominant-color.js) |

Game-Assets (Frames, Clips, Farben) werden per `extract-frames/clips/colors.cjs` erzeugt, liegen auf R2 unter `game/` ([game-asset-url.js](../src/utils/game-asset-url.js)) und werden über [admin-frames.html](../admin-frames.html) freigegeben (`frames-pool.json`, nur approved Einträge kommen ins Daily Frame).

---

## 4. Medien-Pipeline

| Feature | Was es tut | Code |
|---|---|---|
| Image Transforms | Bilder laufen über `media.shouli.de` (Cloudflare Image Resizing), mobile srcset | [media.js](../src/utils/media.js) |
| Cloudflare Stream | Alle 21 Portfolio-Videos als HLS: `stream-map.json` mappt src → Manifest+Poster; nativ auf Safari/iOS, sonst hls.js. Tuning: connection-aware ABR-Start (~5 Mbps), kein Player-Size-Cap, Clips <5s umgehen HLS | [stream.js](../src/utils/stream.js), public/stream-map.js |
| Buffered Playback | Wartet auf genug Puffer, pausiert bei Buffer-Mangel, Beachball-Loader, nur ein aktives Video gleichzeitig | [video.js](../src/utils/video.js) |
| Poster + Farben | Poster-Frames + dominante Farben für Video-Grid-Tiles (aus der Game-Asset-Pipeline wiederverwendet) | [edit-posters.js](../src/utils/edit-posters.js) |
| Recency | 30-Tage-Fenster für NEW-Tags/Badges/NEU-Pills, eine Quelle für alle Shells | [recency.js](../src/utils/recency.js) |
| Motion-Tokens | 4 benannte Easing-Kurven für alle Animationen (statt Ad-hoc-Beziers) | [motion.js](../src/utils/motion.js) |
| Icons | Material-Symbols-Markup → Bootstrap Icons zur Laufzeit, `setIcon` für dynamische Swaps | [icons.js](../src/utils/icons.js) |

---

## 5. Worker & APIs

Alle dynamischen GET-Endpoints folgen der Edge-Cache-Konvention: `caches.default`, Key enthält `BUILD_ID` (pro Deploy neu) → Cache-Bust bei jedem Deploy.

| Route | Methoden | Zweck | Auth |
|---|---|---|---|
| `/api/portfolio` | GET | Live-R2-Listing des Portfolios | — (edge-cached) |
| `/api/status` | PUT | Admin setzt Status-Text (committet `public/status.json` via GitHub) | CF Access JWT |
| `/api/commits` | GET | Gecachter GitHub-Commits-Proxy fürs Changelog-Widget (schont das 60/h-Limit) | — |
| `/api/daily-frame` | GET | Tages-Puzzle aus `frames-pool.json` (nur approved) | — (edge-cached) |
| `/api/pinboard` | GET | Neueste nicht versteckte Pins aus D1 | — |
| `/api/pin` | POST (+Admin-Aktionen) | Pin anlegen; Moderation | Admin-Aktionen: CF Access JWT |
| `/api/vote` | GET/POST (+Admin) | Wochen-Matchup lesen / Stimme abgeben | Admin-Aktionen: CF Access JWT |
| `/api/passport` | GET/POST | Journal-State per 6-stelligem Code lesen/schreiben (D1) | — |

Sicherheits-Notizen: `workers_dev`/`preview_urls` sind aus (kein Access-Bypass über workers.dev); Header-Bypass auf `/api/status` wurde 2026-06 gehärtet, Tokens rotiert.

---

## 6. Admin

Alles hinter Cloudflare Access. Kein Secret im Frontend (per Test abgesichert: kein PAT-Feld in admin.html).

| Seite | Zweck |
|---|---|
| [admin.html](../admin.html) | Haupt-Panel (u.a. Status setzen) |
| [admin-pins.html](../admin-pins.html) | Pinboard-Moderation (verstecken/löschen) |
| [admin-frames.html](../admin-frames.html) | Daily-Frame-Pool kuratieren (approve) |
| Admin-Chooser | Versteckt: **Cmd/Ctrl+Shift+A** öffnet schwebenden Chooser mit Links zu allen Admin-Seiten ([admin-chooser.js](../src/utils/admin-chooser.js)) |

---

## 7. PWA & Push

- **Manifeste:** `manifest.json` + Alternativen `manifest-eddie.json` / `manifest-instagram.json` (passend zum App-Icon-Picker).
- **Push:** OneSignal, SDK wird lazy erst bei Bedarf geladen (nicht auf jeder Page) — Toggle sitzt in der iOS-Contact-App ([push.js](../push.js), `public/OneSignalSDKWorker.js`).
- **Status:** `public/status.json` — vom Admin gesetzter Status, angezeigt im Zeit/Wetter-Widget.

---

## 8. Build, Deploy & Tooling

| Script/Datei | Zweck |
|---|---|
| `npm run sync` / `watch` | Medien-Ordner → [data.js](../data.js) generieren (`?v=<mtime>`-Versionierung) |
| `npm run compress` | Medien komprimieren ([compress.sh](../compress.sh)) |
| `npm run extract-frames/clips/colors` | Game-Assets erzeugen |
| `npm run migrate-game-assets` | Game-Assets nach R2 |
| `npm run migrate-videos` | Neue Videos nach Cloudflare Stream (Teil des Publish-Flows) |
| `npm run build` | Tailwind → sync → Vite (inkl. [Prerender-Plugin](../vite-plugin-prerender.js)) → AppleDouble-Cleanup |
| `npm run deploy` | Build + `wrangler deploy` mit frischer `BUILD_ID` (Edge-Cache-Bust) |
| `npm run lint` / `typecheck` / `format` | ESLint, tsc über jsconfig, Prettier |
| CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) | Lint + Typecheck + Playwright (animierte Tests mit 2 Retries) |
| Deploy ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) | Auto-Deploy zu Workers |
| [DESIGN.md](../DESIGN.md) | Design-System ("The Digital Curator": No-Line-Rule, Glass, Typo) |
| [WORKER_SETUP.md](../WORKER_SETUP.md) | Worker-/Infra-Setup |

---

## 9. Tests (Playwright — `npm test`)

- **[desktop.spec.js](../tests/desktop.spec.js):** Boot ohne Fehler, Portfolio-Daten geladen, Theme-Toggle, Icon-Doppelklick öffnet Finder, Hide Dock.
- **[mobile.spec.js](../tests/mobile.spec.js):** iOS-Screen sichtbar, Dock-Items, Magazines/Edits/Contact/BTS öffnen.
- **[flows.spec.js](../tests/flows.spec.js):** Finder Grid↔List, Sidebar-Navigation, Icon-Select+Open, Contact-Modal, mehrere Fenster; Mobile: App öffnen/schließen, Theme-Picker, Icon-Picker; Admin: Panel rendert, kein PAT-Feld.

**Bekannte Lücken (Stand heute):** Journal/Games, Wii-Shell, TUI-Shell, M3-Shell und die APIs haben noch keine automatisierten Tests → dafür die Checkliste unten.

---

## 10. Manuelle Smoke-Checkliste (nach jedem Deploy)

**Desktop (Aero):**
- [ ] Boot: Intro läuft, keine Console-Errors
- [ ] Ordner-Doppelklick → Finder öffnet, Grid↔List, Quick Look auf Bild + Video
- [ ] Edits-Space: Video spielt (HLS), Ambilight an, kurze Clips (<5s) starten sofort
- [ ] Magazine-Space: Reader blättert
- [ ] Hell/Dunkel-Toggle, Theme-Wechsel Aero↔Material↔TUI↔Wii
- [ ] Deep-Link `/projects/<folder>` direkt aufrufen
- [ ] Changelog-Widget öffnet und zeigt Commits

**Mobile (iOS-Shell):**
- [ ] Alle 5 Apps öffnen/schließen (inkl. Edge-Swipe-Back)
- [ ] Smart Stack rotiert, Wetter lädt
- [ ] Badges plausibel (nur neue Items)
- [ ] Gerät drehen → Layout bleibt portrait

**Journal:**
- [ ] Ordner öffnen → Travel-Stamp + ggf. Toast
- [ ] Jedes der 6 Games einmal starten
- [ ] Pin anlegen → erscheint auf dem Board
- [ ] Vote abgeben → Tally erscheint, zweite Stimme geblockt
- [ ] Passport-Code erzeugen → auf zweitem Gerät/Browser einlösen

**Wii:**
- [ ] Pfeiltasten navigieren das Grid, Enter öffnet Channel (Coverflow-Flug)
- [ ] Controller anschließen → Umschalt-Prompt erscheint, per A-Knopf bestätigbar

**Admin/API:**
- [ ] `Cmd+Shift+A` → Chooser; Admin-Seiten nur mit Access erreichbar
- [ ] `/api/status` ohne Access-Cookie → abgelehnt
- [ ] Nach Deploy: `/api/portfolio` liefert frische Daten (BUILD_ID-Bust greift)
