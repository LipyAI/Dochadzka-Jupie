# Zoznam zmien — Dochádzka na tréningu

Pri každej väčšej úprave appky sa sem pridá nový riadok s číslom verzie
(rovnaké číslo, aké appka zobrazuje pod nadpisom, aby sa dalo overiť,
či je nasadená naozaj tá najnovšia).

## 1.11.0
- Prihlasovanie prerobené z voľne zvolených 6-miestnych kódov na skutočné
  účty: prihlasovacie meno vzniká automaticky z mena a priezviska (prvé
  3 písmená z každého, bez diakritiky, napr. Ľuboš Lipták → LubLip),
  heslo si každý volí sám (min. 8 znakov, veľké aj malé písmeno, číslica).
  Heslá sa ukladajú hashované (PBKDF2), nie ako čitateľný text.
  **Vyžaduje ručnú úpravu Firestore pravidiel, pozri README.**
- Admin účet je teraz pevne dané prihlasovacie meno namiesto starého
  číselného kódu.
- Face ID / odtlačok teraz odomyká meno aj heslo (predtým iba kód) a pri
  každom použití sa heslo znova overí voči účtu.
- Staré číselné kódy prestávajú platiť - všetci sa musia znova
  zaregistrovať pod svojím menom.

## 1.10.0
- Prihlásenie cez Face ID / odtlačok prsta (WebAuthn) ako pohodlnejšia
  alternatíva k písaniu 6-miestneho kódu. Po prvom prihlásení kódom appka
  ponúkne nastavenie - kód sa potom bezpečne uloží len v danom telefóne
  a nabudúce ho odomkne biometrika. Ide o pohodlie na danom zariadení, nie
  o overenie identity cez server (appka nemá vlastný backend) - kód sa
  dá kedykoľvek "zabudnúť" priamo na prihlasovacej obrazovke.

## 1.9.0
- Emoji ikony nahradené jednotnými SVG ikonami (tak vyzerajú rovnako na
  všetkých telefónoch/prehliadačoch namiesto pestrofarebných emoji, ktoré
  sa všade zobrazujú inak).
- Jemný "sklenený" efekt (rozmazanie pozadia) na hlavičke a spodnej lište.
- Väčšie tlačidlá pri zapisovaní dochádzky (ľahšie sa trafí prstom).
- Ikona v prázdnych stavoch (napr. "Zatiaľ žiadna aktivita").
- Viditeľný focus indikátor pre ovládanie klávesnicou / čítačky obrazovky.

## 1.8.1
- Oprava chyby v `service-worker.js`: odkazoval na ikony v neexistujúcom
  priečinku `icons/`, čo spôsobovalo, že sa nová verzia appky nikdy
  neinštalovala (aj po vyčistení cache v prehliadači zostávala appka
  na starej verzii). Zároveň zmenená stratégia cache na "najprv sieť,
  offline záloha z cache", aby sa toto v budúcnosti neopakovalo.

## 1.8.0
- Dizajnový refresh: záložky presunuté na spodnú lištu (ako v bežných
  telefónnych appkách), prilepená hlavička, farebné avatary hráčov
  s iniciálami (zoznam členov, štatistiky, profil hráča), dnešný deň
  zvýraznený v kalendároch, prepracovaná prihlasovacia obrazovka s logom
  klubu, animovaný indikátor načítavania a jemné tiene/animácie na
  kartách a tlačidlách. Bez zmeny funkčnosti.

## 1.7.0
- Potvrdenie pred vymazaním hráča alebo udalosti (ochrana pred omylom).
- Úprava existujúcej udalosti (dátum, čas, typ, poznámka) — admin už
  nemusí kvôli chybe udalosť mazať a vytvárať znova.
- Texty pri zápasoch/turnajoch teraz hovoria o "nominovaných" namiesto
  "prítomných" (štatistika sa aj naďalej počíta iba z tréningov).

## 1.6.0
- Pridané voliteľné pole "Čas" pri vytváraní udalosti (hodí sa najmä
  pri zápasoch) — zobrazuje sa pri dátume v zozname aj detaile udalosti.
- Prepínač tmavého/svetlého režimu (ikona v hlavičke appky), appka si
  ho pamätá aj po zatvorení a zapnutí.

## 1.5.0
- Prestavba databázy: namiesto jedného spoločného dokumentu teraz appka
  používa samostatné kolekcie (`members`, `trainings`, `attendance`,
  `activityLog`) — rieši riziko kolízie pri súbežnom zápise viacerých ľudí.
- Automatická jednorazová migrácia starých dát do novej štruktúry.
- Pridané číslo verzie do appky (hlavička + konzola prehliadača).

## 1.4.0
- Oprava chyby s časovým pásmom pri počítaní dátumov (posun o deň pri
  "Zopakovať o týždeň", rýchlych tlačidlách dní a viacdňových turnajoch).
- Kliknutie na ktorýkoľvek deň v kalendári zobrazí, čo sa v ten deň deje.

## 1.3.0
- Tlačidlo "Zopakovať o týždeň" v detaile udalosti (rýchle vytvorenie kópie).
- Tlačidlo na stiahnutie zálohy dát (JSON) v záložke Aktivita.
- Štatistiky teraz počítajú iba z tréningov, nie zo zápasov/turnajov.

## 1.2.0
- Prihlásenie 6-miestnym kódom, ktoré sa neuchováva natrvalo (nutné zadať
  znova po zatvorení appky). Admin kód zmenený.

## 1.1.0
- Prihlasovanie 4-miestnym kódom, práva admin/bežný používateľ.
- Záložka "Aktivita" (len pre admina) so záznamom, kto čo zmenil.
- Kalendár s farebnými bodkami nad zoznamom udalostí, viacdňové turnaje.

## 1.0.0
- Prvá verzia appky: tréningy/zápasy/turnaje, členovia, dochádzka,
  štatistiky, kalendár v profile hráča. Zdieľaná databáza cez Firebase.
