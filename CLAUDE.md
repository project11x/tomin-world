# tomin.world

- **Feature-Inventar:** [docs/FEATURES.md](docs/FEATURES.md) ist die maßgebliche Übersicht über alles, was die Seite kann. **Bei jedem `feat`- oder `fix`-Commit die betroffene Zeile dort aktualisieren** (Neues eintragen, Entferntes streichen, `Stand:`-Zeile im Kopf anpassen). Neue Oberflächen/Endpoints bekommen dort eine Zeile inkl. Smoke-Check.
- Design-System: [DESIGN.md](DESIGN.md) · Infra-Setup: [WORKER_SETUP.md](WORKER_SETUP.md)
- Dynamische GET-Endpoints folgen der Edge-Cache-Konvention (`caches.default`, Key mit `BUILD_ID`) — siehe FEATURES.md §5.

## Arbeitsweise

- **Eddie committet und deployt nie selbst — das macht immer die AI.** Fertige Änderungen committen (und vorher fragen, bevor gepusht/deployt wird). Nichts Wichtiges darf nur im Working Tree liegen: ein Push auf `main` deployt per GitHub Actions den Stand von `main` und würde uncommittete Fixes auf der Live-Seite wieder überschreiben.
- **Deploy-Weg:** `publish.sh` (Schritt 9) und `.github/workflows/deploy.yml` rufen beide `npm run deploy` auf. Das wendet zuerst alle offenen D1-Migrationen remote an (`npm run migrate`) und deployt dann den Worker. Neue Migrationen in `migrations/` also nur so schreiben, dass sie vor dem neuen Code laufen dürfen (Spalten/Tabellen ergänzen, nichts entfernen, was der alte Code noch nutzt).

## Offene Punkte (Stand 2026-11-21)

- Worker-Secret `IP_HASH_SECRET` ist gesetzt (2026-11-21) und darf nicht neu gesetzt werden, sonst greifen die laufenden Rate-Limits (Pins 24 h, Votes Woche, Passport) einmalig nicht.
- **GitHub-Deploy ist rot, bis der Token „D1: Edit“ hat:** Dem GitHub-Secret `CLOUDFLARE_API_TOKEN` fehlt das D1-Recht, deshalb bricht `.github/workflows/deploy.yml` bei `npm run migrate` ab (Fehler 7403, bestätigt am 2026-11-21) — *bevor* deployt wird, die Live-Seite bleibt also unverändert. Bis das behoben ist, nach jedem Code-Push lokal `npm run deploy` ausführen (der lokale `wrangler login` hat D1-Rechte); `publish.sh` macht das ohnehin. Behebung: im Cloudflare-Dashboard unter My Profile → API credentials → API tokens den Token um „Account → D1 → Edit“ erweitern. Der GitHub-Token ist der Eintrag **„Edit Cloudflare Workers“, dessen „Last used“ zu den Actions-Läufen passt** (es gibt zwei gleichnamige; der andere wurde nie benutzt). Bearbeiten ändert den Token-Wert nicht, das GitHub-Secret bleibt gültig.
- **CI (`ci.yml`) ist rot, unabhängig davon:** `ubuntu-latest` ist jetzt Ubuntu 26.04, darauf installiert Playwright 1.59 kein Chromium. Fix: `runs-on: ubuntu-24.04` oder Playwright aktualisieren.
- Live ist der Stand vom 2026-11-21 (Commit `4d60236`, lokal deployt, Version `334f1fd5`): Security-Fixes + docs/-Ausschluss.
