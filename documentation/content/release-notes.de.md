---
title: "Versions Übersicht"
bookToc: true
weight: 2
type: "docs"
---
# Versions Übersicht

## Biet-O-Matic BE Version 0.5

Diese Version beinhaltet große Änderungen bezüglich des Bietvorgangs, wodurch gemeldete vereinzelt auftretende Bietfehler vermieden werden sollten.
Der Bietvorgang läuft jetzt nicht mehr über die eBay Artikelseite, sondern über die von eBay bereitgestellte "offer.ebay.de" Seite.
Hierbei wird je nach eingestelltem Bietzeitpunkt ungefähr eine Minute vor Auktionsende die "offer.ebay.de" Seite für den Artikel geöffnet.

Weitere größere Änderungen:

- Das Speicherziel kann über einen neuen Konfigurationsparameter zwischen "sync" (Standard) und "local" umgestellt werden
  Der "local" Speicher ermöglicht es deutlich mehr Artikel mit BE zu verwalten (theoretisch über 1000, nicht getestet!),
  dieser unterstützt allerdings nicht die Synchronisation von BE auf mehreren Rechnern bzw. Browsern.
- Die Unterstützung für Gruppen kann über einen neue Konfigurationsparameter deaktiviert werden.
  Dies vereinfacht die Benutzung für Nutzer welche keine Gruppen verwenden.
- Die Artikel können in eine Datei exportiert werden (Backup) und aus dieser auch wieder importiert werden.
- Der Artikel Verkäufer wird nun gespeichert und in der Übersichtstabelle in der Beschreibung angezeigt.
  Wenn die Kompakte Anzeige aktiviert ist, wird der Verkäufer nur angezeigt wenn man mit dem Mauszeiger über der Artikelbeschreibung verweilt.

### Biet-O-Matic BE Version 0.5.3

{{< hint info>}}
Veröffentlicht am Samstag, 19.12.2020
{{< /hint >}}

- Permanente Anzeige des verwendeten Browser Speichers in der Fußzeile der Übersichtsseite hinzugefügt.
- Voreingestellter Bietzeitpunkt von 5s auf 10s geändert, um Probleme mit zu späten Geboten zu verringern.
- Automatische Eingabe bzw. Anpassung des Maximalgebots an den Minimalpreis wurde entfernt.
  Das Artikel-Maximalgebot kann, bzw. muss jetzt frei vom Nutzer eingegeben werden.
- Falsche Darstellung im Zusammenhang mit internationalen Zahlenformaten auf der Artikel-Seite behoben.
- Verbesserungen im Ereignis Protokoll des Artikel-Bietvorgangs, um Probleme besser analysieren zu können.

### Biet-O-Matic BE Version 0.5.2

{{< hint info>}}
Veröffentlicht am Samstag, 24.10.2020
{{< /hint >}}

- Problem mit falschen bzw. fehlenden Einstellungen auf der Artikelseite behoben, wenn der 'local' Modus aktiviert wurde.
- Verbesserung im Build-Prozess der Erweiterung

### Biet-O-Matic BE Version 0.5.1

{{< hint info>}}
Veröffentlicht am Sonntag, 11.10.2020
{{< /hint >}}

- Kleinere Verbesserungen für Firefox Release Vorbereitung

### Biet-O-Matic BE Version 0.5.0

{{< hint info>}}
Veröffentlicht am Samstag, 03.10.2020
{{< /hint >}}

- Bietvorgang komplett neu geschrieben
- Artikel Import/Export Funktionalität hinzugefügt
- Neue Konfigurationsparameter zur Auswahl des Speicherziels:
  - Standard ist wie bisher der "sync" Speicher (100KB, ca. 50 Artikel)
  - Alternativ der "local" Speicher (5MB, > 1000 Artikel)
