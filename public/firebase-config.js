 // Configuración de Firebase (Realtime Database se usa como servidor de señalización WebRTC)
const firebaseConfig = {
  apiKey: "AIzaSyBVNXg7mdxIDlCSvoBdCi6SlZf7Jhvmxuo",
  authDomain: "webrtctest-5da53.firebaseapp.com",
  databaseURL: "https://webrtctest-5da53-default-rtdb.firebaseio.com",
  projectId: "webrtctest-5da53",
  storageBucket: "webrtctest-5da53.firebasestorage.app",
  messagingSenderId: "894011402689",
  appId: "1:894011402689:web:c641562aec52cb45406740"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Ruta principal de señalización (soporta 1 emisor y múltiples espectadores)
const ROOM_PATH = 'rooms/main';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};