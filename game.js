// --- 1. ИНИЦИАЛИЗАЦИЯ И КОНФИГ ---
const dpr = window.devicePixelRatio || 1;
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

// Полный экран и блокировка свайпов
if (tg.requestFullscreen && typeof tg.requestFullscreen === 'function') {
    try { tg.requestFullscreen(); } catch (e) { console.error("Fullscreen failed:", e); }
}
if (tg.disableVerticalSwipes && typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
}

tg.isClosingConfirmationEnabled = true;
tg.setHeaderColor('#000000');
tg.setBackgroundColor('#000000');
tg.ready();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const bg = new Image();
bg.src = 'assets/background1.jpg'; 

// --- 2. ПЛАНЕТЫ ---
const planets = [
    { 
        id: 'runner', 
        src: 'assets/quant.png', 
        x: 0.5, y: 0.5,
        size: 120, 
        rotation: 0, speed: 0.002, img: new Image() 
    },
    { 
        id: 'build',  
        src: 'assets/earth.png', 
        x: 0.22, y: 0.5,
        size: 75, 
        rotation: 0, speed: 0.001, img: new Image() 
    },
    { 
        id: 'shop',   
        src: 'assets/mars.png',  
        x: 0.78, y: 0.5,
        size: 75, 
        rotation: 0, speed: -0.001, img: new Image() 
    },
    { 
        id: 'moon',   
        src: 'assets/moon.png',  
        x: 0.5, y: 0.72, // Снизу от Ядра, но по центру
        size: 60,
        rotation: 0, speed: 0.003, img: new Image() 
    },
    { 
    id: 'leaderboard',   
    src: 'assets/neptun.png',  
    x: 0.5, y: 0.32, // Располагаем над центральным ядром
    size: 70,       
    rotation: 0, speed: -0.0015, img: new Image() 
}
];

planets.forEach(p => { p.img.src = p.src; });

const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);
let playerData = { quant: 0, qubi: 0, energy: 100, level: 1 };

// --- 3. ФУНКЦИИ ИНТЕРФЕЙСА И КАНВАСА ---

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Вызываем один раз при старте

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
    const q = document.getElementById('quant-val'), 
          b = document.getElementById('qubi-val'), 
          e = document.getElementById('energy-fill');
    if(q) q.innerText = Math.floor(playerData.quant);
    if(b) b.innerText = Math.floor(playerData.qubi);
    if(e) e.style.width = playerData.energy + "%";
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    if(loader) { 
        loader.style.opacity = '0'; 
        setTimeout(() => loader.style.display = 'none', 500); 
    }
}

function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(dpr, dpr);

    if (bg.complete) {
        ctx.drawImage(bg, 0, 0, window.innerWidth, window.innerHeight);
    }

    planets.forEach(p => {
        if (p.img.complete) {
            ctx.save();
            ctx.translate(p.x * window.innerWidth, p.y * window.innerHeight);
            p.rotation += p.speed;
            ctx.rotate(p.rotation);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });

    ctx.restore();
    requestAnimationFrame(draw);
}

// --- 4. ОБРАБОТКА НАЖАТИЙ (ЕДИНЫЙ БЛОК) ---

function processInput(e) {
    // Останавливаем скролл страницы при тапе
    if (e.type === 'touchend' && e.cancelable) e.preventDefault();

    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    planets.forEach(p => {
        const posX = p.x * window.innerWidth;
        const posY = p.y * window.innerHeight;

        const dist = Math.hypot(clickX - posX, clickY - posY);

        if (p.id === 'leaderboard') openLeaderboard();

        // Попадание в радиус планеты + небольшой запас
        if (dist < (p.size / 2) + 15) {
            console.log('Нажата планета:', p.id);
            
            // Вибрация
            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }

            if (p.id === 'moon') {
                openMoonMenu();
            } else {
                activatePlanet(p.id);
            }
        }
    });
}

function activatePlanet(id) {
    if (id === 'runner') {
        tg.showPopup({
            title: 'Добыча Кванта',
            message: 'Запустить режим Runner?',
            buttons: [{id: 'start', type: 'default', text: 'Запустить'}, {type: 'cancel'}]
        }, (buttonId) => {
            if (buttonId === 'start') console.log("Запуск Раннера...");
        });
    } else if (id === 'build') {
        tg.showAlert("Режим «Создание» скоро!");
    } else if (id === 'shop') {
        tg.showAlert("Магазин закрыт на ремонт.");
    }
}

function openMoonMenu() {
    const modal = document.getElementById('moon-modal');
    if (modal) {
        modal.style.display = 'flex';
        const resAmt = document.getElementById('res-amount');
        if (resAmt) resAmt.innerText = Math.floor(playerData.quant);
    }
}

function closeMoonMenu() {
    const modal = document.getElementById('moon-modal');
    if (modal) modal.style.display = 'none';
}

// Привязка событий
canvas.addEventListener('click', processInput);
canvas.addEventListener('touchend', processInput, { passive: false });

const closeBtn = document.getElementById('close-moon');
if (closeBtn) closeBtn.onclick = closeMoonMenu;

// Старт
bg.onload = () => { initGame(); draw(); };
if (bg.complete) { initGame(); draw(); }

function openLeaderboard() {
    document.getElementById('leaderboard-modal').style.display = 'flex';
    // Здесь позже добавим логику загрузки ТОП-100 из Firebase
}

function closeLeaderboard() {
    document.getElementById('leaderboard-modal').style.display = 'none';
}
