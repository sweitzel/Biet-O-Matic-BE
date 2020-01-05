---
title: "Handbuch"
bookToc: true
weight: 1
type: "docs"
---

# Handbuch

## Erweiterungs Verwaltung 
### Installation
Die Installation der BE erfolgt über den Browser Erweiterungs Store. Hierbei ist nichts spezielles zu beachten.

### Update
Das Update der BE erfolgt automatisch über den Browser. Ein Browserneustart ist zum aktivieren des Updates *nicht* 
erforderlich.

### Deinstallation
Die Deinstallation der BE erolgt über den Browser. Beim löschen der BE werden auch die gespeicherten Daten gelöscht.

# Bedienung
Siehe Abschnitt [Funktionen]({{< ref "/manual/features" >}})

# Gespeicherte Daten
## Artikel Informationen
* Informationen über Artikel werden im `browser.sync.storage` gesichert, sobald der Benutzer ein Maximal Gebot oder Gruppe für
diesen Artikel eingibt.
* Die Informationen stehen auch auf anderen (eigenen) Rechnern zur Verfügung, falls der Benutzer die Sitzungs Synchronisation
aktiviert hat.

## Ereignis Protokolle 
* Ereignis Protokolle werden im `window.localStorage` gesichert sobald relevante Ereignisse eintreffen
* Artikel Biet-Ereignis Protokolle enthalten Informationen über den Artikel und helfen dem Nutzer, aber auch dem
Hersteller dabei Probleme zu prüfen.
* Artikel Informations Ereignisse werden erstellt, sobald sich Informationen bezüglich eines Artikels geändert haben.
* Einstellungs Änderungs Ereignisse werden erstellt, falls sich eine Einstellung (z.B. Automatikmodus) geändert hat.

{{< hint info >}}
Sämtliche Protokolle werden nur lokal gespeichert und nicht synchronisiert
{{< /hint >}}

# Daten Export
Ein Datenexport zur Sicherung oder Archivierung ist aktuell noch nicht eingebaut.
Es ist aber möglich, dieses über die Erweiterung "Storage Area Explorer" durchzuführen.

Zur Analyse von Problemen kann es hilfreich sein diese Daten zur Analyse zu exportieren manuell in der Support-Anfrage
zu übermitteln.

{{< image src="be_export.de.png" alt="Daten Sicherung" >}}