---
title: "Funktionen"
bookFlatSection: false
type: docs
weight: 101
---

# Funktionen

## Übersichtsseite

### Gruppen
Gruppen können verwendet werden, um verschiedene Artikel Typen simultan zu verfolgen und automatisch zu ersteigern.
Es wird pro Gruppe immer nur ein Artikel ersteigert, danach wird die Gruppen-Automatik deaktiviert.
Der Nutzer kann also einfach beliebig viele Gruppen erzeugen, um die gewünschten Artikel zu ersteigern.

{{< image src="features_be_gruppe.de.png" alt="Gruppen" >}}

* Artikel können jederzeit in Gruppen zugewiesen werden
* Gruppen haben einen Schalter für den Gruppen-Automatikmodus
    * Der Gruppen-Automatikmodus kann über Maus-Klick auf die Gruppen Zeile in der Übersichtstabelle aktiviert, bzw. deaktiviert werden.
    * Der Status wird sowohl über Farbe, als auch Text angezeigt (z.B. rote Farbe, Text "Automatikmodus inaktiv").
* Gruppen werden im synchronisierten Speicherbereich aufbewahrt. Sie stehen somit auch in anderen Fenstern und sogar 
  Rechnern zur Verfügung.

### Artikel
Artikel werden automatisch in die Übersichtstabelle hinzugefügt, sobald ein eBay Artikel in einem Browser Tab im gleichen Fenster geöffnet wurde.
Zu diesem Zeitpunkt ist der Artikel aber noch nicht gespeichert - dies geschieht erst, sobald der Nutzer ein Maximal Gebot, 
oder auch eine Gruppenzuweisung vornimmt. Nachdem der Artikel gespeichert wurde, kann auch der Tab geschlossen werden
und der Artikel bleibt in der Tabelle.

{{< image src="features_be_artikel_maxbid.de.gif" alt="Artikel Gebot definieren" >}}

* Das gewünschte Maximalgebot für einen Artikel kann direkt in der Überssichtstabelle eingegeben werden.
  Der aktualisiere Wert wird auch dem eBay Artikel Tab mitgeteilt.
* Bei Eingabe eines Wertes welcher niedriger als der Minimalerhöhungspreis[^1] ist, wird die Eingabe automatisch auf den
  niedrigsten möglichen wert reduziert.
* Bei Eingabe eines Wertes welcher höher als der Sofortkauf Preis liegt, wird die Eingabe automatisch 
  auf den Sofortkaufpreis, **minus 1 Cent** reduziert.
* Das Feld für den Artikel Automatikmodus wird erst zum anklicken freigegeben, wenn das gesetzte Maximal Gebot höher
  als der aktuelle Artikel Preis bzw. der Minimalerhöhungsschritt ist.

{{< hint info >}}
Der Artikel Automatikmodus wird automatisch deaktiviert, wenn der Artikel Preis während der Auktion über das definierte Maximalgebot geht.
{{< /hint >}}

### Ereignis Protokollierung

BE erzeugt drei Arten von Protokollen:
#### Artikel bezogenes Ereignisprotokoll
{{< image src="features_be_artikelprotokoll.de.gif" alt="Artikel Ereignisprotokoll" >}}
Dies ist das für den Benutzer wichtigste Protokoll, das es in relativ lesbarer Form aufzeichnet, was BE bzgl. Bietvorgang
oder Änderungen gemacht, bzw. festgestellt hat.
#### Übersichtsseite Ereignisprotokoll
Dieses Protokoll wird im Browser Console Log der Übersichtsseite aufgezeichnet und ist üblicherweise nach einem Neuladen
der Seite wieder gelöscht. Dies können erfahrenere Benutzer verwenden um die internen Vorgänge von BE zu verfolgen.
#### eBay Artikelseite Ereignisprotokoll
Dieses Protokoll wird im Browser Console Log der ebay Artikelseite aufgezeichnet, ansonsten s.o.


{{< hint info >}}
Bei Problemmeldungen sollte zumindest das Artikel Ereignisprotokoll für Artikel, welche probleme erzeugt haben
bereitgestellt werden. Hierzu kann man Einfach das Protokoll mit Klick auf das '+' Symbol öffnen, alle Einträge mit der
Maus markieren (ganz nach unten rollen damit alle Einträge erwischt werden) und dann mit der rechten Maustaste kopieren.
{{< /hint >}}

### Simulations Modus
Falls gewünscht, kann zum ausprobieren ohne Risiko auch der Simulationsmodus aktiviert werden.
Der Einzige Unterschied zum Normalen bieten ist, das das Gebot kurz vor Ablauf der Auktion nicht bestätigt wird.

Das Ergebnis der Auktion wird ebenfalls simuliert und sollte dann in der Regel zur deaktivierung der Gruppen-Automatik,
führen, da eine Auktion als "gewonnen" angenommen wird.

## eBay Artikel Seite
Beim Ladevorgang der eBay Artikelseite, erweiter BE diese durch einen Knopf, welcher den Automatikmodus aktivieren kann.
Im Hintergrund wird auch das Maximalgebot Eingabefeld überwacht, und dieser Wert gegebenenfalls geprüft und gespeichert. 

{{< image src="features_be_artikelseite.de.gif" alt="Artikelseite" >}}

* Eine Veränderung des Maximalgebots oder der Automatikfunktion werden an die Übersichtsseite weiter geleitet
* Bei Eingabe eines Wertes welcher niedriger als der Minimalerhöhungspreis ist, wird die Eingabe automatisch auf den
  niedrigsten möglichen wert reduziert.
* Bei Eingabe eines Wertes welcher höher als der Sofortkauf Preis liegt, wird die Eingabe automatisch 
  auf den Sofortkaufpreis, **minus 1 Cent** reduziert.

[^1] Die Erhöhungsschritte können auch bei eBay nachgeschaut werden: https://www.ebay.de/help/buying/bidding/automatisches-bietsystem-bei-ebay-maximalgebot?id=4014 