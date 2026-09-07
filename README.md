# Dochádzka na tréningu

Appka na zaznamenávanie dochádzky pre futbalový klub (Jupie, Banská Bystrica).
Beží ako webová appka (PWA) na GitHub Pages, dáta ukladá do Firebase Firestore.

Živá appka: https://lipyai.github.io/Dochadzka-Jupie/

## Súbory

- `index.html` — kostra stránky
- `style.css` — vzhľad
- `app.js` — celá logika appky (vanilla JavaScript, žiadny framework)
- `firebase-config.js` — prístupové údaje k databáze (verejné, ale databáza
  je chránená iba tým, že link nikto nezdieľa verejne — pozri nižšie)
- `manifest.json`, `service-worker.js`, `icons/` — aby appka fungovala ako
  nainštalovateľná appka na telefóne (offline kostra, ikona na ploche)
- `CHANGELOG.md` — história zmien podľa čísla verzie

## Databáza (Firestore)

Od verzie 1.5.0 appka používa tieto kolekcie:
- `members` — hráči
- `trainings` — tréningy, zápasy, turnaje
- `attendance` — dochádzka (jeden záznam = jeden hráč pri jednej udalosti)
- `activityLog` — kto čo zmenil (viditeľné iba adminovi v appke)
- `accounts` — prihlasovacie účty (od verzie 1.11.0, pozri nižšie)

Staršia štruktúra (`dochadzka/shared`, všetko v jednom dokumente) sa už
nepoužíva, ale nechala sa nedotknutá ako záložná kópia.

**Bezpečnosť:** od verzie 1.13.0 appka používa **Firebase Authentication**
na overenie hesla a Firestore pravidlá vyžadujú prihláseného používateľa
(`request.auth != null`) — appka teda už nie je verejne čitateľná/zapisovateľná
komukoľvek, kto pozná adresu. Heslá sa neukladajú v appkinej databáze vôbec,
overuje ich priamo Firebase Auth (rovnaká služba, akú používajú bežné appky
s emailovým prihlásením). Kolekcia `accounts` slúži len ako "meno → zobrazované
meno" adresár a je čitateľná/zapisovateľná iba pre vlastníka daného záznamu.
Kolekcia `activityLog` je čitateľná iba pre admina.

Toto stále nie je "bankové" zabezpečenie — appka nemá vlastný backend server,
takže napr. rola admin/tréner je vynútená len na strane appky/pravidiel podľa
pevne daného mena (`ADMIN_USERNAME` v `app.js`), nie cez systém rolí. Pre
uzavretý okruh známych ľudí (klub, tréneri) je to ale výrazne bezpečnejšie
než pôvodný stav (kedy bolo úplne všetko verejne čitateľné aj zapisovateľné).

### Prihlasovanie menom a heslom

- Appka nepoužíva email — pri registrácii sa interne vytvorí Firebase Auth
  účet s vygenerovaným emailom `{meno}@jupie-app.local` a heslom, ktoré si
  používateľ zvolí. Tento email nikam nechodí, slúži len ako technický
  identifikátor pre Firebase Auth.
- Prihlasovacie meno vzniká automaticky z mena a priezviska (bez diakritiky):
  prvé 3 písmená mena + prvé 3 písmená priezviska, napr. Ľuboš Lipták → `LubLip`.
  Ak sa meno zhoduje s už existujúcim účtom, Firebase Auth registráciu odmietne
  (appka to ukáže ako "meno je už obsadené") — treba to vyriešiť inak zadaným
  menom, alebo ručne vymazať starý účet vo Firebase Console → Authentication.
  Appka ho takto pekne zobrazuje, ale interne (Firestore doc ID,
  `ADMIN_USERNAME`/`TRAINER_USERNAMES`/`MANAGER_USERNAMES`, odvodený
  e-mail) sa vždy pracuje s malými písmenami `lublip` — Firebase
  Authentication si e-mail aj tak vždy ukladá malými písmenami, takže
  toto je jediná spoľahlivá kanonická forma (viď v1.13.1 v CHANGELOG).
- Heslo si každý volí sám, minimálne 8 znakov, aspoň jedno veľké písmeno,
  jedno malé písmeno a jednu číslicu.
- Appka drží prihlásenie len na dobu otvorenia appky (Firebase Auth
  `browserSessionPersistence`) — po zatvorení appky treba zadať meno a heslo
  znova (alebo použiť Face ID/odtlačok, pozri nižšie).
- Jediný admin účet je pevne dané prihlasovacie meno v `app.js`
  (`ADMIN_USERNAME`) — kto sa prihlási pod týmto menom, má admin práva.
  Tréneri/vedúci sú podobne pevne dané mená v `TRAINER_USERNAMES` /
  `MANAGER_USERNAMES`.
- Voliteľne sa dá appka odomykať aj cez Face ID / odtlačok (WebAuthn) —
  ide o pohodlie na danom telefóne (meno aj heslo sa uložia len lokálne
  a pri každom použití sa znova overia cez Firebase Auth), nie o ďalší
  spôsob overenia identity.

### Nastavenie Firebase Authentication (jednorazovo, ručne)

Firebase Console → Authentication → Sign-in method → povoliť
**Email/Password** provider. Bez tohto kroku registrácia/prihlásenie zlyhá
s chybou `auth/operation-not-allowed`.

## Ako appku upraviť a nasadiť

1. Uprav príslušný súbor (najčastejšie `app.js`)
2. V repozitári na GitHub: **Add file → Upload files** → pretiahni
   upravený súbor (rovnaký názov = automaticky prepíše starý)
3. Commit changes
4. Počkaj na zelenú fajočku v záložke **Actions** (beh
   "pages build and deployment")
5. Otvor appku, over si dole pod nadpisom, že sedí očakávané **číslo
   verzie** — ak nie, prehliadač ešte zobrazuje starú verziu z
   vyrovnávacej pamäte (pomôže: Nastavenia webu → Vymazať dáta pre
   `lipyai.github.io`, alebo na iPhone Nastavenia → Safari → Vymazať
   históriu a dáta webových stránok)
6. Zapíš zmenu do `CHANGELOG.md` s novým číslom verzie

## Firestore pravidlá (Rules)

Firebase Console → Firestore Database → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /members/{id} { allow read, write: if request.auth != null; }
    match /trainings/{id} { allow read, write: if request.auth != null; }
    match /attendance/{id} { allow read, write: if request.auth != null; }
    match /activityLog/{id} {
      allow read: if request.auth != null && request.auth.token.email == "LubLip@jupie-app.local";
      allow write: if request.auth != null;
    }
    match /accounts/{username} {
      allow read, write: if request.auth != null
        && request.auth.token.email == username + "@jupie-app.local";
    }
    match /meta/{id} { allow read, write: if request.auth != null; }
    match /dochadzka/shared { allow read, write: if false; }
  }
}
```

**Dôležité poradie nasadenia** (aby appka počas prechodu nevypadla):
1. Najprv nasaď appku s týmto pravidlami stále **otvorenými** (`if true`,
   pôvodná verzia pravidiel) a over, že registrácia/prihlásenie cez
   Firebase Auth naozaj funguje naživo.
2. Až potom vlož pravidlá vyššie a klikni **Publish**.
3. Keďže starý systém hesiel (PBKDF2 v `accounts`) sa touto verziou úplne
   nahrádza Firebase Authentication, **všetci existujúci používatelia sa
   musia zaregistrovať nanovo** (rovnaké prihlasovacie meno, nové/rovnaké
   heslo podľa vlastnej voľby) — staré heslá sa neprenášajú automaticky.
