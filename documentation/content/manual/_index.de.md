---
title: "Handbuch"
bookToc: true
weight: 1
type: "docs"
---

# Handbuch

## Voraussetzungen

### Unterstützte eBay Plattformen
Es werden nur www.ebay.de und www.ebay.com unterstützt.

### Genaue System Uhr
BE verwendet die Systemuhr, um Aufgaben zu gewissen Zeitpunkte auszuführen. Besonders wichtig ist es natürlich,
das das Maximal Gebot bei eBay eingeht, bevor die Auktion endet - und auf der anderen Seite auch nicht zu früh - damit 
nicht andere Bieter sich eine Gebot-Schlacht liefern. 

Von daher stellen sie bitte sicher das ihr PC die Zeit automatisch mit der Internet Zeit synchronisiert. Seit Windows
7 ist diese Funktion übrigens eingebaut und standardmäßig aktiv. Allerdings kann es vorkommen das das voreingestellte
Interval nicht ausreicht (beispielsweise bei einem ungenauen Zeitgeber der Hardware) und hier eine Anpassung nötig ist.

BE hat übrigens keine technische Möglichkeit die Zeit selbständig zu korrigieren - hierzu fehlen im Browser die
Berechtigungen. 

### Deaktiviere Computer-Standby
Wenn BE automatisch auf Auktionen bieten soll, ist es wichtig, dass der Computer, der das Gebot abgeben soll aktiv ist.
Einige Computer gehen automatisch in den Ruhezustand, wenn sie "inaktiv" sind, also überprüfen Sie bitte Ihre Computer
Einstellungen. BE verfügt über keine technischen Möglichkeiten, den Computer aus dem Schlafmodus aufzuwecken.

Bei einigen Browsern wird BE versuchen, den Ruhezustand des Computers zu verhindern,
am sichersten ist es jedoch, den Computer entsprechend zu konfigurieren.

## Erweiterungs Verwaltung 
### Installation
Die Installation der BE erfolgt über den Browser Erweiterungs Store. Hierbei ist nichts spezielles zu beachten.

### Update
Das Update der BE erfolgt automatisch über den Browser. Ein Browserneustart ist zum aktivieren des Updates *nicht* 
erforderlich. 

> Wenn vor dem Update der globale Automatikmodus in einem Fenster aktiv war, wird nach dem Update BE wieder automatisch
> gestartet, damit weiter automatisch geboten werden kann.

### Deinstallation
Die Deinstallation der BE erolgt über den Browser. Beim löschen der BE werden auch die gespeicherten Daten gelöscht.

## Bedienung
Siehe Abschnitt [Funktionen]({{< ref "/manual/features" >}})

## Gespeicherte Daten
### Artikel Informationen
* Informationen über Artikel werden im `browser.sync.storage` gesichert, sobald der Benutzer ein Maximal Gebot oder Gruppe für
diesen Artikel eingibt.
* Die Informationen stehen auch auf anderen (eigenen) Rechnern zur Verfügung, falls der Benutzer die Sitzungs Synchronisation
aktiviert hat.

### Ereignis Protokolle 
* Ereignis Protokolle werden im `window.localStorage` gesichert sobald relevante Ereignisse eintreffen
* Artikel Biet-Ereignis Protokolle enthalten Informationen über den Artikel und helfen dem Nutzer, aber auch dem
Hersteller dabei Probleme zu prüfen.
* Artikel Informations Ereignisse werden erstellt, sobald sich Informationen bezüglich eines Artikels geändert haben.
* Einstellungsänderungs Ereignisse werden erstellt, falls sich eine Einstellung (z.B. Automatikmodus) geändert hat.

{{< hint info >}}
Sämtliche Protokolle werden nur lokal gespeichert und nicht synchronisiert
{{< /hint >}}

## Datenexport
Ein Datenexport zur Sicherung oder Archivierung ist aktuell noch nicht eingebaut.
Es ist aber möglich, dieses über die Erweiterung "Storage Area Explorer" durchzuführen.

> Zur Analyse von Problemen kann es hilfreich sein, diese Daten zur Analyse zu exportieren und in der Support-Anfrage
> zu übermitteln.

{{< image src="be_export.de.png" alt="Daten Sicherung" >}}