# Prüfauftrag für Google Antigravity

Prüfe das gesamte Repository `frandle82/ha-laufwetter-card` als eigenständige Home-Assistant-Lovelace-Custom-Card. **Lies zuerst AGENTS.md und setze die dort vorgeschriebenen Caveman- und Ponytail-Skills ein.** Falls ein Skill nicht installiert oder seine Definition nicht auffindbar ist, benenne den Blocker; behaupte keine Skill-Ausführung.

## 1. Reproduzierbare Prüfung
- `npm install`, `npm test`, `npm run build`; Ergebnisse dokumentieren.
- Prüfe die gebaute Datei `dist/laufwetter-card.js` auf Syntax, Importfreiheit und korrekte Registrierung von `custom:laufwetter-card`.
- Prüfe die GitHub-Actions-Konfiguration und Build-Artefakte.

## 2. Home Assistant
- Prüfe die korrekte Nutzung von `weather.get_forecasts` über die Home-Assistant-WebSocket-/Service-API, inklusive `return_response` und Zielentität; mit aktueller HA-Dokumentation vergleichen.
- Teste vorhandene/fehlende stündliche Forecasts, ungültige Entitäten, Ladezustände, Refresh, Reconnect und Kartenentfernung.
- Verifiziere Temperatur-, Wind- und Niederschlagseinheiten sowie Zeitzonen und Sommerzeitwechsel.

## 3. Bewertungslogik
- Unit-Tests für 0/100-Grenzen, fehlende Felder, Regen, Wind/Böen, UV, extreme Temperaturen, Gewitter und falsche/NaN-Werte.
- Prüfe, ob Zeitfenster 30/45/60/90/120 Minuten fachlich korrekt bewertet werden. Die aktuelle Stundenraster-Approximation darf nicht als exakte minutengenaue Prognose dargestellt werden.
- Prüfe, ob das beste Zeitfenster in der Zukunft liegt und ob aufeinanderfolgende Prognosestunden tatsächlich zusammenhängen.
- Zeige Modellannahmen und Grenzen deutlich auf; keine behauptete Gleichheit mit laufwetter.de.

## 4. Darstellung und Barrierefreiheit
- Minimalistisches, responsives Design in Home Assistant Desktop und Mobil.
- Hell-/Dunkelmodus, Kontrast, fehlende Daten, verständliche deutsche Beschriftungen.
- Verifiziere, dass die Stundenbalken zeitlich korrekt beschriftet sind und die beste Laufzeit sinnvoll angezeigt wird.
- Keine externen Assets, kein Tracking, kein Scraping.

## 5. Ergebnis und Umsetzung
- Erstelle einen strukturierten Prüfbericht mit Befund, Schweregrad, Reproduktion und konkreter Abhilfe.
- Behebe nachweisbare Fehler auf einem Feature-Branch, ergänze Tests und erstelle einen Pull Request.
- Dokumentiere separat: tatsächlich ausgeführte Tests, nicht ausführbare Tests und noch offene Risiken.
- Berichte explizit den Status beider Pflicht-Skills (Caveman, Ponytail).
