---
title: "Handbuch"
bookToc: true
weight: 1
type: "docs"
---

# Handbuch

## Schnellstart

Nachdem Biet-O-Matic BE (im folgenden nur BE genannt) zum Browser hinzugefügt wurde,
ist es auch direkt ohne weitere Konfiguration einsatzbereit. Es muss nur sichergestellt sein, das sie bereits an der 
eBay Plattform angemeldet sind. Die Anmeldung bei eBay wird nicht durch BE durchgeführt.

* Öffnen Sie BE, in dem sie das BE Symbol (Auktionshammer auf gelbem Hintergrund) aktivieren.
    * Das Symbol befindet sich überlicherweise sichtbar in der Browser Menüleiste, in der sich auch die Addresseingabe befindet.
* Die BE Übersichtsseite öffnet sich "angeheftet" ganz links in der Übersicht der geöffneten Tabs
    * Das angeheftete Symbol beinhaltet ein weißes 'B' auf rotem Hintergrund, wenn der Biet-Automatikmodus für das aktuelle Fenster inaktiv ist,
    * bzw. ein weißes 'B' auf grünem Hintergrund, wenn der Biet-Automatikmodus für das Fenster aktiviert ist.
    * Hinweis: Die Übersichtsseite muss geöffnet bleiben, damit das automatische Bieten funktioniert.
* Öffnen sie einen eBay Artikel in einem neuen Browser Tab
    * Sie können direkt auf der Artikelseite ein Maximalgebot definieren. Hierdurch bleibt der Artikel auch gespeichert
      und in der Übersichtstabelle erhalten, selbst wenn der Artikel Tab geschlossen wird.
    * Oder sie legen die Parameter für den Artikel auf der BE Übersichtsseite fest:
        * Artikel Gruppe: Verschiebt den Artikel in eine von ihnen festgelegte Gruppe.
        * Artikel Maximalgebot: Definiert das Maximalgebot, welches für den Artikel kurz vor Ende der Auktion durch BE abgegeben wird.
        * Artikel Automatikmodus: Aktiviert den Automatikmodus für den Artikel. Wenn dieser inaktiv ist, wird BE kein automatisches Gebot für diesen Artikel abgeben.
* Damit ein Artikel ersteigert wird, muss ein Maximalgebot eingegeben worden sein und der Artikel Automatikmodus aktiv sein.

Ausserdem müssen der Gruppen-Automatikmodus, und der Automatikmodus für das Fenster aktiv sein:

### Gruppen Automatikmodus
Der Benutzer kann pro Artikelgruppe festlegen, ob Artikel aus dieser Gruppe automatisch ersteigert werden sollen.
Die Grupppenautomatik ist standardmäßig inaktiv, und muss für jede gewünschte Gruppe per Mausklick auf den Gruppen Automatikmodus Knopf aktiviert werden.

### Fenster Automatikmodus
Der globale, oder auch Fenster-Automatikmodus legt übergeordnet fest, ob BE Artikel überhaupt automatisch ersteigern soll.
Dies ist quasi ein "Not-Aus" Schalter, durch den sicher gestellt werden kann, das nicht unbeabsichtigt auf Auktionen
geboten wird.

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

Da BE keine Anmeldung an eBay ausführt, stellen sie sicher, das sie sich einmal per Hand auf einer eBay Seite angemeldet
haben.

### Genaue System Uhr
BE verwendet die Systemuhr, um Aufgaben zu gewissen Zeitpunkte auszuführen. Besonders wichtig ist es natürlich,
das das Maximal Gebot bei eBay eingeht, bevor die Auktion endet - und auf der anderen Seite auch nicht zu früh
abgegeben wird - damit nicht andere Bieter noch eine Gebot-Schlacht auslösen.

Von daher stellen sie bitte sicher das ihr PC die Zeit automatisch mit der Internet Zeit synchronisiert. Seit Windows
7 ist diese Funktion übrigens eingebaut und standardmäßig aktiv. Allerdings kann es vorkommen das das voreingestellte
Interval nicht ausreicht (beispielsweise bei einem ungenauen Zeitgeber der Hardware) und hier eine Anpassung nötig ist.

BE hat übrigens keine technische Möglichkeit die Zeit selbständig zu korrigieren - hierzu fehlen im Browser die
Berechtigungen. Es wird jedoch eine Warnung ausgegeben, sollte die Systemzeit mehr als eine Sekunde von der ebay-Zeit
abweichen.

