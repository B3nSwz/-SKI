# $SKI 🐶🎿

Handy-App (installierbare Web-App / PWA) zum Bearbeiten von Fotos:
Den Hundekopf mit Sturmhaube beliebig oft in eigene Bilder einfügen.

## Funktionen

- **Sprachauswahl** beim ersten Öffnen – die 10 meistgesprochenen Sprachen der Welt
  (Englisch, Chinesisch, Hindi, Spanisch, Französisch, Arabisch, Bengalisch, Portugiesisch,
  Russisch, Urdu). Standard ist Englisch; über 🌐 jederzeit änderbar. Texte stehen in `i18n.js`.
- **Choose photo** (Foto wählen) – Bild aus der Galerie oder direkt mit der Kamera aufnehmen
- **+ Kopf** – Hundekopf einfügen (beliebig oft)
- **Verschieben** – Kopf antippen und mit einem Finger ziehen
- **Größe** – per Regler (5–200 %) oder mit zwei Fingern zoomen
- **Drehung** – per Regler nach links/rechts (−180° bis +180°, rastet bei 0° ein) oder mit zwei Fingern drehen
- **⇋ Spiegeln** – Kopf horizontal spiegeln
- **⧉ Duplizieren**, **⬆︎ Nach vorne** (Ebene), **🗑 Löschen**
- **Speichern** – fertiges Bild in voller Auflösung als JPG; auf dem Handy öffnet sich
  das Teilen-Menü („Bild sichern“ / „In Galerie speichern“)
- **📲 Install app** – auf Android (Chrome, Edge, Samsung Internet) öffnet sich direkt der
  Installationsdialog; auf iPhone/iPad (Apple erlaubt keine Installation per Knopfdruck)
  und in anderen Browsern erscheint eine bebilderte Schritt-für-Schritt-Anleitung.
  Ist die App bereits installiert, wird der Button ausgeblendet.
- Funktioniert offline, alle Bilder bleiben auf dem Gerät (kein Upload auf einen Server)

Am Desktop: Mausrad = Größe, Shift + Mausrad = Drehung, Entf = Löschen.

## Auf dem Handy nutzen

Die App muss über HTTPS erreichbar sein, z. B. über **GitHub Pages**:

1. Im Repository unter **Settings → Pages → Build and deployment → Source** „**GitHub Actions**“ wählen.
2. Den Workflow „Deploy to GitHub Pages“ laufen lassen (startet automatisch bei jedem Push
   oder manuell unter **Actions**).
3. Die angezeigte Adresse (`https://<benutzer>.github.io/<repo>/`) auf dem Handy öffnen.
4. Als App installieren:
   - **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“
   - **Android (Chrome):** Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“

Lokal testen: `python3 -m http.server 8000` im Projektordner und `http://localhost:8000` öffnen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css`, `app.js` | Die App |
| `i18n.js` | Übersetzungen (10 Sprachen) |
| `assets/head.png` | Freigestellter Hundekopf (transparenter Hintergrund) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installation als App & Offline-Betrieb |

Der Kopf kann durch eine andere PNG-Datei mit transparentem Hintergrund ersetzt werden
(gleicher Dateiname `assets/head.png`; danach in `sw.js` die Cache-Version erhöhen).
