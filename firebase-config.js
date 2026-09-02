// Sem vlož hodnoty z tvojho Firebase projektu.
// Firebase Console -> Project settings -> Your apps -> Web app -> SDK setup and configuration.
// Tento súbor je verejný (je súčasťou statickej stránky), preto NEDÁVAJ Firestore
// pravidlá na "public read/write navždy" - použi napr. jednoduché heslo v pravidlách
// (viď návod, ktorý ti pošlem) alebo Firebase Authentication, ak by si to chcel zabezpečiť lepšie.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtS7BmoktR0XwIdQUgmyb3qZWSYH0GVk8",
  authDomain: "dochadzka-jupie.firebaseapp.com",
  projectId: "dochadzka-jupie",
  storageBucket: "dochadzka-jupie.firebasestorage.app",
  messagingSenderId: "1095172029954",
  appId: "1:1095172029954:web:857361312ee2450b3b711b",
};
