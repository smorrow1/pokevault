# PokéVault — Projektkontext für Claude Code

> Diese Datei wird von Claude Code beim Start automatisch gelesen. Sie enthält den
> gesamten Kontext, Architektur-Entscheidungen und offene Punkte, damit keine Arbeit
> verloren geht. Bei größeren Änderungen bitte diese Datei mit aktualisieren.

## Was ist das?

PokéVault ist eine **Single-File Progressive Web App** (eine einzige `index.html`) zum
Erfassen, Bewerten und Vervollständigen einer Pokémon-Karten-Sammlung. Sie wurde als
Überraschungsgeschenk für den ~10-jährigen Sohn des Besitzers gebaut. Die App läuft als
PWA (über GitHub Pages gehostet, "Zum Home-Bildschirm" auf iOS) — **kein App Store, kein
Backend, kein Build-Schritt**.

Repository: https://github.com/smorrow1/pokevault — die Datei heißt dort `index.html`.

## Wichtigste Design-Prinzipien (nicht ohne Grund ändern)

1. **Eine einzige HTML-Datei** (plus `sw.js`). Kein Build-System, keine externen JS-Module.
   CSS und JS sind inline. Das ist bewusst so — es hält die App wartbar und sofort deploybar.
   **Einzige bewusste Ausnahme:** `sw.js` (Service Worker) liegt als eigene Datei vor, weil
   ein SW technisch nicht inline registriert werden kann (Scope). Wenn das Projekt stark
   wächst, wäre ein Wechsel zu Vite + Vanilla-JS-Modulen der nächste Schritt, aber erst
   wenn es wirklich nötig ist.
2. **Mobile-first, iOS-first.** Primär getestet auf iPhone (Vater: iPhone 17 Pro, Sohn:
   iPhone 12). Touch-Targets großzügig, kindgerecht.
3. **Kein Overengineering.** Lieber pragmatische, robuste Lösungen als "schlaue" fragile.
   (Beispiel: Es gibt inzwischen einen **leichtgewichtigen Auto-Auslöser** — reines JS,
   Schärfe- + Bewegungsmessung auf einem groben Raster. Schwere CV-Libs wie OpenCV werden
   weiterhin bewusst vermieden, weil sie auf älteren iPhones träge liefen.)
4. **Daten gehören dem Nutzer.** Alles in localStorage; Export/Import als Backup ist
   Pflicht, weil ein geleerter Cache sonst die Sammlung vernichtet.

## Technische Architektur

### Datenquellen (APIs)
- **TCGdex** (`api.tcgdex.net/v2/...`) — kostenlos, kein Key nötig. Liefert Kartendaten,
  Bilder, Set-Infos und **Preise**. Preise stammen von **Cardmarket** (EUR), Felder:
  `pricing.cardmarket.{trend, avg7, avg30, avg, updated}`. Auch `pricing.tcgplayer` (USD)
  wird wo vorhanden angezeigt. Nicht jede Karte hat Preisdaten → "Kein Preis" ist normal.
  - Karten-Suche: `/v2/{de|en}/cards?name=...` (zuerst DE, dann EN als Fallback)
  - Karten-Detail: `/v2/en/cards/{id}` (Detail immer EN wegen Preisdaten)
  - Set-Kartenliste (für "fehlende Karten"): `/v2/en/sets/{setId}`
- **Anthropic API** (`api.anthropic.com/v1/messages`) — für die Kamera-Erkennung
  (Claude Vision liest Name + Kartennummer vom Foto). Nutzt den **eigenen API-Key des
  Nutzers** (Header `x-api-key` + `anthropic-dangerous-direct-browser-access: true`).
  Modell: `claude-sonnet-4-6`. **WICHTIG:** Der Nutzer braucht Guthaben auf seinem
  Anthropic-Konto, sonst kommt "credit balance too low" (wird freundlich abgefangen).
  Die manuelle Suche funktioniert komplett ohne API-Key.

### localStorage-Schlüssel
- `pokevault_v6` — die Sammlung (Array von Karten-Objekten). **Versionierter Key**: bei
  Breaking Changes am Datenmodell hochzählen (v7, ...) und ggf. migrieren. (Noch v6.)
