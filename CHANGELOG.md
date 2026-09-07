# Zoznam zmien — Dochádzka na tréningu

Pri každej väčšej úprave appky sa sem pridá nový riadok s číslom verzie
(rovnaké číslo, aké appka zobrazuje pod nadpisom, aby sa dalo overiť,
či je nasadená naozaj tá najnovšia).

## 1.13.3
- Jasnejšia hláška pri neúspešnom prihlásení — dopĺňa pripomienku, že ak
  ešte nemá používateľ účet, treba sa najprv zaregistrovať (tlačidlo pod
  formulárom). Predtým hláška "Nesprávne prihlasovacie meno alebo heslo"
  vyzerala rovnako aj vtedy, keď sa niekto len snažil rovno prihlásiť bez
  toho, aby mal účet vôbec vytvorený.

## 1.13.2
- Oprava: ak mal niekto na telefóne uložené Face ID/odtlačok ešte z obdobia
  pred migráciou na Firebase Authentication (v1.13.0), appka sa ho stále
  snažila použiť so starým menom/heslom a hlásila nezrozumiteľnú chybu bez
  možnosti nápravy priamo v appke. Teraz sa takéto neplatné uložené
  prihlásenie po prvom neúspešnom pokuse automaticky vymaže a appka jasne
  povie, že sa má používateľ prihlásiť menom a heslom (a môže si potom
  Face ID znova nastaviť).

## 1.13.1
- Oprava chyby z v1.13.0: Firebase Authentication si e-mailovú adresu vždy
  ukladá malými písmenami, appka si ale po prihlásení odvodzovala meno
  späť z e-mailu a porovnávala ho s presne veľkými/malými písmenami
  (`ADMIN_USERNAME` a pod.) - po znovunačítaní appky tak niekto (napr.
  admin LubLip) prestal byť rozpoznaný ako admin. Prihlasovacie meno je
  teraz kanonicky vždy malými písmenami (rovnako, ako to aj tak robí
  Firebase), appka ho ale naďalej pekne zobrazuje s veľkými začiatočnými
  písmenami (napr. "LubLip"). Netýka sa to hesiel ani existujúcich
  Firebase Auth účtov - netreba sa znova registrovať.

## 1.13.0
- Prihlasovanie prerobené z vlastného PBKDF2 hashovania na **Firebase
  Authentication** (Email/Password, s vygenerovaným technickým emailom
  `{meno}@jupie-app.local`, žiadny skutočný email sa nikam neposiela).
- Firestore pravidlá sprísnené - čítanie aj zápis vyžaduje prihláseného
  používateľa (`request.auth != null`); `activityLog` je čitateľný iba
  pre admina; `accounts` je čitateľný/zapisovateľný iba pre vlastníka
  daného účtu. Appka predtým bola úplne verejne čitateľná aj zapisovateľná
  komukoľvek, kto poznal jej adresu — **vyžaduje ručnú úpravu Firestore
  pravidiel a povolenie Email/Password prihlasovania, pozri README.**
- Staré heslá (PBKDF2 hashe) sa neprenášajú automaticky - všetci existujúci
  používatelia (admin aj tréneri/vedúci) sa musia zaregistrovať nanovo pod
  rovnakým prihlasovacím menom.
- Face ID / odtlačok naďalej funguje, teraz overuje heslo cez Firebase Auth
  namiesto vlastného PBKDF2 overenia.
- Appka teraz spúšťa načítavanie dát (tréningy, členovia, dochádzka) až po
  prihlásení, nie hneď pri otvorení appky.

## 1.12.1
- MatDrd má namiesto odznaku "Tréner" odznak "Vedúci" (rovnaké práva ako
  ostatní tréneri, len iné pomenovanie v appke).

## 1.12.0
- Nová rola "Tréner" (LukPsi, MarTom, MatDrd) - smie upravovať existujúce
  udalosti (tréningy/zápasy/turnaje), rovnako ako admin. Nemá ale plné
  admin práva: nemôže mazať hráčov ani udalosti, premenovať hráčov, ani
  vidieť záložku Aktivita/zálohu dát. Vidno to aj v appke - vedľa mena sa
  zobrazí odznak "Tréner". (Pridávanie udalostí mohol robiť ktokoľvek
  prihlásený už predtým, to sa nemení.)

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
