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

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const tg = window.Telegram.WebApp;
tg.expand();

// 2. Включаем подтверждение закрытия
// Теперь при свайпе вниз Telegram спросит: "Вы уверены, что хотите закрыть?"
tg.isClosingConfirmationEnabled = true;

// 3. Устанавливаем высоту (опционально, для фиксации)
if (tg.setHeaderColor) tg.setHeaderColor('#000000'); // Цвет шапки

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const bg = new Image();
bg.src = 'assets/background1.jpg'; 

// --- 2. ПЛАНЕТЫ ---
const planets = [
    { 
        id: 'runner', 
        src: 'assets/quant.png', 
        x: 0.5, y: 0.5, // Строго центр
        size: 120, 
        rotation: 0, speed: 0.002, img: new Image() 
    },
    { 
        id: 'build',  
        src: 'assets/earth.png', 
        x: 0.22, y: 0.5, // Слева
        size: 75, 
        rotation: 0, speed: 0.001, img: new Image() 
    },
    { 
        id: 'shop',   
        src: 'assets/mars.png',  
        x: 0.78, y: 0.5, // Справа
        size: 75, 
        rotation: 0, speed: -0.001, img: new Image() 
    }
];

planets.forEach(p => { p.img.src = p.src; });

// Данные игрока
const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);
let playerData = { quant: 0, qubi: 0, energy: 100, level: 1 };

let mouseX = 0, mouseY = 0;

let stars = Array.from({length: 80}, () => ({
    x: Math.random() * 100, y: Math.random() * 100, size: Math.random() * 2, blink: 0.02 + Math.random() * 0.03
}));

// --- 3. ЛОГИКА ---
function initGame() {
    const nameEl = document.getElementById('player-name');
    if(nameEl) nameEl.innerText = tgUser.first_name;

    userRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            updateUI();
        } else {
            userRef.set(playerData);
        }
        hideLoading();
    });
}

function updateUI() {
    const q = document.getElementById('quant-val'), b = document.getElementById('qubi-val'), e = document.getElementById('energy-fill');
    if(q) q.innerText = Math.floor(playerData.quant);
    if(b) b.innerText = Math.floor(playerData.qubi);
    if(e) e.style.width = playerData.energy + "%";
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
}

function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.filter = 'none'; 
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    if (bg.complete) {
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    }

    planets.forEach(p => {
        if (p.img.complete) {
            ctx.save();
            // Просто рисуем по координатам из массива
            ctx.translate(p.x * canvas.width, p.y * canvas.height);
            p.rotation += p.speed;
            ctx.rotate(p.rotation);
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });

    requestAnimationFrame(draw);
}

// --- 1. ЛОГИКА ДЕЙСТВИЙ ПРИ НАЖАТИИ ---
function activatePlanet(id) {
    // Проверка на наличие Telegram WebApp для вибрации
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }

    if (id === 'runner') {
        tg.showPopup({
            title: 'Добыча Кванта',
            message: 'Вход в режим Runner для сбора ресурсов и переработки их в Квант.',
            buttons: [{id: 'start', type: 'default', text: 'Запустить'}, {type: 'cancel'}]
        }, (buttonId) => {
            if (buttonId === 'start') {
                console.log("Запуск Раннера...");
                // window.location.href = 'runner.html'; // Разкомментируй, когда файл будет готов
            }
        });
    } 
    else if (id === 'build') {
        tg.showAlert("Режим «Создание планеты» станет доступен в следующем обновлении!");
    }
    else if (id === 'shop') {
        tg.showAlert("Магазин временно на техобслуживании.");
    }
}

// --- 2. ОБРАБОТКА НАЖАТИЯ (КООРДИНАТЫ) ---
function processInput(e) {
    // Определяем координаты клика или тапа (поддержка ТГ и ПК)
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    planets.forEach(p => {
        // Положение планеты на экране
        const posX = p.x * canvas.width;
        const posY = p.y * canvas.height;

        // Расстояние от точки нажатия до центра планеты
        const dist = Math.hypot(clickX - posX, clickY - posY);

        // Если попали в радиус (+20 пикселей для удобства пальца)
        if (dist < (p.size / 2) + 20) {
            console.log('Попадание в планету:', p.id);
            activatePlanet(p.id); 
        }
    });
}

// --- 3. ПРИВЯЗКА СОБЫТИЙ ---
// Убираем старые клики и ставим эти:
canvas.addEventListener('click', processInput);

canvas.addEventListener('touchend', (e) => {
    // ВАЖНО: это предотвращает "двойной клик" и лишние действия в ТГ
    if (e.cancelable) e.preventDefault();
    processInput(e);
}, { passive: false });

function createClickRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = x + 'px'; ripple.style.top = y + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
}

bg.onload = () => { initGame(); draw(); };
if (bg.complete) { initGame(); draw(); }
