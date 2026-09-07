Aplikacje BusApp 
Version 1.0.1a


Żeby zainstalować aplikacje trzeba rozpakować plik Zip w otworzyć w folderze busapp CMD i wpisac "npm install"

jak się zainstaluje zrestartować CMD  i wpisac "npm start" lub klikac plik uruchom w folderze z plikami 

pojawi się ip i bramka które trzeba wpisac do przeglądarki ale uwaga! urządzenie z którego się wchodzi musi być w tej samej sieci internetowej co komputer/ urządzenie hostujace 

żeby zmieniac i dodawać linie trzeba odpalić plik lines w folderze i pododawać linie 

żeby ustawić dane ogłoszenia dla danej linii trzeba otworzyć plik app.js w public i w danych linijkach pozmieniać kod 
"const LINE_SOUND_MAP = {
  "NAZWA Z DUZYMI LITERAMI JAK W LINES ": [
    "sounds/NAZWA_PLIKU_KTORY_DODALES/AS_W_FOLDERZE_SOUNDS.mp3",
  ],
  "DEFAULT": [
    "sounds/braklini.mp3"
  ]
};"

---

## Nowe funkcje (v1.1)

**Automatyczne odtwarzanie trasy** - przycisk ▶️ obok 🔊 na wyświetlaczu.
Włączony (zmienia się na ⏸️) sam odtwarza kolejne przystanki jeden po
drugim, z ok. 1,2 s przerwy między nimi. Wyłącza się automatycznie po
wyjściu z linii (przycisk ↩ albo "Wygaś").

**Nazwa przystanku na ekranie** - po każdym odtworzonym dźwięku, na górze
ekranu pojawia się na chwilę dymek z nazwą przystanku (wyciągniętą z nazwy
pliku dźwiękowego).

**Dzwonek** - osobny przycisk 🔔 obok 🔊, odtwarza `sounds/dzwonek.mp3`.
Ten plik trzeba samemu dograć do folderu `sounds` (nie ma go domyślnie) -
jeśli go brakuje, pokaże się dymek z ostrzeżeniem zamiast dźwięku.

**Przystanek końcowy** - gdy gra ostatni dźwięk z playlisty danej linii,
ramka wyświetlacza mignie na biało kilka razy.

**Burta boczna** - mały dodatkowy wyświetlacz w lewym górnym rogu (w
trybie pełnoekranowym), pokazujący sam numer linii.

**Kolor wyświetlacza** - trzy kropki (bursztynowy / czerwony / zielony)
w nagłówku listy linii. Wybór zapisuje się w przeglądarce na danym
urządzeniu.

**Edytor dźwięków w interfejsie** - przycisk 🎚️ w nagłówku otwiera okienko,
w którym bez ruszania kodu: wybierasz linię z listy, dodajesz pliki z
folderu `sounds` (z rozwijanej listy), zmieniasz kolejność strzałkami
▲▼, usuwasz ✕, i zapisujesz przyciskiem "Zapisz". Zmiana synchronizuje
się na wszystkich podłączonych urządzeniach. Ręczna edycja `LINE_SOUND_MAP`
w `app.js` nadal działa jako wartość startowa/zapasowa, ale odkąd raz
zapiszesz cokolwiek w edytorze, obowiązuje plik `soundmap.json` w głównym
folderze (tworzy się automatycznie przy pierwszym uruchomieniu).

**Ulubione** - gwiazdka ★ na każdym kafelku linii przypina go na górę listy.

**Ostatnio wybierane** - pasek nad listą linii z kilkoma ostatnio
wybranymi liniami (zapamiętywane osobno na każdym urządzeniu/przeglądarce).

**Eksport / import konfiguracji** - przyciski ⬇️ i ⬆️ w nagłówku. Eksport
zapisuje jeden plik `.json` z liniami i całą mapą dźwięków (kopia
zapasowa albo przeniesienie na inny komputer). Import wczytuje taki plik
z powrotem (nadpisuje aktualne linie i mapę dźwięków na wszystkich
urządzeniach).

**Tryb PWA / offline** - na telefonie: Udostępnij → "Dodaj do ekranu
głównego" jak wcześniej. Dodatkowo strona i raz odtworzone dźwięki
zapisują się w pamięci przeglądarki, więc częściowo działają nawet przy
chwilowej utracie WiFi (sama synchronizacja między urządzeniami wymaga
jednak żywego połączenia z serwerem w sieci lokalnej).

