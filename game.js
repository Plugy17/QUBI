// Новые ресурсы для Раннера
const runnerCanvas = document.getElementById('runnerCanvas');
const runnerCtx = runnerCanvas.getContext('2d');

const runnerBg = new Image();
runnerBg.src = 'assets/background2.jpg'; 

const shipImg = new Image();
shipImg.src = 'assets/samolet.png';

// Переменная для хранения состояния игры
let isRunnerActive = false;

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
            
            // ДОБАВЬ ЭТУ СТРОКУ НИЖЕ:
            syncWithLeaderboard(); 
            
        } else {
            userRef.set(playerData);
        }
        hideLoading();
    });
}

function updateLeaderboardData() {
    // Создаем краткую запись о игроке
    const leaderRef = db.ref('leaderboard/' + tgUser.id);
    leaderRef.set({
        name: tgUser.first_name || "Unknown Pilot",
        qubi: playerData.qubi || 0
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

        // 1. Сначала проверяем, попал ли палец ВООБЩЕ в радиус планеты
        if (dist < (p.size / 2) + 15) {
            console.log('Нажата планета:', p.id);
            
            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }

            // 2. И только если попали, выбираем, какое окно открыть
            if (p.id === 'leaderboard') {
                openLeaderboard();
            } else if (p.id === 'moon') {
                openMoonMenu();
            } else {
                activatePlanet(p.id);
            }
        }
    });
}

function activatePlanet(id) {
    if (id === 'runner') {
        // Проверка энергии: если меньше 10, не пускаем
        if (playerData.energy < 10) {
            tg.showAlert("Недостаточно энергии для полета! Нужно минимум 10 ⚡");
            return;
        }
        
        // Списываем энергию (визуально сразу, база обновится при синхронизации)
        playerData.energy -= 10;
        updateUI();
        
        // Открываем окно игры
        openRunnerWindow();

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

// Привязка кнопки закрытия (добавь это там, где привязываешь close-moon)
const closeLdbBtn = document.getElementById('close-leaderboard');
if (closeLdbBtn) closeLdbBtn.onclick = closeLeaderboard;

// Старт
bg.onload = () => { initGame(); draw(); };
if (bg.complete) { initGame(); draw(); }

function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const container = document.getElementById('leaderboard-container');
    
    if (modal) modal.style.display = 'flex';

    // Ссылка на таблицу лидеров в Firebase
    const leaderboardRef = db.ref('leaderboard');

    // Запрашиваем данные, сортируем по QUBI (от большего к меньшему) и берем 100 лучших
    leaderboardRef.orderByChild('qubi').limitToLast(100).once('value', (snapshot) => {
        if (container) {
            container.innerHTML = ''; // Очищаем текст загрузки
            
            let players = [];
            snapshot.forEach((childSnapshot) => {
                players.push(childSnapshot.val());
            });

            // Данные приходят от меньшего к большему, переворачиваем список
            players.reverse();

            players.forEach((player, index) => {
                const row = document.createElement('div');
                row.className = 'player-row';
                
                // Выделяем текущего игрока (тебя) другим цветом
                const isMe = player.name === tgUser.first_name ? 'style="color: #00e5ff; font-weight: bold;"' : '';

                row.innerHTML = `
                    <span ${isMe}>${index + 1}. ${player.name}</span>
                    <span class="score">${Math.floor(player.qubi).toLocaleString()} QUBI</span>
                `;
                container.appendChild(row);
            });
        }
    });
}

function closeLeaderboard() {
    document.getElementById('leaderboard-modal').style.display = 'none';
}

function syncWithLeaderboard() {
    // Путь к твоим очкам в общей таблице
    const lbRef = db.ref('leaderboard/' + tgUser.id);
    lbRef.set({
        name: tgUser.first_name || "Unknown Pilot",
        qubi: playerData.qubi || 0
    });
}

// --- ЛОГИКА РАННЕРА: ОБЪЕКТЫ И УПРАВЛЕНИЕ ---
let runnerShip = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 120,
    w: 80,
    h: 80,
    targetX: window.innerWidth / 2,
    lerpSpeed: 0.15 // Плавность хода
};

// Слушатель движения пальца (только по горизонтали)
runnerCanvas.addEventListener('touchmove', (e) => {
    if (!isRunnerActive) return;
    const touch = e.touches[0];
    const rect = runnerCanvas.getBoundingClientRect();
    runnerShip.targetX = touch.clientX - rect.left;
    if (e.cancelable) e.preventDefault();
}, { passive: false });

// Прыжок в точку при касании
runnerCanvas.addEventListener('touchstart', (e) => {
    if (!isRunnerActive) return;
    const rect = runnerCanvas.getBoundingClientRect();
    runnerShip.targetX = e.touches[0].clientX - rect.left;
}, { passive: false });

// --- ФУНКЦИИ ОКНА И ЦИКЛА ---

function openRunnerWindow() {
    isRunnerActive = true;
    document.getElementById('runner-window').style.display = 'block';
    
    resizeRunnerCanvas();
    
    // Начальная позиция
    runnerShip.x = window.innerWidth / 2;
    runnerShip.targetX = window.innerWidth / 2;
    runnerShip.y = window.innerHeight - 120;

    // Запуск игрового цикла
    requestAnimationFrame(runnerLoop);
}

function closeRunnerWindow() {
    isRunnerActive = false;
    document.getElementById('runner-window').style.display = 'none';
}

function resizeRunnerCanvas() {
    const dprR = window.devicePixelRatio || 1;
    runnerCanvas.width = window.innerWidth * dprR;
    runnerCanvas.height = window.innerHeight * dprR;
    runnerShip.y = window.innerHeight - 120;
}

function runnerLoop() {
    if (!isRunnerActive) return;

    const dpr = window.devicePixelRatio || 1;
    runnerCtx.clearRect(0, 0, runnerCanvas.width, runnerCanvas.height);
    
    runnerCtx.save();
    runnerCtx.scale(dpr, dpr);

    // 1. Отрисовка фона
    if (runnerBg.complete) {
        runnerCtx.drawImage(runnerBg, 0, 0, window.innerWidth, window.innerHeight);
    }

    // 2. Расчет движения (Lerp)
    let dx = runnerShip.targetX - runnerShip.x;
    runnerShip.x += dx * runnerShip.lerpSpeed;

    // Ограничение по краям экрана
    if (runnerShip.x < runnerShip.w / 2) runnerShip.x = runnerShip.w / 2;
    if (runnerShip.x > window.innerWidth - runnerShip.w / 2) runnerShip.x = window.innerWidth - runnerShip.w / 2;

    // 3. Отрисовка самолета с наклоном
    if (shipImg.complete) {
        let tilt = dx * 0.015; // Эффект крена
        runnerCtx.save();
        runnerCtx.translate(runnerShip.x, runnerShip.y);
        runnerCtx.rotate(tilt);
        // Центрируем картинку относительно x, y
        runnerCtx.drawImage(shipImg, -runnerShip.w / 2, -runnerShip.h / 2, runnerShip.w, runnerShip.h);
        runnerCtx.restore();
    }

    runnerCtx.restore();
    requestAnimationFrame(runnerLoop);
}

// Привязка кнопок и событий
const exitBtn = document.getElementById('exit-runner');
if (exitBtn) exitBtn.onclick = closeRunnerWindow;

window.addEventListener('resize', () => {
    if (isRunnerActive) resizeRunnerCanvas();
});
