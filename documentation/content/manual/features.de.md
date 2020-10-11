---
title: "Funktionen"
bookFlatSection: false
type: docs
weight: 101
---

# Funktionen

## Übersichtsseite

### Gruppen

Gruppen können verwendet werden, um verschiedene Artikel nach Themen zu gruppieren.
Dies erhöht nicht nur die Übersichtlichkeit, sondern erlaubt es auch verschiedene Artikel simultan automatisch zu ersteigern.
Falls Gruppen nicht benötigt werden, kann die Gruppen-Funktion auch über "Disable Groups"
(siehe [Interne Konfigurationsparameter]({{< ref "/manual#interne-konfigurationsparameter" >}})) deaktiviert werden.

> In der Standardeinstellung "☝️ Ich möchte Einen" wird pro Gruppe immer nur ein Artikel ersteigert, danach wird die Gruppen-Automatik deaktiviert.  
> Alternativ werden über die "🖐️ Ich möchte Alle" Gruppen-Einstellung alle Artikel der Gruppe versucht zu ersteigern.
 
{{< image src="/features_be_gruppe.de.png" alt="Gruppen" >}}

- Artikel können jederzeit Gruppen zugewiesen werden.
- Jede Gruppe hat einen Schalter für den Gruppen-Automatikmodus welcher standardmäßig aktiviert ist.
    - Der Gruppen-Automatikmodus kann über Maus-Klick auf die Gruppen Zeile in der Übersichtstabelle aktiviert, bzw. deaktiviert werden.
    - Der Status wird sowohl über Farbe, als auch Text angezeigt (z.B. rote Farbe, Text "Automatikmodus inaktiv").
- Gruppen werden im synchronisierten Speicherbereich aufbewahrt.
  Sie stehen somit auch in anderen Fenstern und sogar anderen Rechnern zur Verfügung.

### Artikel

Artikel werden automatisch in die Übersichtstabelle hinzugefügt, sobald ein eBay Artikel in einem Browser Tab im gleichen Fenster geöffnet wurde.
Zu diesem Zeitpunkt ist der Artikel aber noch nicht gespeichert - dies geschieht erst,
sobald der Nutzer ein Maximal Gebot, oder auch eine Gruppenzuweisung vornimmt.
Nachdem der Artikel gespeichert wurde, kann auch der Tab geschlossen werden und der Artikel bleibt in der Tabelle.

{{< image src="/features_be_artikel_maxbid.de.gif" alt="Artikel Gebot definieren" >}}

{{< hint info >}}
BE kann ungefähr 70 Artikel gleichzeitig in der Tabelle verwalten, bevor der synchronisierte Speicher voll ist.
Wenn der Speicher voll ist, wird ein Fehler ausgegeben.

Es gibt verschiedene Möglichkeiten dieses Problem zu lösen:

- Die Tabelle kann manuell oder die eingebaute Aufräum-Funktion bereinigt werden.
- Sie können die interne Option "Enable Local Mode" aktivieren, wodurch deutlich mehr Artikel (>1000) gespeichert werden können.
  (siehe [Interne Konfigurationsparameter]({{< ref "/manual#interne-konfigurationsparameter" >}}))
  Allerdings wird dieser Speicher nicht zwischen mehreren Rechnern synchronisiert.
- Alternativ kann auch die interne Option "Enable Compact Saving" aktiviert werden
  (siehe [Interne Konfigurationsparameter]({{< ref "/manual#interne-konfigurationsparameter" >}}))
{{< /hint >}}

- Das gewünschte Maximalgebot für einen Artikel kann direkt in der Überssichtstabelle eingegeben werden.
  Der aktualisierte Wert wird auch dem eBay Artikel Tab mitgeteilt.
- Bei Eingabe eines Wertes welcher niedriger als der Minimalerhöhungspreis[^1] ist, wird die Eingabe automatisch auf den
  niedrigsten möglichen Wert reduziert.
- Bei Eingabe eines Wertes welcher höher als der Sofortkauf Preis liegt, wird die Eingabe automatisch 
  auf den Sofortkaufpreis, **minus 1 Cent*- reduziert.
- Das Feld für den Artikel Automatikmodus wird erst zum anklicken freigegeben, wenn das gesetzte Maximal Gebot höher
  als der aktuelle Artikel Preis bzw. der Minimalerhöhungsschritt ist.