Möglichkeiten zur Zeitkorrektur:
* Registry Einstellung ändern: 
* Windows Tool: http://www.timesynctool.com/

{{< hint info >}}
Sollte die Computer Uhr nachgehen, beispielsweise "-2.00s", dann führt dies mit hoher Wahrscheinlichkeit dazu,
dass das von BE abgegebene Gebot zu spät abgegeben wird und nich registriert wird. 
{{< /hint >}}

### Verhinderung des Computer-Schlafmodus
Wenn BE automatisch auf Auktionen bieten soll, ist es wichtig, dass der Computer, der das Gebot abgeben soll aktiv ist.
Einige Computer gehen automatisch in den Schlafmodus, wenn sie "inaktiv" sind. Bitte überprüfen Sie Ihre Computer
Einstellungen. BE verfügt über keine technischen Möglichkeiten, den Computer aus dem Schlafmodus aufzuwecken.

Bei einigen Browsern wird BE versuchen, den Ruhezustand des Computers zu verhindern,
am sichersten ist es jedoch, den Computer entsprechend zu konfigurieren.
Sie können dies jedoch in den internen Optionen von BE deaktivieren.

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

### Ereignisprotokolle 
* Ereignis Protokolle werden im `window.localStorage` gesichert sobald relevante Ereignisse eintreffen
* Artikel Biet-Ereignisprotokolle enthalten Informationen über den Artikel und helfen dem Nutzer, aber auch dem
Hersteller dabei Probleme zu prüfen.
* Artikel Informations Ereignisse werden erstellt, sobald sich Informationen bezüglich eines Artikels geändert haben.
* Einstellungsänderungs-Ereignisse werden erstellt, falls sich eine Einstellung (z.B. Automatikmodus) geändert hat.

{{< hint info >}}
Sämtliche Protokolle werden nur lokal gespeichert und nicht synchronisiert
{{< /hint >}}

## Datenexport
Ein Datenexport zur Sicherung oder Archivierung ist aktuell noch nicht eingebaut.
Es ist aber möglich, dieses über die Erweiterung "Storage Area Explorer" durchzuführen.

> Zur Analyse von Problemen kann es hilfreich sein, diese Daten zur Analyse zu exportieren und in der Support-Anfrage
> zu übermitteln.

{{< image src="/be_export.de.png" alt="Daten Sicherung" >}}

## Interne Konfigurationsparameter

> Interne Parameter sollten üblicherweise nur verstellt werden, falls Probleme auftauchen.

Durch Klick mit der rechten Maustaste auf das BE Symbol und Aufruf des Menüpunktes
"Optionen" (Chrome/IE) bzw. "Erweiterung verwalten (Firefox)" erreichen sie die internen Parameter von BE.

Aktuell gibt es folgende Parameter (Seite aktuell nicht übersetzt):

* "Do not prevent system from sleeping"
    * Wenn dies aktiviert wird, wird BE angewiesen den PC nicht am Wechsel in den Schlafmodus zu hindern.
    * Bitte denken sie daran, das BE Gebote nur automatisch abgeben kann, wenn der Computer läuft.
* "Do not background-refresh closed Items"
    * Wenn dies aktiviert wird, wird BE Informationen für Artikel, welche aktuell nicht in einem Tab offen sind, nicht automatisch aktualisieren.
    * Hinweis: Dies kann hilfreich sein um Abstürze zu verhindern, wenn BE lange Zeit unbeafsichtigt laufen soll.
* "Do not perform regular clock check"
    * Wenn aktiviert, führt BE keine regelmäßige Überprüfung der Uhrzeit ihres Systems gegen die eBay-Zeit durch.
* "Enable Compact Saving"
    * Wenn aktiviert, speichert BE den Auktionsstatus als Text statt als HTML. Dies sieht zwar nicht ganz so hübsch
      in der Tabelle aus, benötigt aber deutlich weniger Speicher, so dass ungefähr **doppelt soviele Artikel**
      in BE verwaltet werden können.
* Override eBay Platform
    * Dies ist nur für die synchronisation der Beobachtungsliste relevant.
    * Standardmäßig verwendet BE ebay.de wenn der Browser auf deutsche Benutzersprache eingstellt ist.  