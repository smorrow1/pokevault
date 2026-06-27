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

1. **Eine einzige HTML-Datei.** Kein Build-System, keine externen JS-Module. CSS und JS
   sind inline. Das ist bewusst so — es hält die App wartbar und sofort deploybar.
   Wenn das Projekt stark wächst, wäre ein Wechsel zu Vite + Vanilla-JS-Modulen der
   nächste Schritt, aber erst wenn es wirklich nötig ist.
2. **Mobile-first, iOS-first.** Primär getestet auf iPhone (Vater: iPhone 17 Pro, Sohn:
   iPhone 12). Touch-Targets großzügig, kindgerecht.
3. **Kein Overengineering.** Lieber pragmatische, robuste Lösungen als "schlaue" fragile.
   (Beispiel: Auto-Capture per Computer Vision wurde bewusst NICHT gebaut, weil OpenCV
   o.ä. zu schwer für eine schlanke PWA wäre und auf älteren iPhones träge liefe.)
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
  Breaking Changes am Datenmodell hochzählen (v7, ...) und ggf. migrieren.
- `pokevault_apikey` — Anthropic API-Key (Klartext, nur lokal)
- `pokevault_achievements` — Array freigeschalteter Achievement-IDs
- `pokevault_lastBackup` — Timestamp des letzten Backups
- `pokevault_viewMode` — `grid` | `list` | `sets`
- `pokevault_installHintDismissed` — ob der iOS-Install-Hinweis weggetippt wurde

### Karten-Datenmodell (ein Eintrag in der Sammlung)
```js
{
  uid,          // stabile lokale ID (NIE Array-Index für Referenzen nutzen!)
  name, set, setId, setTotal, serie, releaseDate, rarity,
  price,        // Zahl (Cardmarket trend/avg), 0 wenn unbekannt
  image,        // TCGdex Bild-URL (high.webp)
  pricing,      // komplettes TCGdex pricing-Objekt (für Detail-Modal)
  cardId,       // TCGdex Karten-ID
  cardNumber,   // localId, z.B. "58"
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

## Features (Stand v9)

- **Scan** per Kamera (Hochformat, 5:7-Rahmen mit ikonischem Pokéball-Kartenrücken als
  Platzhalter, Schärfe-Indikator, Tap-to-Focus) ODER manuelle Namenssuche (ohne API-Key).
- **Editions-Picker** mit Set-Filter und "Mehr laden"; Auto-Sprung bei eindeutigem Treffer.
- **Duplikat-Erkennung**: bei bereits vorhandener Karte ist "Überspringen" die
  Primäraktion, "Trotzdem" fügt als Dublette hinzu.
- **Sammlung**: Suche, Mehrfach-Filter (Seltenheit/Wert/Set, einklappbares Panel mit
  Badge), Sortierung, **3 Ansichten** (Kacheln / kompakte Liste / nach Set gruppiert),
  **Alphabet-Sprungleiste** (bei Namens-Sortierung + >20 Karten).
- **Set-Fortschritt**: horizontale Karten "X/Y", anklickbar → Detail zeigt welche Karten
  man HAT (farbig) vs. FEHLEN (ausgegraut mit "?"). Lädt volle Set-Liste von TCGdex.
- **Achievements**: 10 Abzeichen, Freischaltung mit Konfetti + Vibration + Popup.
- **Detail-Modal** pro Karte mit allen Preisdaten (Cardmarket EUR + TCGplayer USD).
- **Backup**: Export/Import als JSON, Backup-Erinnerung.
- **PWA**: Manifest/Apple-Meta inline, "Zum Home-Bildschirm"-Hinweis auf iOS.

## Deployment-Workflow

1. Änderungen an `index.html` machen.
2. Versions-Marker im Kommentar oben in der Datei hochzählen (`PokéVault vX — ...`) —
   hilft zu prüfen, ob nach dem Deploy die neue Version geladen ist (GitHub Pages cached).
3. Committen + nach GitHub pushen (Claude Code kann das).
4. Auf dem iPhone: bei hartnäckigem Cache PWA vom Homescreen löschen und neu hinzufügen.

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
- localStorage-Größenlimit: bei sehr großen Sammlungen (>500 Karten mit Pricing-Objekten)
  kann `save()` fehlschlagen. Aktuell try/catch mit Fehlermeldung. Langfristig: Bilder
  nicht im localStorage halten / IndexedDB erwägen.
- Gesamte Logik in einer Datei (~2500 Zeilen). Ab einem gewissen Punkt modularisieren.