- `pokevault_apikey` — Anthropic API-Key (Klartext, nur lokal)
- `pokevault_achievements` — Array freigeschalteter Achievement-IDs
- `pokevault_achievementTimes` — `{id: ts}` Freischalt-Zeitstempel (für Detail-Ansicht)
- `pokevault_challengeStart` — Anker-Timestamp (Montag) der Wochen-Challenges
- `pokevault_challengesDone` — `{absoluteWeek: ts}` erledigte Challenges
- `pokevault_setCache` — gecachte TCGdex-Set-Kartenlisten (TTL 7 Tage, getrimmt)
- `pokevault_autoCapture` — Auto-Auslöser an/aus (`'0'` = aus)
- `pokevault_playHubCollapsed` — „Spielen"-Bereich ein-/ausgeklappt
- `pokevault_lastBackup` — Timestamp des letzten Backups
- `pokevault_viewMode` — `grid` | `list` | `sets`
- `pokevault_installHintDismissed` — ob der iOS-Install-Hinweis weggetippt wurde
- `pokevault_onboardingDismissed` — ob der Erststart-Hinweis weggetippt wurde

### CSS / Theming
- **Design-Tokens** liegen in `:root`: Marke (`--c-brand`, `--c-brand-d/-dd`), Flächen
  (`--c-surface`, `--c-surface-2`, `--c-ph`), Text (`--c-text`, `--c-n-444…ccc` Grautöne),
  Rahmen (`--c-border`, `--c-bd2`, `--c-track`), Akzente (`--c-mint`, `--c-mint-bd`, `--c-gold`,
  `--c-gold-tint`, `--c-brand-tint`) und **`--c-on-brand`/`--c-on-brand-2`** (helle Schrift auf
  der grünen Topbar — bleiben in BEIDEN Modi hell!). Neue Kernfarben über Tokens.
- **Dark Mode**: `@media (prefers-color-scheme: dark)` überschreibt die Tokens (folgt der
  iOS-Systemeinstellung, kein manueller Schalter). **Regeln, nicht regressieren:**
  - `--c-mint`/`--c-mint-bd` sind **Flächen/Border** (werden dunkel) — für helle Schrift auf
    Grün **`--c-on-brand`** nutzen, sonst wird die Topbar-Schrift im Dark Mode unsichtbar.
  - `#fff` als **Fläche** → `var(--c-surface)`; `#fff` als **Schrift auf Farbe** bleibt `#fff`.
  - **Achtung:** Tokens NUR im `<style>`-Block und in `style="…"`-Attributen verwenden —
    NICHT in JS-Farb-Arrays (Konfetti) oder in `<head>`-Meta / SVG-Data-URIs (dort kein `var()`).
  - Inline-Textfarben in HTML/JS-Templates sollten Tokens nutzen, damit sie im Dark Mode
    lesbar bleiben (Ausnahme: der selbst-weiße iOS-Install-Hinweis behält feste Farben).

### Karten-Datenmodell (ein Eintrag in der Sammlung)
```js
{
  uid,          // stabile lokale ID (NIE Array-Index für Referenzen nutzen!)
  name, set, setId, setTotal, serie, releaseDate, rarity,
  price,        // Zahl (Cardmarket trend/avg), 0 wenn unbekannt
  image,        // TCGdex Bild-URL (high.webp) — Listen leiten via thumbUrl() low.webp ab
  pricing,      // komplettes TCGdex pricing-Objekt (für Detail-Modal)
  cardId,       // TCGdex Karten-ID
  cardNumber,   // localId, z.B. "58"
  hp,           // Zahl oder null (für KP-Challenges; nur bei neueren Scans gesetzt)
  types,        // Array, z.B. ["Fire"] (TCGdex EN; für Typ-Challenges)
  addedAt       // Timestamp
}
```

### Wichtige Architektur-Entscheidungen / gelöste Bugs (nicht regressieren!)
- **Stabile `uid` statt Array-Index.** Früher hat das Löschen bei aktivem Filter die
  falsche Karte erwischt. Alle Karten-Referenzen (openModal, removeCard, Edition-Tausch)
  laufen über `uid`. **Niemals** wieder auf den gefilterten Array-Index zurückfallen.
- **`fetchWithTimeout`**: `signal` muss VOR `...opts` stehen
  (`{ signal: ctrl.signal, ...opts }`), sonst gab es 400er.
