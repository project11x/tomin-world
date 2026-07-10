# tomin.world

- **Feature-Inventar:** [docs/FEATURES.md](docs/FEATURES.md) ist die maßgebliche Übersicht über alles, was die Seite kann. **Bei jedem `feat`- oder `fix`-Commit die betroffene Zeile dort aktualisieren** (Neues eintragen, Entferntes streichen, `Stand:`-Zeile im Kopf anpassen). Neue Oberflächen/Endpoints bekommen dort eine Zeile inkl. Smoke-Check.
- Design-System: [DESIGN.md](DESIGN.md) · Infra-Setup: [WORKER_SETUP.md](WORKER_SETUP.md)
- Dynamische GET-Endpoints folgen der Edge-Cache-Konvention (`caches.default`, Key mit `BUILD_ID`) — siehe FEATURES.md §5.
