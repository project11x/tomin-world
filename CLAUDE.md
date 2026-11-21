# tomin.world

- **Feature-Inventar:** [docs/FEATURES.md](docs/FEATURES.md) ist die maßgebliche Übersicht über alles, was die Seite kann. **Bei jedem `feat`- oder `fix`-Commit die betroffene Zeile dort aktualisieren** (Neues eintragen, Entferntes streichen, `Stand:`-Zeile im Kopf anpassen). Neue Oberflächen/Endpoints bekommen dort eine Zeile inkl. Smoke-Check.
- Design-System: [DESIGN.md](DESIGN.md) · Infra-Setup: [WORKER_SETUP.md](WORKER_SETUP.md)
- Dynamische GET-Endpoints folgen der Edge-Cache-Konvention (`caches.default`, Key mit `BUILD_ID`) — siehe FEATURES.md §5.

## Arbeitsweise

- **Eddie committet und deployt nie selbst — das macht immer die AI.** Fertige Änderungen committen (und vorher fragen, bevor gepusht/deployt wird). Nichts Wichtiges darf nur im Working Tree liegen: ein Push auf `main` deployt per GitHub Actions den Stand von `main` und würde uncommittete Fixes auf der Live-Seite wieder überschreiben.
- **Deploy-Weg:** `publish.sh` (Schritt 9) und `.github/workflows/deploy.yml` rufen beide `npm run deploy` auf. Das wendet zuerst alle offenen D1-Migrationen remote an (`npm run migrate`) und deployt dann den Worker. Neue Migrationen in `migrations/` also nur so schreiben, dass sie vor dem neuen Code laufen dürfen (Spalten/Tabellen ergänzen, nichts entfernen, was der alte Code noch nutzt).

## Offene Punkte (Stand 2026-11-21)

- Worker-Secret `IP_HASH_SECRET` ist gesetzt (2026-11-21) und darf nicht neu gesetzt werden, sonst greifen die laufenden Rate-Limits (Pins 24 h, Votes Woche, Passport) einmalig nicht.
- Der GitHub-Deploy läuft wieder grün (seit 2026-11-21): Das GitHub-Secret `CLOUDFLARE_API_TOKEN` ist der API-Token **„Edit Cloudflare Workers“** (der mit passendem „Last used“; ein gleichnamiger zweiter wurde nie benutzt) und hat jetzt auch D1 Read + Edit. Braucht der Deploy künftig ein weiteres Cloudflare-Produkt, muss dieser Token erweitert werden — sonst bricht Actions mit Fehler 7403 ab.
- CI (`ci.yml`) läuft auf `ubuntu-24.04` statt `ubuntu-latest`, weil Playwright 1.59 auf Ubuntu 26.04 kein Chromium installieren kann (2026-11-21). Zurück auf `ubuntu-latest`, sobald Playwright aktualisiert ist und 26.04 unterstützt.