- Neuer Konfigurationsparameter zum Einstellen des Bietzeitpunktes (Standard fünf (5) Sekunden vor Ablauf der Auktion)
- Artikel Verkäufer wird gespeichert und in der Übersichtstabelle in der Spalte "Beschreibung" angezeigt.
- Keyboard Abkürzungen für Automatikmodus (ALT + a), Einstellungen (ALT + o) und Kompakte Anzeige (ALT + k) hinzugefügt (Chrome Browser)
  Leider verwendet jeder Browser [andere Kombinationen](https://developer.mozilla.org/de/docs/Web/HTML/Globale_Attribute/accesskey).

## Biet-O-Matic BE Version 0.4

Biet-O-Matic steht nun für alle größeren Browser zur Verfügung.

### Biet-O-Matic BE Version 0.4.7

{{< hint info>}}
Veröffentlicht am Dienstag, 03.03.2020
{{< /hint >}}

- Problem beim parsen von Auktions End-Datum im Monat März behoben (nur Deutsch).

### Biet-O-Matic BE Version 0.4.6

{{< hint info>}}
Veröffentlicht am Freitag, 28.02.2020
{{< /hint >}}

- Von der Artikelseite aus wird die Aktivierung des Artikel-Automatikmodus nur zugelassen, wenn BE den Artikel bereits hinzugefügt hat.
  Dies konnte u.U. zum Verlust der Einstellung und damit zu Problemen beim Bieten führen.
- Von der Artikelseite aus können Sie nun die Aktivierung des Artikel-Automatikmodus veranlassen, ohne das Höchstgebot zu definieren.
  Der Preis wird an den zu diesem Zeitpunkt minimal akzeptablen Angebotspreis angepasst.
- Gruppenauswahl verbessert, indem der Filter beim fokussieren zurückgesetzt wird. Dies ermöglicht die Auswahl aller Gruppen.

### Biet-O-Matic BE Version 0.4.5

{{< hint info>}}
Veröffentlicht am Donnerstag, 20.02.2020
{{< /hint >}}

- Minimale Firefox-Version auf 57 angehoben.
- Unterstützung für das Aufräumen von Artikeln hinzugefügt (Besensymbol auf der Übersichtsseite).
- Fehler im Text des Gruppen-Automatikmodus-Knopfes behoben.
- Unterstützung für Statusmeldung bezüglich hinzufügen von Elementen aus der Beobachtungsliste ergänzt.
- Anzeige von Fehlermeldung hinzugefügt, sollte ein Speichervorgang fehlschlagen (z.B. Quota Fehler).
- Option für die Aktivierung der kompakteren Speicherung der Artikel-Informationen hinzugefügt.
  - Durch diese Option können ca. doppelt soviele Artikel mit BE verwaltet werden.
  - siehe [Interne Konfigurationsparameter]({{< ref "/manual#interne-konfigurationsparameter" >}})
- Anzeige des freien Speichers beim Laden der BE Übersichtsseite hinzugefügt.
  - \> 80% gelb, \> 95% rot

### Biet-O-Matic BE Version 0.4.4

{{< hint info>}}
Veröffentlicht am Donnerstag, 13.02.2020
{{< /hint >}}

- Problem bei der Artikel-Feldaktualisierung behoben.
  - Der Artikeltab hat die gespeicherten Informationen verwendet, anstatt die frisch ermittelten.
- Problem beim ermitteln der Auktionszeit behoben, welches die Zeitzonen unterschiede zwischen ebay.de und dem PC des Nutzers nicht berücksichtigte.
  - Gelöst durch Parsen der Auktions Endzeit vom eBay Raptor JS Objekt.
- Zeitpunkt der Gebotabgabe von 2.5s auf 3s vor Auktionsende geändert.
- Refresh der Tabelleninhalte korrigiert.
- Hintergrundaktualisierung der Artikel nochmals geändert.
  - Aktualisierung stündlich wenn Auktionsende > 12 Stunden, ansonsten alle 5min.
  - Aktualisierung erfolgt nun sequentiell anstatt parallel, um Leistungsprobleme zu vermeiden.

### Biet-O-Matic BE Version 0.4.3

{{< hint info>}}
Veröffentlicht am Sonntag, 08.02.2020
{{< /hint >}}

- Funktionalität für hinzufügen von Artikeln aus der eBay Beobachtungsliste hinzugefügt
  - Dadurch werden alle Artikel auf der Beobachtungsliste zu einer BE Gruppe namens "Beobachtete Artikel" hinzugefügt.
  - BE kann keine Elemente aus der eBay-Beobachtungsliste entfernen. Bitte nutzen Sie die eBay-Funktionalität.
- Geändertes Interval für die regelmäßige Prüfung der Uhrzeit von 3 bis 10 Minuten (zufällig).
- Interner Parameter hinzugefügt, um die regelmäßige Prüfung der Uhrzeit auszuschalten.
- Interner Parameter hinzugefügt, um die ebay-Plattform welche für die Synchronisierung der Beobachtungsliste genutzt wird zu überschreiben.
- Unterbinden der Aktualisierung der Übersichtstabelle, wenn der Übersichtsseite oder das Fenster nicht aktiv sind.
- Interval für Hintergrundaktualisierung von Artikeln geändert. Es ist nun abhängig vom Auktionsende des Artikels.
  - Je näher das Ende der Auktion, desto öfter wird die Informationen für den Artikel aktualisiert.
- Wenn die Übersichtsseite aktiviert wird, wird auch die Tabelle aktualisiert.
- Es wurde ein Problem bei der Aktivierung des BE Übersichtsseite behoben. Die Aktivierung konnte manchmal fehlschlagen.

### Biet-O-Matic BE Version 0.4.2

{{< hint info>}}
Erschienen am Sonntag, 02.02.2020
{{< /hint >}}

- Unterstützung zur Ermittlung des Zeitunterschiedes zwischen dem System auf dem BE läuft und dem eBay Server hinzugefügt.
  - BE zeigt eine Warnung auf der Übersichtsseite an, wenn der Zeitunterschied größer als eine Sekunde ist.
- Interne Optionen zur Abschaltung der Hintergrundaktualisierung und Schlafmodus-Verhinderung hinzugefügt
  - Für mehr Informationen siehe auch [Handbuch]({{< relref "/manual#interne-konfigurationsparameter" >}})
- Optimierung der Artikel-Gruppen
  - Gruppen können jetzt ausgewählt werden auch wenn sie gerade hinzugefügt wurden.
  - Gruppen werden nur einmal in der BE Übersichtsseite verwaltet.

### Biet-O-Matic BE Version 0.4.1

{{< hint info>}}
Erschienen am Freitag, 31.01.2020
{{< /hint >}}

- Behebt Problem bzgl. der Speicherverwaltung, welches unter Umständen zu einem Absturz von BE führen kann.
- Behebt Problem bei der Tabverwaltung welches dazu führen konnte das mehrere Artikel aus eine Gruppe ersteigert wurden
  wenn diese zwischen 10s..60s auseinander endeten.

## Biet-O-Matic BE Version 0.3

Diese Version von BE ist die erste, welche mehrsprachig ist. Es wird, nun neben Deutsch, auch eine Englischsprachige
Benutzung ermöglicht. Ausserdem wurde ebay.com Unterstützung getestet und sollte nun problemlos funktionieren.

Weitere größere Änderungen in dieser Version:

- Für geschlossene Artikel (kein Tab offen) wird im Hintergrund jede Minute eine Datenaktualisierung durchgeführt.
  - Die Aktualisierungsvorgang wird visualisiert (drehendes '+')
  - Eine Aktualisierung findet nur statt, wenn für das aktuelle Fenster der Automatikmodus aktiv ist.
- Änderungen an Artikelinformationen werden in der Tabelle farblich (gelb) hervorgehoben.
- Artikel Bilder werden jetzt auf der Übersichtsseite angezeigt
- Option für kompakte Anzeige hinzugefügt, dies blendet Bilder aus und macht die Tabellenzeilen etwas schmaler.
- Unterstützung für Englisch hinzugefügt.
  - Die Sprache wird automatisch über die Browser Anzeigesprache festgelegt.
- Artikel Gruppen Feld erlaubt jetzt Auswahl aus bereits existierenden Gruppen.
- Unbenutzte Artikel Gruppen werden nach 7 Tagen automatisch gelöscht.
- Die BE Übersichtsseite öffnet sich nach einem Update automatisch, aber nur,
  wenn der Automatikmodus für das Fenster vor dem Update aktiv war.
  Dies stellt sicher, dass in Abwesenheit weiterhin automatisch geboten werden kann, nachdem ein BE Update statt fand.
- Biet-Sperre wurde eingeführt, um sicherzustellen, das nicht mehrere Artikel aus einer Gruppe ersteigert werden,
  wenn die Auktionen dicht beieinander enden (10s), siehe auch [Funktionen]({{< relref "/manual/features#vermeidung-von-doppelkufen-auktions-kollosion" >}})
- Wenn der Browser es unterstützt, wird BE verhindern, dass der Computer in den Schlafmodus wechselt. Aber nur wenn die Biet-Automatik aktiv ist.

### Biet-O-Matic BE Version 0.3.4

{{< hint info>}}
Erschienen am Dienstag, 27.01.2020
{{< /hint >}}

- Fügt die Möglichkeit hinzu, alle Artikel aus einer Gruppe zu ersteigern.
  Der Standard bleibt weiterhin das pro Gruppe ein Artikel ersteigert wird.
- Ändert den Voreinstellung für Gruppen Automatikmodus auf "Aktiv"
- Behebt flackern des Gruppen Automatikmodus
- Behebt ein Problem beim Öffnen der BE übersichtsseite, welches dazu führte,
  dass mehrere Übersichtsseiten zur gleichen Zeit offen sein konnten.

### Biet-O-Matic BE Version 0.3.3

{{< hint info>}}
Erschienen am Dienstag, 21.01.2020
{{< /hint >}}

- Behebt Problem beim öffnen der BE Übersichtsseite. Diese konnte u.U. mehrfach geöffnet werden.
- Behebt Problem mit flackern des Knopfes für den Gruppen Automatikmodus
- Dokumentation aktualisert, Schnellstart Anleitung hinzugefügt

### Biet-O-Matic BE Version 0.3.2

{{< hint info>}}
Erschienen am Sonntag, 19.01.2020
{{< /hint >}}

- Erste stabile 0.3 Version (für die wichtigsten Änderungen, siehe oben)
- Kleinere Anpassungen:
  - Anzeige der Zahlungsmethoden auf der Übersichtsseite, wenn man mit der Maus über die Preisspalte geht
  - "Keine Gruppe" umbenannt in "Sonstige Auktionen"
  - "Sonstige Auktionen" Gruppe wird vorne einsortiert
  - Maximal-Gebot kann nun gelöscht werden und wird auf 0 gesetzt, anstatt immer auf das Minimalgebot zu springen.
  - Problem behoben wenn ein Artikel Tab geschlossen wurde, und dann wieder hergestellt.

## Biet-O-Matic BE Version 0.2

Dieser Versionszweig hat mit der vorhergehenden Version nicht mehr viel gemeinsam. Sowohl der Quellcode, als auch die
Nutzung der BE wurde erneuert.

Hervozuheben sind besonders folgende Änderungen:

- Unterstüztung von Biet-Gruppen:  
  - Artikel können jetzt in Gruppen untergliedert werden. Hierzu wurde einen neue Spalte in die Artikel Tabelle der
    BE Übersichtsseite hinzugefügt. Hier kann jetzt ein beliebiger Name eingegeben werden um Ordnung in die
    verschiedenen Artikel zu bringen.
  - Jede Gruppe verfügt über einen eigenen "Automatikmodus"-Schalter. Dieser muss zusätzlich zum Artikel- und
    Fensterschalter aktiv sein, damit BE für Artikel aus der Gruppe automatisch bietet.
  - Der Gruppen Schalter lässt sich durch Maus-Klick auf die Gruppenzeile an- oder ausschalten.
- Tab Verwaltung:
  - Tabs können jetzt über ein neues Symbol in der Übersichtsseite vom Benutzer geschlossen und wieder geöffnet werden.
  - BE öffnet Artikel Tabs automatisch 60 Sekunden vor Auktionsende, falls die Automatik-Funktion für diesen Artikel
    aktiviert ist (Fenster+Gruppe+Artikel).
- Sitzungssynchonisation:
  - BE speichert Informationen zentral[^1] so, daß es auf diese wieder von jedem anderen Rechner wieder zugreifen kann.
  - Eingegebene Maximal Gebote, Gruppenzugehörigkeit oder Automatikmodus Einstellungen (Artikel und Gruppe) werden
      ebenfalls gespeichert
  - Es kann nur ein Browser-Fenster den Automatikmodus zur gleichen Zeit aktiv halten.
     Sobald im aktuellen Fenster der Automatikmodus aktiviert wird, deaktiviert er sich in anderen Fenstern - auch auf
     anderen Rechnern.
- Erweiterte Ereignisprotokollierung:
  - BE sichert nun zusätzlich zu den Biet-Ereignissen auch Änderungen an Artikel Parametern. Biespielsweise wird ein
    Protokoll angelegt, falls sich der Artikelpreis aktualisiert hat, oder auch das Maximalgebot vom Nutzer geändert wurde.
- Anpassung der Handhabung von Artikeln welche nah beeinander enden:
  - Es wird nun sichergestellt, das Auktionen innerhalb der gleichen Gruppe immer mindestens 15 Sekunden auseinander
    liegen. Es muss allerdings noch ausgetestet werden ob dies ausreicht, oder aber auch zu viel sein könnte.
- Verknüpfung zur Spenden Seite
  - Um zu sicher zu stellen, dass B-O-M BE auch in Zukunft gepflegt und erweitert wird, ist nun die Spendenmöglichkeit
    integriert. Aktuell ist dies durch die GitHub-Plattform möglich, wo verschiedene Spendenhöhen möglich sind.

### Biet-O-Matic BE Version 0.2.2

{{< hint info>}}
Erschienen am Montag, 06.01.2020
{{< /hint >}}

- Erste stabile 0.2 Version

## Biet-O-Matic BE Version 0.1

Hierbei handelt es sich um die ersten Prototyp Versionen, welche im Dezember 2019 erschienen sind. Diese Versionen
wurden nur einem eingeschränkten Nutzerkreis zur Verfügung gestellt um erste Meinungen und Testerfahrungen einzusammeln
und für die erste stabile Version aufzubereiten.

Diese Version erforderte noch, daß Artikel Tabs offen gehalten wurden, damit darauf geboten werden konnte.
Davon abgesehen, konnten mit dieser Version bereits erste Biet-Erfolge vermeldet werden.

[^1]: Diese Funktion erfordert, dass im Browser die Sitzungs Synchroniserung (mit Account) aktiviert ist.
Ansonsten werden die BE Informationen nicht auf anderen Browsern verfügbar sein.