- Aktualisierungen der Artikel Attribute (Preis, Anzahl Gebote, usw.) werden durch setzen einer gelben Hintergrundfarbe
  auf den geänderten Zellen visualisiert. Die Visualisierung bleibt bis zum neu laden der Seite bestehen.

{{< hint info >}}
Der Artikel Automatikmodus wird automatisch deaktiviert, wenn der Artikel-Preis während der Auktion über das definierte Maximalgebot geht.
{{< /hint >}}

#### eBay Beobachtungsliste

> BE unterstützt den Import von bis zu 100 Artikeln aus der Beobachtungsliste.

Ebay bietet eine sogenannte Beobachtungsliste, in der Artikel gesammelt werden können. Auf jeder Artikelseite gibt es
einen Knopf "Auf die Beobachtungsliste" über den Artikel sehr einfach für später gespeichert werden können.

Sie können diese Artikel auch in BE einlesen. Drücken sie hierfür auf der BE Übersichtsseite den Knopf "Beobachtete Artikel hinzufügen".
Dies fügt alle aktuell beobachteten Artikel in die Gruppe "Watchlist" hinzu.
Bitte beachten sie, dass die Beobachtungsliste per Hand aufgeräumt werden muss.
BE fügt alle Artikel hinzu, egal ob abgelaufene Auktionen oder Sofortkauf Artikel. 
BE löscht keine Artikel aus der Beobachtungsliste, wenn diese aus BE entfernt werden.
Hinweis: BE verwendet ebay.de um die Beobachteten Artikel abzurufen. Dies kann in den internen Parametern umgestellt werden.

### Ereignis-Protokollierung

BE erzeugt drei Arten von Protokollen:

#### Artikel bezogenes Ereignisprotokoll

{{< image src="/features_be_artikelprotokoll.de.gif" alt="Artikel Ereignisprotokoll" >}}
Dies ist das für den Benutzer wichtigste Protokoll, das es in relativ lesbarer Form aufzeichnet, was BE bzgl. Bietvorgang
oder Änderungen gemacht, bzw. festgestellt hat.

#### Übersichtsseite Ereignisprotokoll

Dieses Protokoll wird im Browser Console Log der Übersichtsseite aufgezeichnet und ist üblicherweise nach einem Neuladen
der Seite wieder gelöscht. Dies können erfahrenere Benutzer verwenden um die internen Vorgänge von BE zu verfolgen.

#### eBay Artikelseite Ereignisprotokoll

Dieses Protokoll wird im Browser Console Log der ebay Artikelseite aufgezeichnet, ansonsten s.o.

{{< hint info >}}
Bei Problemmeldungen sollte zumindest das Artikel Ereignisprotokoll für Artikel, welche Probleme erzeugt haben
bereitgestellt werden. Hierzu kann man einfach das Protokoll mit Klick auf das '+' Symbol öffnen, alle Einträge mit der
Maus markieren (ganz nach unten rollen damit alle Einträge erwischt werden) und dann mit der rechten Maustaste kopieren.
{{< /hint >}}

### Simulations Modus

Falls gewünscht, kann zum ausprobieren ohne Risiko auch der Simulationsmodus aktiviert werden.
Hierzu drücken Sie einfach die "Umschalt-Taste" während sie den globalen Automatikmodus aktivieren.
Der Testmodus ist aktiv, wenn das BE Symbol ein kleines 'T' anzeigt. 
Der einzige Unterschied zum Normalen bieten ist, das das Gebot kurz vor Ablauf der Auktion nicht bestätigt wird.

Die Simulation führt allerdings nicht zur Deaktivierung der Biet-Automatik, da kein "gekaufter" Status simuliert wird.

## Bietvorgang

BE wird auf einen Artikel automatisch bieten, wenn sowohl der Automatikmodus für den Artikel,
die Gruppe in der sich der Artikel befindet, sowie der Globale Automatikmodus aktiv geschalten sind. 

Ungefähr eine Minute vor Auktionsende, öffnet BE die "offer.ebay.de" Seite für den Artikel in einem neuen Browser-Tab.
Wenn BE ordentlich funktioniert, wird die Restzeit bis zur Gebotsabgabe sowohl im Tab-Titel, als auch auf der "Offer"-Seite selber angezeigt.

