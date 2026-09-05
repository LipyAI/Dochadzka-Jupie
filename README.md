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

**Bezpečnosť:** Firestore pravidlá momentálne povoľujú čítanie aj zápis
komukoľvek, kto pozná presnú adresu appky (`allow read, write: if true`).
Appka nemá skutočný autentifikačný server — prihlasovacie meno a heslo
(pozri nižšie) sú len organizačné, nie kryptograficky vynútené. Heslá sa
ukladajú hashované (PBKDF2, nie čitateľné priamo), ale keďže pravidlá
umožňujú komukoľvek so znalosťou adresy appky prečítať aj kolekciu
`accounts`, ide stále o vedomý kompromis pre jednoduchosť — vhodné pre
uzavretý okruh ľudí, ktorí si link nešíria ďalej.

### Prihlasovanie menom a heslom (od verzie 1.11.0)

- Prihlasovacie meno vzniká automaticky z mena a priezviska (bez diakritiky):
  prvé 3 písmená mena + prvé 3 písmená priezviska, napr. Ľuboš Lipták → `LubLip`.
  Ak sa meno zhoduje s už existujúcim účtom, treba to riešiť ručne v konzole
  (zmazať/premenovať starší dokument v kolekcii `accounts`).
- Heslo si každý volí sám, minimálne 8 znakov, aspoň jedno veľké písmeno,
  jedno malé písmeno a jednu číslicu.
- Jediný admin účet je pevne dané prihlasovacie meno v `app.js`
  (`ADMIN_USERNAME`) — kto sa prihlási pod týmto menom, má admin práva.
- Voliteľne sa dá appka odomykať aj cez Face ID / odtlačok (WebAuthn) —
  ide o pohodlie na danom telefóne, nie o ďalší spôsob overenia identity.

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
    match /dochadzka/shared { allow read, write: if true; }
    match /members/{id} { allow read, write: if true; }
    match /trainings/{id} { allow read, write: if true; }
    match /attendance/{id} { allow read, write: if true; }
    match /activityLog/{id} { allow read, write: if true; }
    match /accounts/{id} { allow read, write: if true; }
    match /meta/{id} { allow read, write: if true; }
  }
}
```

**Dôležité:** riadok `match /accounts/{id}` treba do pravidiel pridať
ručne vo Firebase Console (Firestore Database → Rules) predtým, než sa
appka verzie 1.11.0 nasadí — inak prihlasovanie/registrácia zlyhá s
chybou "Missing or insufficient permissions", pretože Firestore bez
zodpovedajúceho pravidla novú kolekciu automaticky odmieta.