- **Bild-Downscaling auf max. 1024px** vor dem Vision-Call (sonst zu große Payload → 400).
- **Such-Scoring**: Häufige Namen (z.B. Pikachu, 100+ Treffer) werden nach Relevanz
  gescored (exakter Name +100, Nummer-Match +200) und gefiltert, dann lazy in 12er-Seiten
  geladen ("Mehr laden"). Vorher wurden blind nur die ersten 20 geladen → richtige Karte
  oft nicht dabei.
- **Kamera-Rahmen** hat festes 5:7-Seitenverhältnis (echte Kartenproportion), NICHT
  prozentual zur Display-Höhe — sonst sah er auf iPhone 17 Pro vs. 12 unterschiedlich aus.
- **Schärfe-Indikator**: misst Kanten-Varianz im Bildzentrum (~6 fps, reines JS, kein
  Paket). Loop-Start hat einen Fallback-Timeout, falls iOS `onloadedmetadata` nicht feuert.
- **Thumbnails laden `low.webp`** (Helper `thumbUrl()` leitet aus der gespeicherten
  high.webp-URL ab). Nur Detail-Modal/Set-Detail nutzen high.webp. Nicht zurück auf
  `c.image` in Listen/Grid/Picker wechseln (Bandbreite/RAM).
- **Auto-Auslöser** verlangt scharf UND ruhig (Bewegung auf grobem 8×11-Raster, damit
  Handzittern toleriert wird) + Arming-Delay. Bewegung NICHT pixelweise messen (löste bei
  detailreichen Karten schon bei 1px Versatz aus). Schwellen: `MOTION_STABLE_THRESHOLD`,
  `AUTO_CAPTURE_DWELL_MS`, `AUTO_ARM_DELAY_MS`.
- **Scan ist ein Vollbild-Overlay** (`#videoWrap` fixed), Auslöser fest unten mit
  Safe-Area. Body-Scroll wird währenddessen gesperrt und in `stopCam()` wieder freigegeben.
