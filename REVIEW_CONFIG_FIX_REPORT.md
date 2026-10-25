# Prüfbericht Konfigurationsfehler

## Nachgewiesene Ursache

Die exakte YAML-Konfiguration passiert `setConfig()` ohne fehlenden Pflichtparameter. Der reproduzierbare Card-Test fand danach den konkreten Renderfehler `TypeError: Invalid option : option`.

Ursache war `Intl.DateTimeFormat("de-DE", { dateStyle: "short", hour, minute })`; `dateStyle` darf nicht mit einzelnen Zeitfeldern kombiniert werden. Dadurch scheiterte `render()` nach einem gültigen Forecast und Home Assistant zeigte den generischen Konfigurationsfehler. Behoben durch explizite Datums- und Zeitfelder.

## Korrekturen

- Zustände `uninitialized`, `waiting`, `loading`, `ready`, `no-data`, `entity-missing` und `service-error` eingeführt.
- Fehlende/unerreichbare Wetterentität wird innerhalb der Karte angezeigt.
- Fehler beim Forecast-Service werden nicht als Konfigurationsfehler weitergeworfen.
- Standardwerte für `duration` und `refresh_minutes` stabilisiert; `entity` validiert.
- Doppelte Custom-Element-Registrierung und doppelte `window.customCards`-Einträge verhindert.
- HACS-Bundle `dist/ha-laufwetter-card.js` neu gebaut.
- GitHub Actions validiert Tests, Build und dass das eingecheckte Bundle aktuell ist.
- Version auf `0.1.1` erhöht.

## Reproduzierbare Tests

- Exakte YAML-Konfiguration ohne optionale Zusatzparameter.
- Fehlendes `hass`-Objekt.
- Fehlende Wetterentität.
- Leere Prognose.
- Servicefehler.
- Erfolgreicher Abruf und anschließende Aktualisierung.
- Einmalige Custom-Element-Registrierung.
- `npm test`: 18/18 bestanden.
- `npm run build`: erfolgreich.
- `node --check dist/ha-laufwetter-card.js`: erfolgreich.

## Nicht ausführbar

Keine echte Home-Assistant-Instanz und keine Browserkonsole verfügbar. Der konkrete Renderfehler wurde im Node-Reproduktionstest mit Browser-API-Stubs reproduziert; HACS-Installation und Cache-Verhalten bleiben in HA runtime-unverifiziert.

## Skills

- Caveman: installiert, gelesen und verwendet.
- Ponytail: nicht installiert/auffindbar; nicht verwendet.
