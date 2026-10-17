// Configuración de Firebase (Realtime Database se usa como servidor de señalización WebRTC)
const firebaseConfig = {
  apiKey: "AIzaSyA0N8bVcoT9Ce1pFWLSHlJYesFisKieGD8",
  authDomain: "rtcsgomez.firebaseapp.com",
  databaseURL: "https://rtcsgomez-default-rtdb.firebaseio.com",
  projectId: "rtcsgomez",
  storageBucket: "rtcsgomez.firebasestorage.app",
  messagingSenderId: "1027836314013",
  appId: "1:1027836314013:web:84fcca3f60c21ef9356f74"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Ruta principal de señalización (soporta 1 emisor y múltiples espectadores)
const ROOM_PATH = 'rooms/gomlive';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};