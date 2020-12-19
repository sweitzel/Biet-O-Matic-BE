---
title: "Handbuch"
bookToc: true
weight: 1
type: "docs"
---

# Handbuch

## Schnellstart

Nachdem Biet-O-Matic BE (im folgenden nur BE genannt) zum Browser hinzugefügt wurde, ist es auch direkt ohne weitere Konfiguration einsatzbereit.
Es muss nur sichergestellt sein, das sie bereits an der eBay Plattform angemeldet sind.
Die Anmeldung bei eBay wird nicht durch BE durchgeführt.

- Öffnen Sie BE, in dem sie das BE Symbol (Auktionshammer auf gelbem Hintergrund) aktivieren.
  - Das Symbol befindet sich überlicherweise sichtbar in der Browser Menüleiste, in der sich auch die Addresseingabe befindet.
- Die BE Übersichtsseite öffnet sich "angeheftet" ganz links in der Übersicht der geöffneten Tabs
  - Das angeheftete Symbol beinhaltet ein weißes 'B' auf rotem Hintergrund, wenn der Biet-Automatikmodus für das aktuelle Fenster inaktiv ist,
  - bzw. ein weißes 'B' auf grünem Hintergrund, wenn der Biet-Automatikmodus für das Fenster aktiviert ist.
  - Hinweis: Die Übersichtsseite muss geöffnet bleiben, damit das automatische Bieten funktioniert.
- Öffnen sie einen eBay Artikel in einem neuen Browser Tab
  - Sie können direkt auf der Artikelseite ein Maximalgebot definieren. Hierdurch bleibt der Artikel auch gespeichert
    und in der Übersichtstabelle erhalten, selbst wenn der Artikel Tab geschlossen wird.
  - Alternativ können sie die Parameter für den Artikel auch auf der BE Übersichtsseite festegen:
    - Artikel Gruppe: Verschiebt den Artikel in eine von ihnen festgelegte Gruppe.
    - Artikel Maximalgebot: Definiert das Maximalgebot, welches für den Artikel kurz vor Ende der Auktion durch BE abgegeben wird.
    - Artikel Automatikmodus: Aktiviert den Automatikmodus für den Artikel.
      Wenn dieser inaktiv ist, wird BE kein automatisches Gebot für diesen Artikel abgeben.
- Damit ein Artikel ersteigert wird, muss ein Maximalgebot eingegeben worden sein und der Artikel Automatikmodus aktiv sein.

Ausserdem müssen der Gruppen-Automatikmodus, und der Automatikmodus für das Fenster aktiv sein:

### Gruppen Automatikmodus

Der Benutzer kann pro Artikelgruppe festlegen, ob Artikel aus dieser Gruppe automatisch ersteigert werden sollen.
Die Grupppenautomatik ist standardmäßig *aktiv*.