Der Bietvorgang läuft weitgehend eigenständig im "Offer" Browser Tab wie folgt ab:

- Bei der Initialisierrung wird auf Biet-Kollisionen geprüft und der Bietzeitpunkt ggf. angepasst.
- Es wird ein Timer gesetzt, welcher alle zwei Sekunden den Tab-Titel und den Bestätigungs Knopf Text mit einem Countdown aktualisiert.
- Es wird ein Timer gesetzt welcher zum ermittelten Biet-Zeitpunkt die Biet-Funktion aufruft.
- Die Biet-Funktion beinhaltet folgende Schritte:
  - Prüfung ob alle drei Biet-Automatiken aktiviert sind und Biet-Sperre inaktiv (Kommunikation mit BE-Übersichtsseite).
  - Zugriff auf Bestätigungs-Knopf, wenn dieser nicht vorhanden beende mit Fehler.
    Ursache kann beispielsweise Kommunikationproblem mit eBay sein, oder auch einfach wenn Sie überboten wurden.

{{< hint info >}}
Hinweis: Stellen sie sicher, dass ihr Rechner nicht in den Ruhezustand / Standby Modus geht.
BE kann den Rechner nicht wecken und somit dann auch nicht automatisch bieten.
{{< /hint >}}

### Vermeidung von Doppelkäufen (Auktions-Kollosion)

> Dieser Abschnitt trifft nur zu, wenn die Gruppen-Option "☝️ Ich möchte Einen" aktiv ist. 

Standardmäßig soll aus jeder Gruppe nur ein Artikel ersteigert werden.
Dies wird dadurch gewährleistet, dass wenn ein Artikel ein erfolgreichen Auktionsstatus zurückmeldet, die Gruppen Bietautomatik deaktiviert wird.

Dies ist allerdings problematisch, wenn mehrere Artikel Auktionen zu einem ähnlichen Zeitpunkt enden.
Um zu verhindern, das mehrere Artikel einer Gruppe ersteigert werden, wird folgende Programmlogik angewendet:

- Der Bietzeitpunkt, d.h. Bestätigung des Gebots wird angepasst, so daß immer mindestens 10 Sekunden zwischen zwei Auktionen liegen.
- Es wird eine Bietsperre verhängt, wenn eine Auktion welche innerhalb 10s vor der eigenen Auktion endete noch keinen abgeschloßenen Auktionsstatus hat. 
  
{{{< hint info >}}
Die beschriebene Programmlogik kann somit zu erfolglosen Auktionen führen:
Wenn zwei Auktionen innerhalb des gleichen 10 Sekunden Fensters enden,
wird für den zweiten Artikel u.U kein Gebot abgegeben werden,
selbst wenn die erste Auktion nicht erfolgreich war. 
{{{< /hint >}}

## eBay Artikel Seite
Beim Ladevorgang der eBay Artikelseite, erweitert BE diese durch einen Knopf, welcher den Automatikmodus für diesen Artikel aktivieren kann.
Im Hintergrund wird auch das Maximalgebot Eingabefeld überwacht, und dieser Wert gegebenenfalls geprüft und gespeichert. 

{{< image src="/features_be_artikelseite.de.gif" alt="Artikelseite" >}}

- Eine Veränderung des Maximalgebots oder der Automatikfunktion werden an die Übersichtsseite weitergeleitet
- Bei Eingabe eines Wertes welcher niedriger als der Minimalerhöhungspreis ist, wird die Eingabe automatisch auf den niedrigsten möglichen wert reduziert.
- Bei Eingabe eines Wertes welcher höher als der Sofortkauf Preis liegt, wird die Eingabe automatisch auf den Sofortkaufpreis, **minus 1 Cent*- reduziert.
- Der Knopf für den Automatikmodus auf der Artikelseite bezieht sich nur auf den Artikel.
  Zusätzlich muss auch die Gruppenautomatik und auch der globale Automatikmodus aktiv sein, ansonsten wird der Artikel nicht automatisch ersteigert. 

[^1]: Die Erhöhungsschritte können auch bei eBay nachgeschaut werden: https://www.ebay.de/help/buying/bidding/automatisches-bietsystem-bei-ebay-maximalgebot?id=4014 