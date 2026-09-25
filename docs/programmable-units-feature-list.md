# Programmierbare Einheiten — Feature-Liste

Status: geplant, nicht implementiert. Dieses Dokument ist die Start-Spezifikation.

## Ziel / Überblick

Einheiten werden vom Spieler programmierbar. Neben direkten Befehlen legt der Spieler fest, wie sich Einheiten in der Schlacht verhalten.

Das Verhalten entsteht in einem visuellen Drag-and-drop-Builder. Quelltext ist nicht nötig. Gebaut wird blockbasiert: Auslöser, Zustände und Aktionen sind Blöcke, die der Spieler zusammensetzt.

Die so erzeugten Skripte heißen **Policies**. Dieselbe Verhalten-Engine führt Spieler-Policies und die Gegner-KI aus. Unterschiedlich ist nur der Einstiegspunkt.

## Kernkonzepte

- **Programmierbare Einheit:** Eine Einheit kann Policies ausführen, die ihr Verhalten steuern.
- **Policy:** Ein gespeichertes Verhaltensskript aus Blöcken. Spieler bauen Policies selbst. Die Gegner-KI verwendet Policies derselben Engine.
- **Block:** Kleinster Baustein im Builder (Auslöser, Bedingung, Zustand, Aktion, Verknüpfung).
- **Zwei Regelarten** im selben Builder:
  - **Bedingte Auslöser (Trigger):** Eine Bedingung feuert eine Aktion, sobald sie zutrifft. Beispiel: „Wenn ein Gegner in Reichweite ist, dann angreifen.“
  - **Zustandsregeln:** Eine Regel gilt fortwährend, solange ein Zustand erfüllt ist. Beispiel: „Verteidigen, solange die Trefferpunkte unter 50 % liegen.“
- **Laufzeit-Schalter:** Policies lassen sich während des Spiels ein- und ausschalten. Die Strategie kann mitten in der Schlacht wechseln.
- **Eine Engine:** Spieler-Policies und Gegnerverhalten laufen über dasselbe Skriptsystem.

| | Trigger | Zustandsregel |
| --- | --- | --- |
| Auswertung | Bedingung wird wahr und feuert eine Aktion | Gilt, solange der Zustand besteht |
| Beispiel | Gegner in Reichweite → angreifen | HP unter 50 % → verteidigen |
| Ende | Aktion ist ausgelöst | Zustand ist nicht mehr erfüllt |

## Builder

- Visueller Drag-and-drop-Builder, ohne Code-Eingabe.
- Blockpalette und Arbeitsfläche: Blöcke werden gezogen und miteinander verbunden.
- Beide Regelarten entstehen im selben Builder, nicht in zwei getrennten Editoren.
- Startumfang der Blöcke (Katalog noch offen, siehe unten):
  - Auslöser, zum Beispiel Gegner in Reichweite oder Beschuss.
  - Zustände, zum Beispiel Trefferpunkte unter einem Schwellenwert.
  - Aktionen, zum Beispiel angreifen, verteidigen, zurückziehen, halten.
  - Verknüpfungen, zum Beispiel wenn-dann, solange, und, oder.
- Das Ergebnis einer Sitzung ist eine benannte Policy, die Einheiten zugewiesen und zur Laufzeit geschaltet werden kann.

## Policies

- Spiel- und Technikname: **Policy** (Mehrzahl: Policies).
- Eine Policy ist das gespeicherte Ergebnis des Builders.
- Aktivieren und Deaktivieren zur Laufzeit, ohne die Schlacht zu verlassen.
- Strategien wechseln mitten im Gefecht, indem Policies aus- und andere eingeschaltet werden.
- Gegnerverhalten wird als Policies derselben Engine ausgedrückt, nicht als zweites, paralleles Verhaltenssystem.

## Vereinheitlichung der Gegner-KI

Alle bestehenden Verhalten, die die Gegner-KI steuern, wandern auf dieses Skriptsystem. Danach gibt es eine Verhalten-Engine für Spieler-Policies und Gegner-KI. Nur der Einstiegspunkt unterscheidet sich:

- **Spieler:** selbst gebaute Policies, zur Laufzeit schaltbar, an eigene Einheiten gebunden.
- **Gegner:** mitgelieferte Policies, die das bisherige KI-Verhalten abbilden. Der bestehende KI-Takt bleibt der Einstieg; der Inhalt kommt aus derselben Engine.

