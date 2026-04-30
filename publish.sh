#!/bin/bash

# Farben für bessere Lesbarkeit
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

clear
echo -e "${BLUE}========================================"
echo -e "   PORTFOLIO UPLOAD ASSISTENT 🚀"
echo -e "========================================${NC}"

# SCHRITT 0: Vorbereitung
echo -e "${YELLOW}SCHRITT 0: Lokale Vorbereitung${NC}"
echo -e "Hast du bereits einen neuen Ordner auf deiner Festplatte erstellt"
echo -e "(z.B. '/Volumes/T7/tomin.world/MeinProjekt') und deine Videos/Bilder hineingepackt?"
echo ""
read -p "Ist die lokale Vorbereitung fertig? (y/n): " PREP_DONE

if [ "$PREP_DONE" != "y" ]; then
    echo -e "\n${BLUE}Anleitung:${NC}"
    echo -e "1. Erstelle einen neuen Ordner hier im Verzeichnis."
    echo -e "2. Benenne ihn nach deinem Projekt (keine Sonderzeichen/Leerzeichen empfohlen)."
    echo -e "3. Kopiere deine Original-Videos und Bilder hinein."
    echo -e "4. Starte dieses Skript dann einfach nochmal."
    exit 0
fi

# SCHRITT 1: Komprimieren
echo -e "\n${YELLOW}SCHRITT 1: Videos optimieren${NC}"
echo -e "Dieser Schritt erstellt '_web.mp4' Versionen für eine flüssige Wiedergabe."
read -p "Soll 'npm run compress' jetzt ausgeführt werden? (y/n): " RUN_COMPRESS
if [ "$RUN_COMPRESS" = "y" ]; then
    npm run compress
fi

# SCHRITT 2: Synchronisieren
echo -e "\n${YELLOW}SCHRITT 2: Katalog aktualisieren${NC}"
echo -e "Jetzt wird die 'data.js' mit den neuen Infos gefüttert..."
npm run sync
echo -e "${GREEN}✅ data.js wurde aktualisiert.${NC}"

# SCHRITT 3: R2 Upload
echo -e "\n${BLUE}========================================"
echo -e "${YELLOW}SCHRITT 3: MANUELLER UPLOAD (CLOUDFLARE R2)${NC}"
echo -e "1. Öffne das Cloudflare Dashboard -> R2."
echo -e "2. Wähle deinen Portfolio-Bucket."
echo -e "3. Ziehe deinen neuen Projektordner per Drag & Drop hinein."
echo -e "   (WICHTIG: Der Ordnername im Bucket muss exakt wie lokal sein!)"
echo -e "========================================${NC}"
read -p "Ist der Upload zu R2 abgeschlossen? (y/n): " R2_DONE

if [ "$R2_DONE" != "y" ]; then
    echo -e "${RED}Bitte erst den R2 Upload machen, bevor wir die Webseite live schalten.${NC}"
    exit 1
fi

# SCHRITT 4: Git Push
echo -e "\n${YELLOW}SCHRITT 4: Veröffentlichen${NC}"
echo -e "Jetzt wird die aktualisierte 'data.js' zu GitHub geschickt."
read -p "Soll das Projekt jetzt live gehen? (y/n): " GIT_PUSH

if [ "$GIT_PUSH" = "y" ]; then
    git add data.js
    # Sicherheitshalber wichtige Kerndateien mitnehmen
    git add index.html styles.css app.js admin.js 2>/dev/null || true
    git commit -m "Neues Projekt veröffentlicht via Assistent"
    git push
    echo -e "\n${GREEN}🔥🔥🔥 ERFOLG! Deine Seite ist in ca. 1 Minute live.${NC}"
else
    echo -e "\n${BLUE}Info: Deine Daten sind lokal gespeichert, aber noch nicht live.${NC}"
fi
