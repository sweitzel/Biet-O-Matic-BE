---
title: "Versions Übersicht"
bookToc: true
weight: 2
type: "docs"
---

# Versions Übersicht
## Biet-O-Matic BE Version 0.2
Dieser Versionszweig hat mit der vorhergehenden Version nicht mehr viel gemeinsam. Sowohl der Quellcode, als auch die
Nutzung der BE wurde erneuert.

Hervozuheben sind besonders folgende Änderungen:

* Unterstüztung von Biet-Gruppen:  
    * Artikel können jetzt in Gruppen untergliedert werden. Hierzu wurde einen neue Spalte in die Artikel Tabelle der
    BE Übersichtsseite hinzugefügt. Hier kann jetzt ein beliebiger Name eingegeben werden um Ordnung in die 
    verschiedenen Artikel zu bringen.
    * Jede Gruppe verfügt über einen eigenen "Automatikmodus"-Schalter. Dieser muss zusätzlich zum Artikel- und 
    Fensterschalter aktiv sein, damit BE für Artikel aus der Gruppe automatisch bietet.
    * Der Gruppen Schalter lässt sich durch Maus-Klick auf die Gruppenzeile an- oder ausschalten. 
* Tab Verwaltung:
    * Tabs können jetzt über ein neues Symbol in der Übersichtsseite vom Benutzer geschlossen und wieder geöffnet werden.
    * BE öffnet Artikel Tabs automatisch 60 Sekunden vor Auktionsende, falls die Automatik-Funktion für diesen Artikel
    aktiviert ist (Fenster+Gruppe+Artikel).
* Sitzungssynchonisation:
    * BE speichert Informationen zentral[^1] so, daß es auf diese wieder von jedem anderen Rechner wieder zugreifen kann.
    * Eingegebene Maximal Gebote, Gruppenzugehörigkeit oder Automatikmodus Einstellungen (Artikel und Gruppe) werden
      ebenfalls gespeichert
    * Es kann nur ein Browser-Fenster den Automatikmodus zur gleichen Zeit aktiv halten.
     Sobald im aktuellen Fenster der Automatikmodus aktiviert wird, deaktiviert er sich in anderen Fenstern - auch auf
     anderen Rechnern.
* Erweiterte Ereignisprotokollierung:
    * BE sichert nun zusätzlich zu den Biet-Ereignissen auch Änderungen an Artikel Parametern. Biespielsweise wird ein
    Protokoll angelegt, falls sich der Artikelpreis aktualisiert hat, oder auch das Maximalgebot vom Nutzer geändert wurde.
* Anpassung der Handhabung von Artikeln welche nah beeinander enden:
    * Es wird nun sichergestellt, das Auktionen innerhalb der gleichen Gruppe immer mindestens 15 Sekunden auseinander
    liegen. Es muss allerdings noch ausgetestet werden ob dies ausreicht, oder aber auch zu viel sein könnte.
* Verknüpfung zur Spenden Seite
    * Um zu sicher zu stellen, dass B-O-M BE auch in Zukunft gepflegt und erweitert wird, ist nun die Spendenmöglichkeit
    integriert. Aktuell ist dies durch die GitHub-Plattform möglich, wo verschiedene Spendenhöhen möglich sind.
     
### Biet-O-Matic BE Version 0.2.1
{{< hint info>}}
Erschienen am Montag, 06.01.2020 
{{< /hint >}} 

## Biet-O-Matic BE Version 0.1
Hierbei handelt es sich um die ersten Prototyp Versionen, welche im Dezember 2019 erschienen sind. Diese Versionen
wurden nur einem eingeschränkten Nutzerkreis zur Verfügung gestellt um erste Meinungen und Testerfahrungen einzusammeln
und für die erste stabile Version aufzubereiten.

Diese Version erforderte noch, daß Artikel Tabs offen gehalten wurden, damit darauf geboten werden konnte.
Davon abgesehen, konnten mit dieser Version bereits erste Biet-Erfolge vermeldet werden.

[^1]: Diese Funktion erfordert, dass im Browser die Sitzungs Synchroniserung (mit Account) aktiviert ist.
Ansonsten werden die BE Informationen nicht auf anderen Browsern verfügbar sein.