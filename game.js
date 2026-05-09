// --- 1. ИНИЦИАЛИЗАЦИЯ ---
const firebaseConfig = {
    apiKey: "AIzaSyABKHaAdlSFq1KzURXmCF5Q-9xMUgE4Ot0",
    authDomain: "berry-game-4fa9b.firebaseapp.com",
    databaseURL: "https://berry-game-4fa9b-default-rtdb.firebaseio.com",
    projectId: "berry-game-4fa9b",
    storageBucket: "berry-game-4fa9b.firebasestorage.app",
    messagingSenderId: "736707445306",
    appId: "1:736707445306:web:87a61ea4b725bd3071eb03"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const tg = window.Telegram.WebApp;

tg.expand();
tg.ready();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const bg = new Image();
bg.src = 'background1.jpg';

// Данные из ТГ
const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);

let playerData = {
    quant: 0,
    qubi: 0,
    energy: 100,
    level: 1
};

// --- 2. АВТОРИЗАЦИЯ И ЗАГРУЗКА ---
function initGame() {
    document.getElementById('player-name').innerText = tgUser.first_name;

    // Получаем данные один раз при старте
    userRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
        } else {
            // Регистрация нового пилота
            userRef.set(playerData);
        }
        
        updateUI();
        hideLoading();
    }).catch(e => console.error("Firebase Error:", e));

    // Слушаем изменения в реальном времени (например, если начислили бонус из админки)
    userRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            updateUI();
        }
    });
}

function updateUI() {
    document.getElementById('quant-val').innerText = playerData.quant;
    document.getElementById('qubi-val').innerText = playerData.qubi;
    document.getElementById('energy-fill').style.width = playerData.energy + "%";
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
}

// --- 3. ГРАФИКА И КЛИКИ ---
function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
}

const zones = [
    { id: 'runner', x: 0.22, y: 0.36, r: 60 },
    { id: 'planet', x: 0.50, y: 0.52, r: 80 },
    { id: 'shop',   x: 0.85, y: 0.46, r: 55 }
];

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    zones.forEach(z => {
        const dist = Math.sqrt((x - z.x*canvas.width)**2 + (y - z.y*canvas.height)**2);
        if (dist < z.r) handlePress(z.id);
    });
});

function handlePress(id) {
    tg.HapticFeedback.impactOccurred('light');
    
    if (id === 'runner') {
        // Пример: тратим 5 энергии за вход, получаем 1 QUANT
        if (playerData.energy >= 5) {
            playerData.energy -= 5;
            playerData.quant += 1;
            userRef.update(playerData);
        } else {
            tg.showAlert("Нужна подзаправка!");
        }
    }
}

bg.onload = () => {
    initGame();
    draw();
};