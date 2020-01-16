---
title: "Funktionen"
bookFlatSection: false
type: docs
weight: 101
---

# Funktionen

## Übersichtsseite

### Gruppen
Gruppen können verwendet werden, um verschiedene Artikel nach Themen zu gruppieren. Dies erhöht nicht nur die
Übersichtlichkeit, sondern erlaubt es auch verschiedene Artikel simultan automatisch zu ersteigern.

> Es wird pro Gruppe immer nur ein Artikel ersteigert, danach wird die Gruppen-Automatik deaktiviert.  
> Falls es gewünscht sein sollte mehrere Artikel einer Gruppe zu ersteigern, kann die Gruppen Automatik per Hand
> wieder aktiviert werden  
> Alternativ können sie kleinere Gruppen erstellen. Im Extremfall also nur ein Artikel pro Gruppe, um alle Artikel
> zu ersteigern. 
 
{{< image src="features_be_gruppe.de.png" alt="Gruppen" >}}

* Artikel können jederzeit in Gruppen zugewiesen werden
* Gruppen haben einen Schalter für den Gruppen-Automatikmodus
    * Der Gruppen-Automatikmodus kann über Maus-Klick auf die Gruppen Zeile in der Übersichtstabelle aktiviert, bzw. deaktiviert werden.
    * Der Status wird sowohl über Farbe, als auch Text angezeigt (z.B. rote Farbe, Text "Automatikmodus inaktiv").
* Gruppen werden im synchronisierten Speicherbereich aufbewahrt. Sie stehen somit auch in anderen Fenstern und sogar 
  anderen Rechnern zur Verfügung.

### Artikel
Artikel werden automatisch in die Übersichtstabelle hinzugefügt, sobald ein eBay Artikel in einem Browser Tab
im gleichen Fenster geöffnet wurde.
Zu diesem Zeitpunkt ist der Artikel aber noch nicht gespeichert - dies geschieht erst, sobald der Nutzer ein Maximal Gebot, 
oder auch eine Gruppenzuweisung vornimmt. Nachdem der Artikel gespeichert wurde, kann auch der Tab geschlossen werden
und der Artikel bleibt in der Tabelle.

{{< image src="features_be_artikel_maxbid.de.gif" alt="Artikel Gebot definieren" >}}

* Das gewünschte Maximalgebot für einen Artikel kann direkt in der Überssichtstabelle eingegeben werden.
  Der aktualisierte Wert wird auch dem eBay Artikel Tab mitgeteilt.
* Bei Eingabe eines Wertes welcher niedriger als der Minimalerhöhungspreis[^1] ist, wird die Eingabe automatisch auf den
  niedrigsten möglichen Wert reduziert.
* Bei Eingabe eines Wertes welcher höher als der Sofortkauf Preis liegt, wird die Eingabe automatisch 
  auf den Sofortkaufpreis, **minus 1 Cent** reduziert.
* Das Feld für den Artikel Automatikmodus wird erst zum anklicken freigegeben, wenn das gesetzte Maximal Gebot höher
  als der aktuelle Artikel Preis bzw. der Minimalerhöhungsschritt ist.
* Aktualisierungen der Artikel Attribute (Preis, Anzahl Gebote, usw.) werden durch setzen einer gelben Hintergrundfarbe
  auf den geänderten Zellen visualisiert. Die Visualisierung bleibt bis zum neu laden der Seite bestehen.

{{< hint info >}}
Der Artikel Automatikmodus wird automatisch deaktiviert, wenn der Artikel Preis während der Auktion über das definierte Maximalgebot geht.
{{< /hint >}}

### Ereignis-Protokollierung

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
Bei Problemmeldungen sollte zumindest das Artikel Ereignisprotokoll für Artikel, welche Probleme erzeugt haben
bereitgestellt werden. Hierzu kann man einfach das Protokoll mit Klick auf das '+' Symbol öffnen, alle Einträge mit der
Maus markieren (ganz nach unten rollen damit alle Einträge erwischt werden) und dann mit der rechten Maustaste kopieren.
{{< /hint >}}

### Simulations Modus
Falls gewünscht, kann zum ausprobieren ohne Risiko auch der Simulationsmodus aktiviert werden. Hierzu drücken
Sie einfach die "Umschalt-Taste" während sie den globalen Automatikmodus aktivieren. Der Testmodus ist aktiv,
wenn das BE Symbol ein kleines 'T' anzeigt. 
Der Einzige Unterschied zum Normalen bieten ist, das das Gebot kurz vor Ablauf der Auktion nicht bestätigt wird.

Die Simulation führt allerdings nicht zur Deaktivierung der Biet-Automatik, da kein "gekaufter" Status simuliert wird.

## eBay Artikel Seite
Beim Ladevorgang der eBay Artikelseite, erweitert BE diese durch einen Knopf, welcher den Automatikmodus für diesen
Artikel aktivieren kann.
Im Hintergrund wird auch das Maximalgebot Eingabefeld überwacht, und dieser Wert gegebenenfalls geprüft und gespeichert. 

{{< image src="features_be_artikelseite.de.gif" alt="Artikelseite" >}}

* Eine Veränderung des Maximalgebots oder der Automatikfunktion werden an die Übersichtsseite weitergeleitet
* Bei Eingabe eines Wertes welcher niedriger als der Minimalerhöhungspreis ist, wird die Eingabe automatisch auf den
  niedrigsten möglichen wert reduziert.
* Bei Eingabe eines Wertes welcher höher als der Sofortkauf Preis liegt, wird die Eingabe automatisch 
  auf den Sofortkaufpreis, **minus 1 Cent** reduziert.
* Der Knopf für den Automatikmodus auf der Artikelseite bezieht sich nur auf den Artikel. Zusätzlich muss auch 
  die Gruppenautomatik und auch der globale Automatikmodus aktiv sein, ansonsten wird der Artikel nicht automatisch
  ersteigert. 

[^1]: Die Erhöhungsschritte können auch bei eBay nachgeschaut werden: https://www.ebay.de/help/buying/bidding/automatisches-bietsystem-bei-ebay-maximalgebot?id=4014 