{{< hint info >}}
Sollte die Gruppen-Funktionalität nicht benötigt werden,
kann diese über einen Konfigurations-Parameter ([siehe hier](#interne-konfigurationsparameter)) komplett deaktiviert werden.
{{< /hint >}}

### Fenster Automatikmodus

Der globale, oder auch Fenster-Automatikmodus legt übergeordnet fest, ob BE Artikel überhaupt automatisch ersteigern soll.
Dies ist quasi ein "Not-Aus" Schalter, durch den sicher gestellt werden kann, das nicht unbeabsichtigt auf Auktionen geboten wird.

> Es kann immer nur ein Fenster den Automatikmodus aktivieren.
> BE deaktiviert den Automatikmodus selbständig in anderen Fenstern wenn der Nutzer ihn im aktuellen Fenster aktiviert.

Dadurch ist auch die Unterstützung von mehreren Rechnern gewährleistet. Sie können also BE auf verschiedenen Rechnern
offen haben (um z.B. Maximalgebote zu korrigieren), aber nur einer der Rechner wird automatisch Gebote abgeben.

Für mehr Informationen schauen sie sich bitte auch die Funktions-Dokumentation an (siehe Menü links).

## Voraussetzungen

### Unterstützte eBay Plattformen

{{< hint info >}}
Es werden nur die Platformen ebay.de und ebay.com unterstützt.
Wenn der Browser auf Deutsch eingestellt ist, wird automatisch ebay.de als Plattform verwendet.
Für alle anderen Sprachen wird ebay.com verwendet.
{{< /hint >}}

Wenn sie jedoch aus einem anderen Land stammen, und trotzdem Biet-O-Matic BE nutzen wollen ist dies möglich:
Sie können über ebay.com nationale und internationale Einkäufe tätigen.

Da BE keine Anmeldung an eBay ausführt, stellen sie sicher, das sie sich einmal per Hand auf einer eBay Seite angemeldet haben.

### Genaue System Uhr

BE verwendet die Systemuhr, um Aufgaben zu gewissen Zeitpunkte auszuführen.
Besonders wichtig ist es natürlich, das das Maximal Gebot bei eBay eingeht,
bevor die Auktion endet - und auf der anderen Seite auch nicht zu früh abgegeben wird - damit nicht andere Bieter noch eine Gebot-Schlacht auslösen.

Von daher stellen sie bitte sicher das ihr PC die Zeit automatisch mit der Internet Zeit synchronisiert.
Seit Windows 7 ist diese Funktion übrigens eingebaut und standardmäßig aktiv.
Allerdings kann es vorkommen, dass das voreingestellte Interval nicht ausreicht (beispielsweise bei einem ungenauen Zeitgeber der Hardware) und hier eine Anpassung nötig ist.

BE hat übrigens keine technische Möglichkeit die Zeit selbständig zu korrigieren - hierzu fehlen im Browser die Berechtigungen.
Es wird jedoch eine Warnung ausgegeben, sollte die Systemzeit mehr als eine Sekunde von der ebay-Zeit abweichen.

Möglichkeiten zur Zeitkorrektur:

- Registry Einstellung ändern damit der Zeit-Sync öfter passiert.
- Windows Tool: [https://www.timesynctool.com/](https://www.timesynctool.com/)

{{< hint info >}}
Sollte die Computer Uhr nachgehen, beispielsweise um "-2.00s", dann führt dies mit hoher Wahrscheinlichkeit dazu,
dass das von BE abgegebene Gebot zu spät abgegeben wird und nicht registriert wird.
{{< /hint >}}

### Verhinderung des Computer-Schlafmodus

Wenn BE automatisch auf Auktionen bieten soll, ist es wichtig, dass der Computer, der das Gebot abgeben soll aktiv ist.
Einige Computer gehen automatisch in den Schlafmodus, wenn sie "inaktiv" sind.
Bitte überprüfen Sie Ihre Computer Einstellungen.
BE verfügt über keine technischen Möglichkeiten, den Computer aus dem Schlafmodus aufzuwecken.

Bei einigen Browsern wird BE versuchen, den Ruhezustand des Computers zu verhindern, am sichersten ist es jedoch, den Computer entsprechend zu konfigurieren.
Sie können diese "Verhinderung des Ruhezustands" auch in den internen Optionen von BE deaktivieren.

{{< hint info >}}
Die Benutzer von Bildschirmschonern, das Ausschalten des Monitors oder auch das Sperren des Betriebssystems sind kein Problem.
BE's Biet-Prozess kann funktioniert unabhängig davon - solange sichergestellt ist das der Rechner weiterläuft.
{{< /hint >}}

### Verhindern das der Browser BE einfriert

Sowohl Microsoft Edge, Chrome und Firefox haben Mechanismen zum Stromsparen integriert.
Dies kann dazu führen, dass Browser Tabs eingefroren (Tab Freezing) oder entladen (Tab Discarding) werden.

Die Auswirkung davon sind verspätete oder verpasste "Timer" (Wecker), was zu verpasste eBay Auktionen führen kann.
Sollte dies auftreten, gibt es im entsprechenden Artikel-Bietlog eine Fehlermeldung.

Je nach Browser sind als Beispiel folgende Einstellungen relevant:

Edge:

- Falls im Edge Browser der Tab Schlafmodus aktiviert ist, sollte die URL der BE blockiert werden,
  so dass diese keinesfalls schlafen geschickt wird.
- [edge://settings/system](Never put these sites to sleep)

Chrome:
Firefox:

## Erweiterungs Verwaltung

### Installation

Die Installation der BE erfolgt über den Browser Erweiterungs Store.
Hierbei ist nichts spezielles zu beachten.

### Update

Das Update der BE erfolgt automatisch über den Browser.
Ein Browserneustart ist zum aktivieren des Updates *nicht- erforderlich.

> Wenn vor dem Update der globale Automatikmodus in einem Fenster aktiv war, wird nach dem Update BE wieder automatisch
> gestartet, damit weiter automatisch geboten wird.

### Deinstallation

Die Deinstallation der BE erolgt über den Browser.
Standardmäßig speichert BE im "sync" Speicher, dieser wird bei der Deinstallation der BE nicht immer automatisch gelöscht.
Sollte der optionale "local" Speicher verwendet werden, wird dieser bei der deinstallation gelöscht.

## Bedienung

Siehe Abschnitt [Funktionen]({{< ref "/manual/features" >}})

## Gespeicherte Daten

### Artikel Informationen

- Sobald sie ein Maximal-Gebot oder eine Gruppe für einen Artikel festlegen, wird dieser gespeichert.
- In der BE Standard-Konfiguration werden Artikel im Speicherbereich `browser.storage.sync` ("sync" Speicher) gesichert.
  Dieser ist auf eine Größe von 100KB festgelegt, wodurch ca. 50-60 Artikel insgesamt gespeichert werden können.
  Hierbei stehen die gespeicherten Informationen auch auf anderen (eigenen) Rechnern zur Verfügung,
  falls der Benutzer die Sitzungs Synchronisation aktiviert hat.
- Alternativ kann auch der `browser.storage.local` ("local" Speicher) verwendet werden (siehe [hier](#interne-konfigurationsparameter)).
  Dieser ist auf eine Größe von 5MB festgelegt, wodurch theoretisch über 1000 Artikel gespeichert werden können.

### Ereignisprotokolle

- Ereignis-Protokolle werden im `window.localStorage` gesichert sobald relevante Ereignisse eintreffen.
- Artikel Biet-Ereignisprotokolle enthalten Informationen über den Artikel und helfen dem Nutzer, aber auch dem Hersteller dabei Probleme zu prüfen.
- Artikel Informations Ereignisse werden erstellt, sobald sich Informationen bezüglich eines Artikels geändert haben.
- Einstellungsänderungs-Ereignisse werden erstellt, falls sich eine Einstellung (z.B. Automatikmodus) geändert hat.

{{< hint info >}}
Sämtliche Ereignis-Protokolle werden nur lokal gespeichert und nicht exportiert oder synchronisiert.
{{< /hint >}}

## Datenexport / Import

- Die gespeicherten Artikel können über die eingebaute Export Funktion in eine Datei gespeichert werden.
- Die Daten können auch aus diesen Dateien wieder importiert werden.
  Hierbei werden bereits vorhandende Informationen überschrieben.

## Interne Konfigurationsparameter

> Interne Parameter sollten üblicherweise nur verstellt werden, falls Probleme auftauchen.

Durch Klick mit der rechten Maustaste auf das BE Symbol und Aufruf des Menüpunktes
"Optionen" (Chrome/IE) bzw. "Erweiterung verwalten (Firefox)" erreichen sie die internen Parameter von BE.

Aktuell gibt es folgende Parameter (Seite aktuell nicht übersetzt):

- "Do not prevent system from sleeping"
  - Wenn aktiviert, wird BE angewiesen den PC nicht am Wechsel in den Schlafmodus zu hindern.
  - Bitte denken sie daran, das BE Gebote nur automatisch abgeben kann, wenn der Computer läuft.
- "Disable background-refresh of closed Items"
  - Wenn aktiviert, wird BE Informationen für Artikel, welche aktuell nicht in einem Tab offen sind, nicht automatisch aktualisieren.
  - Hinweis: Falls BE über lange Zeit unbeaufsichtigt laufen soll, kann diese Option helfen Abstürze / Hänger zu verhindern.
- "Disable regular clock check"
  - Wenn aktiviert, führt BE keine regelmäßige Überprüfung der Uhrzeit ihres Systems gegen die eBay-Zeit durch.
- "Disable Groups"
  - Wenn aktiviert, wird die Funktionalität zur Gruppenverwaltung deaktivert.
    Wenn keine Gruppen benötigt werden, wird somit die Benutzeroberfläche einfacher bedienbar.
- "Enable Compact Saving"
  - Wenn aktiviert, speichert BE den Auktionsstatus als Text statt als HTML.
    Dies sieht zwar nicht ganz so hübsch in der Tabelle aus, benötigt aber deutlich weniger Speicher,
    so dass ungefähr doppelt soviele Artikel in BE verwaltet werden können.
- "Enable local mode"
  - Wenn aktiviert, speichert BE Artikel im ["local" Speicher](#artikel-informationen).
    Dadurch kann BE theoretisch über 1000 Artikel speichern,
    jedoch werden die Informationen dann nicht mehr zwischen mehreren Rechnern/Browsern synchronisiert.
- "Override eBay Platform"
  - Dies ist nur für die Synchronisation der Beobachtungsliste relevant.
  - Standardmäßig verwendet BE ebay.de wenn der Browser auf deutsche Benutzersprache eingstellt ist.  
- "Bid time"
  - Erlaubt die Anpassung der Zeit zur Gebotsabgabe.
    In der Standardeinstellung wird BE das Gebot fünf (5) Sekunden vor Ablauf der Auktion absenden.