### Heutige Einstiegspunkte (Referenz, unverändert)

Der Simulationstakt in `src/updateGame.js` ruft `updateEnemyAI` aus `src/enemy.js` auf. `updateEnemyAI` läuft nur auf dem Host, setzt im Replay aus und drosselt sich über `AI_UPDATE_FRAME_SKIP`. Anschließend:

- `updateLlmStrategicAI` in `src/ai/llmStrategicController.js` für die optionale strategische LLM-Schicht.
- `computeLeastDangerAttackPoint` in `src/ai/attackCoordination.js` für den gemeinsamen Angriffspunkt.
- je KI-Partei `updateAIPlayer` in `src/ai/enemyAIPlayer.js` (Bau, Produktion, Logistik, Reparatur, Einheiten-Update).

Einheitenverhalten geht von `updateAIUnit` (`src/ai/enemyUnitBehavior.js`) nach `updateAIUnitInternal` in `src/ai/enemyUnitBehaviorCore.js`. Die Entscheidung verteilt sich heute auf Domänenmodule, unter anderem:

- `src/ai/enemyNavalBehavior.js` — Schiffe
- `src/ai/enemyAirBehavior.js` — Apache und Luft
- `src/ai/enemyGroundCombatDecision.js` und `src/ai/enemyGroundTactics.js` — Bodenkampf
- `src/ai/enemySupportBehavior.js` — Ambulance und Harvester-Jäger
- `src/ai/enemyStrategies.js` (`applyEnemyStrategies`) — Rückzug, Werkstatt, Harvester-Schutz, Gruppenangriff
- `src/ai/attackCoordination.js`, `src/ai/retreatLogic.js`, `src/ai/logistics.js`, `src/ai/crewHealing.js`, `src/ai/recoveryTanks.js` — Koordination, Rückzug und Versorgung

Die Vereinheitlichung ersetzt diese verteilten Entscheidungen schrittweise durch Policies auf der gemeinsamen Engine. Der äußere Takt (`updateEnemyAI` → Parteien) kann der KI-Einstieg bleiben. Spieler-Policies erhalten einen eigenen Einstieg in derselben Engine. Dieses Dokument ändert keinen dieser Pfade.

## Visualisierung / UI

- Der Builder ist eine eigene, lesbare Oberfläche: Blockpalette, Arbeitsfläche und sichtbare Verbindungen zwischen Blöcken.
- Trigger und Zustandsregeln sind in der Darstellung unterscheidbar.
- Jede Policy erscheint im UI mit Namen, Aktiv-Zustand und einer kurzen Darstellung ihrer Regeln.
- Ein- und Ausschalten ist ein klares Steuerelement während des Spiels.
- Die Darstellung folgt dem bestehenden HUD und bleibt als Visualisierung erkennbar, nicht als reine Textliste. Das konkrete Layout ist noch offen.

## Offene Fragen

Diese Punkte sind **nicht entschieden**:

- Welche Einheitstypen im ersten Schritt programmierbar sind.
- Ob mehrere Policies gleichzeitig auf einer Einheit liegen und wie Konflikte und Priorität aufgelöst werden.
- Ob eine Policy an eine Einheit, eine Auswahl oder eine Partei gebunden ist.
- Ob mitgelieferte Gegner-Policies im Builder sichtbar sind.
- Wie die LLM-Schicht in `src/ai/llmStrategicController.js` zur Engine steht: darüber bleiben oder später selbst Policies erzeugen.
- Ob die bestehende Harvester-Automatisierung (siehe `havester-policies.md`) in dieses Policy-System wandert.
- Auswertungsintervall, Abklingzeiten und das Budget der Engine im Simulationstakt.
- Speicherformat sowie Save, Load, Multiplayer-Sync und Replay.
- Ob der Builder während einer laufenden Schlacht offen ist. Der Schalter für fertige Policies ist zur Laufzeit gefordert; der Zeitpunkt des Editors ist offen.

## Nicht in diesem Schritt

- Keine Implementierung und keine Änderung an KI, UI oder Simulation.
- Kein fester Block-Katalog und keine Balancewerte.