- **Service Worker (`sw.js`)**: HTML **network-first** (online immer frische Version, kein
  „stuck on stale"), Bilder/Font stale-while-revalidate, API-Hosts NIE cachen. Diese
  Reihenfolge nicht umdrehen, sonst kehrt das iOS-Cache-Update-Problem zurück.
- **Feier-Popups sind gequeut** (`showCelebration`), damit Erfolg + Challenge im selben
  Scan nacheinander statt übereinander erscheinen.

## Features (Stand v17)

- **Scan** als Vollbild-Overlay (5:7-Rahmen, Schärfe-Indikator, Tap-to-Focus,
  **Auto-Auslöser** bei scharfer+ruhiger Karte mit Countdown, Auto-Schalter) ODER
  manuelle Namenssuche (ohne API-Key).
- **Editions-Picker** mit Set-Filter und "Mehr laden"; Auto-Sprung bei eindeutigem Treffer.
- **Duplikat-Erkennung**: bei bereits vorhandener Karte ist "Überspringen" die
  Primäraktion, "Trotzdem" fügt als Dublette hinzu.
- **Sammlung**: Suche, Mehrfach-Filter (Seltenheit/Wert/Set, einklappbares Panel mit
  Badge), Sortierung, **3 Ansichten** (Kacheln / kompakte Liste / nach Set gruppiert),
  **Alphabet-Sprungleiste** (bei Namens-Sortierung + >20 Karten).
- **Set-Fortschritt**: horizontale Karten "X/Y", anklickbar → Detail zeigt welche Karten
  man HAT (farbig) vs. FEHLEN (ausgegraut mit "?"). Lädt volle Set-Liste von TCGdex.
- **„Spielen"-Bereich**: ein gemeinsamer, einklappbarer Block, der Challenge der Woche +
  Set-Fortschritt + Erfolge bündelt (hält die Startseite aufgeräumt).
- **Achievements**: 18 Abzeichen mit **Fortschrittsbalken**, antippbarer Detail-Ansicht,
  „Nächster Erfolg"-Nudge und 3 **geheimen** Erfolgen. Freischaltung mit Konfetti + Popup.
- **Wochen-Challenges**: jede Woche eine neue Aufgabe (12er-Zyklus, Scan-to-complete),
  z.B. „Karte mit B", „>130 KP", „Feuer-Pokémon".
- **Detail-Modal** pro Karte mit allen Preisdaten (Cardmarket EUR + TCGplayer USD).
- **Set-Detail mit Cache + Prefetch** (`pokevault_setCache`) → öffnet meist ohne Spinner.
- **Backup**: Export/Import als JSON, Backup-Erinnerung.
- **PWA**: Apple-Meta inline, "Zum Home-Bildschirm"-Hinweis, **Service Worker** (`sw.js`)
  für echtes Offline (Sammlung sichtbar) + schnelleren Wiederstart.
- **Sichtbarer Versions-Tag** in der Topbar (`APP_VERSION`).
- **Erststart-Onboarding**: wegklickbarer Willkommens-Block bei leerer Sammlung
  (erklärt Scan vs. Suche ohne API-Key). Nur einmal, danach gemerkt.
- **Dark Mode**: folgt automatisch der iOS-Systemeinstellung (kein Schalter).

## Deployment-Workflow

1. Änderungen an `index.html` (ggf. `sw.js`) machen.
2. Versions-Marker im Kommentar oben **und** `APP_VERSION` hochzählen (`PokéVault vX — ...`)
   — der Tag ist in der Topbar sichtbar, so sieht man nach dem Deploy, ob die neue Version
   geladen ist.
3. Committen + nach GitHub pushen (Claude Code kann das). Merge nach `main` (GitHub Pages
   serviert `main`). **Hinweis:** `CLAUDE.md` lebt auf `main`; bei Feature-Branch-Merges
   bleibt sie durch den 3-Wege-Merge erhalten.
4. Dank Service-Worker (HTML network-first) kommt die neue Version online normalerweise von
   selbst. Bei hartnäckigem Cache: einmal neu laden; im Notfall PWA vom Homescreen löschen
   und neu hinzufügen. Wenn nur Assets festhängen, `CACHE`-Name in `sw.js` hochzählen.

## Konventionen

- Sprache der UI: **Deutsch**. Code-Kommentare: Englisch (kurz, wo nötig).
- Vor jedem Commit: JS-Syntax prüfen (`node --check` auf den extrahierten Script-Block).
- Klammer-Balance der ganzen Datei nach Edits gegenchecken.
- Keine externen JS-Libs einbauen ohne guten Grund (Ausnahme: Tabler-Icons-Webfont via CDN).

## Mögliche nächste Schritte (vom Nutzer/Strategie genannt, NICHT umgesetzt)

- **Wunschliste** für fehlende Karten (direkt aus der Set-Detail-Ansicht heraus).
- **Preishistorie** über Zeit (bräuchte eigenes Backend mit Speicherung).
- **Level-/XP-System** oder tägliche Scan-Streak (falls Achievements gut ankommen).
- **Cardmarket-API direkt** statt TCGdex (genauere/vollständigere Preise, braucht aber
  Entwickler-Registrierung + Key).
- **Monetarisierung** (nur Hypothese, mit echten Nutzern testen): größtes Hindernis ist
  der eigene-API-Key-Zwang. Für ein echtes Produkt müsste die Erkennung über ein eigenes
  Backend gebündelt und eingepreist werden (Free-Tier mit Scan-Limit, Pro ~3–5 €/Monat
  mit unbegrenzten Scans + Cloud-Sync + Set-Fortschritt + Preisalarm).
  Zielgruppe laut Analyse: **Set-Komplettierer + Familien**.

## Bekannte technische Schulden

- `body.style.overflow='hidden'` beim Modal könnte bei einem Fehler zwischen open/close
  gesetzt bleiben (besser try/finally oder zentraler Modal-State).
- localStorage-Größenlimit: **gemessen unkritisch** — 200 Karten mit Pricing ≈ 92 KB
  (~465 B/Karte), 500 Karten ≈ 230 KB, weit unter dem 5-MB-Limit. IndexedDB-Migration
  daher bewusst **aufgeschoben** (Aufwand/Risiko > Nutzen für eine Kindersammlung).
- Listen-Render schreibt die ganze Liste per `innerHTML` (gemessen ~32 ms für 200 Karten →
  flüssig). Virtualisierung erst erwägen, wenn Sammlungen real >500–800 Karten werden.
- Gesamte Logik in einer Datei (~3200 Zeilen). Ab einem gewissen Punkt modularisieren.
