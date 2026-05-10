// --- 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ---
let lastEnergyUpdate = Date.now();
const MAX_ENERGY = 100;
let quants = []; 
let sessionQuants = 0;
let sessionQubi = 0;
let isRunnerActive = false;

let factoryLimit = {
    date: new Date().toLocaleDateString(),
    processedToday: 0
};

// --- 2. ИНИЦИАЛИЗАЦИЯ FIREBASE И TG ---
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

const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);
let playerData = { 
    quant: 0, 
    qubi: 0, 
    energy: 100, 
    level: 1,
    // Добавляем объект лимита прямо сюда
    factoryLimit: {
        date: new Date().toLocaleDateString(),
        processedToday: 0
    }
};

// --- 2.1 НАСТРОЙКИ TG (ВОЗВРАТ УДАЛЕННОГО) ---
tg.expand();
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

// --- 2.2 СИНХРОНИЗАЦИЯ ЛИДЕРБОРДА ---
// Эта функция должна быть здесь, чтобы она была доступна при загрузке
function syncWithLeaderboard() {
    if (!playerData) return;
    
    const lbRef = db.ref('leaderboard/' + tgUser.id);
    lbRef.set({
        name: tgUser.first_name || "Unknown Pilot",
        qubi: playerData.qubi || 0,
        lastUpdate: Date.now() // Добавляем время, чтобы база видела обновление
    }).then(() => {
        console.log("Лидерборд успешно обновлен для:", tgUser.first_name);
    }).catch((error) => {
        console.error("Ошибка обновления лидерборда:", error);
    });
}

// --- 3. РЕСУРСЫ (КАРТИНКИ И КАНВАС) ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const runnerCanvas = document.getElementById('runnerCanvas');
const runnerCtx = runnerCanvas.getContext('2d');
const runnerWin = document.getElementById('runner-window');

const bg = new Image(); bg.src = 'assets/background1.jpg';
const runnerBg = new Image(); runnerBg.src = 'assets/background2.jpg';
const shipImg = new Image(); shipImg.src = 'assets/samolet.png';
const quantImg = new Image(); quantImg.src = 'assets/quant-icon.png';
const qubiImg = new Image(); qubiImg.src = 'assets/qubi-icon.png';
const meteorImg = new Image(); meteorImg.src = 'assets/meteor.png'; // Убедись, что файл лежит по этому пути
const alienImg = new Image(); alienImg.src = 'assets/alien.png';

const planets = [
    { id: 'runner', src: 'assets/quant.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, size: 120, rotation: 0, speed: 0.002, img: new Image() },
    { id: 'build', src: 'assets/earth.png', x: window.innerWidth * 0.22, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: 0.001, img: new Image() },
    { id: 'shop', src: 'assets/mars.png', x: window.innerWidth * 0.78, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: -0.001, img: new Image() },
    { id: 'moon', src: 'assets/moon.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.72, size: 60, rotation: 0, speed: 0.003, img: new Image() },
    { id: 'leaderboard', src: 'assets/neptun.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.32, size: 70, rotation: 0, speed: -0.0015, img: new Image() },
    { id: 'station', src: 'assets/station.png', x: window.innerWidth * 0.2, y: window.innerHeight * 0.4, size: 70, rotation: 0, speed: 0, img: new Image(), action: () => openStation() }
];

// Правильная инициализация картинок для ВСЕХ объектов
planets.forEach(p => { p.img.src = p.src; });

let runnerShip = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 200, 
    w: 80, h: 80,
    hp: 100, // Текущее здоровье
    maxHp: 100, // Максимальное здоровье
    targetX: window.innerWidth / 2,
    lerpSpeed: 0.2
};

// --- 4. СИСТЕМНЫЕ ФУНКЦИИ (RESIZE, UI, START) ---
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    [canvas, runnerCanvas].forEach(c => {
        if (!c) return;
        c.width = window.innerWidth * dpr;
        c.height = window.innerHeight * dpr;
        c.style.width = window.innerWidth + 'px';
        c.style.height = window.innerHeight + 'px';
    });
    runnerShip.y = window.innerHeight - 200;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initGame() {
    const nameEl = document.getElementById('player-name');
    if(nameEl) nameEl.innerText = tgUser.first_name;

    userRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            updateUI();
            // ПРИНУДИТЕЛЬНО обновляем тебя в лидерборде при каждом чихе
            syncWithLeaderboard(); 
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
    if(e) e.style.width = (playerData.energy || 0) + "%";
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

// --- 5. ЛОГИКА КАРТЫ И ОТРИСОВКИ ---
function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // Если ты используешь resizeCanvas с умножением на DPR, 
    // здесь масштаб должен соответствовать способу отрисовки
    ctx.scale(dpr, dpr);

    if (bg.complete) ctx.drawImage(bg, 0, 0, window.innerWidth, window.innerHeight);

    planets.forEach(p => {
        if (p.img && p.img.complete) {
            ctx.save();
            
            // Смещение объекта
            ctx.translate(p.x, p.y); 

            if (p.id === 'station') {
                // Плавное покачивание станции (Float)
                const floatY = Math.sin(Date.now() * 0.002) * 5; 
                ctx.translate(0, floatY);
            } else {
                // Вращение планет
                p.rotation += p.speed;
                ctx.rotate(p.rotation);
            }
            
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });
    
    ctx.restore();
    requestAnimationFrame(draw);
}

function activatePlanet(id) {
    if (id === 'runner') {
        if (playerData.energy < 10) {
            tg.showAlert("Недостаточно энергии! Нужно минимум 10 ⚡");
            return;
        }
        playerData.energy -= 10;
        updateUI();
        userRef.update({ energy: playerData.energy });
        openRunnerWindow();
    } else if (id === 'build') {
        tg.showAlert("Режим «Создание» скоро!");
    } else if (id === 'shop') {
        tg.showAlert("Магазин закрыт на ремонт.");
    }
}

// --- 6. МЕХАНИКА РАННЕРА ---
function openRunnerWindow() {
    isRunnerActive = true;
    sessionQuants = 0; 
    sessionQubi = 0; 
    quants = [];

    // --- ОБНУЛЯЕМ ЗДОРОВЬЕ ПЕРЕД СТАРТОМ ---
    runnerShip.hp = 100; 
    runnerShip.maxHp = 100; 

    // Сбрасываем текст в новых ID
    const qEl = document.getElementById('runner-score-quant');
    const bEl = document.getElementById('runner-score-qubi');
    if (qEl) qEl.innerText = "0";
    if (bEl) bEl.innerText = "0";

    runnerWin.style.display = 'block';
    
    // Центрируем корабль QUBI
    runnerShip.x = window.innerWidth / 2;
    runnerShip.targetX = window.innerWidth / 2;
    
    // Поднимаем его (на всякий случай дублируем высоту здесь)
    runnerShip.y = window.innerHeight - 250; 
    
    spawnRunnerObject();
    requestAnimationFrame(runnerLoop);
}

function closeRunnerWindow() {
    isRunnerActive = false;
    
    // ПРИВОДИМ КОРАБЛЬ В ПОРЯДОК ПЕРЕД СЛЕДУЮЩИМ ВЫЛЕТОМ
    runnerShip.hp = 100; 

    playerData.quant += sessionQuants;
    playerData.qubi += sessionQubi;
    
    userRef.update({ 
        quant: playerData.quant, 
        qubi: playerData.qubi 
    }).then(() => {
        syncWithLeaderboard();
        updateUI(); 
        console.log("Данные сохранены и отправлены в ТОП");
    }).catch((err) => {
        console.error("Ошибка сохранения:", err);
    });
    
    runnerWin.style.display = 'none';
    quants = []; 
}

function runnerLoop() {
    if (!isRunnerActive) return;
    const dpr = window.devicePixelRatio || 1;
    runnerCtx.clearRect(0, 0, runnerCanvas.width, runnerCanvas.height);
    runnerCtx.save();
    runnerCtx.scale(dpr, dpr);

    if (runnerBg.complete) runnerCtx.drawImage(runnerBg, 0, 0, window.innerWidth, window.innerHeight);

    let dx = runnerShip.targetX - runnerShip.x;
    runnerShip.x += dx * runnerShip.lerpSpeed;

    for (let i = quants.length - 1; i >= 0; i--) {
        let q = quants[i];
        q.y += q.speed;

        // --- ОТРИСОВКА МЕТЕОРА И ОГНЯ ---
        if (q.type === 'meteor') {
            q.angle += q.rotationSpeed;
            if (meteorImg.complete) {
                runnerCtx.save();
                runnerCtx.translate(q.x, q.y);
                let tailLength = 5;
                for (let j = 0; j < tailLength; j++) {
                    let tailY = -j * (q.size / 3);
                    let tailSize = q.size * (1 - j/tailLength);
                    let alpha = 0.6 * (1 - j/tailLength);
                    runnerCtx.beginPath();
                    runnerCtx.fillStyle = `rgba(255, ${100 + j*30}, 0, ${alpha})`; 
                    runnerCtx.arc(0, tailY, tailSize / 2, 0, Math.PI * 2);
                    runnerCtx.fill();
                }
                runnerCtx.rotate(q.angle);
                runnerCtx.drawImage(meteorImg, -q.size/2, -q.size/2, q.size, q.size);
                runnerCtx.restore();
            }
        } 
        // --- ОТРИСОВКА ВРАЖЕСКОГО КОРАБЛЯ (ALIEN) ---
        else if (q.type === 'alien') {
            if (alienImg.complete) {
                runnerCtx.drawImage(alienImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
            }
            
            // Логика стрельбы врага
            let now = Date.now();
            if (now - (q.lastShot || 0) > (q.shotInterval || 1500)) {
                quants.push({
                    x: q.x,
                    y: q.y + q.size / 2,
                    size: 20,
                    speed: q.speed + 4,
                    type: 'plasma'
                });
                q.lastShot = now;
            }
        }
        // --- ОТРИСОВКА ВРАЖЕСКОГО ЗАРЯДА (ПЛАЗМЫ) ---
        else if (q.type === 'plasma') {
            runnerCtx.save();
            runnerCtx.beginPath();
            runnerCtx.fillStyle = '#00e5ff';
            runnerCtx.shadowBlur = 15;
            runnerCtx.shadowColor = '#00e5ff';
            runnerCtx.arc(q.x, q.y, q.size / 2, 0, Math.PI * 2);
            runnerCtx.fill();
            runnerCtx.restore();
        }
        else {
            let currentImg = (q.type === 'qubi') ? qubiImg : quantImg;
            if (currentImg.complete) runnerCtx.drawImage(currentImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
        }

        // --- СИСТЕМА СТОЛКНОВЕНИЙ ---
        if (Math.hypot(q.x - runnerShip.x, q.y - runnerShip.y) < (runnerShip.w/3 + q.size/2)) {
            
            if (q.type === 'meteor') {
                runnerShip.hp -= 50; 
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
                quants.splice(i, 1);
            } 
            else if (q.type === 'plasma') {
                runnerShip.hp -= 25; 
                if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
                quants.splice(i, 1);
            }
            else if (q.type === 'alien') {
                runnerShip.hp -= 100; // Прямое столкновение с врагом — фатально
                quants.splice(i, 1);
            }
            else {
                if (q.type === 'qubi') sessionQubi++;
                else sessionQuants++;
                
                const qEl = document.getElementById('runner-score-quant');
                const bEl = document.getElementById('runner-score-qubi');
                if (qEl) qEl.innerText = sessionQuants;
                if (bEl) bEl.innerText = sessionQubi;

                if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(q.type === 'qubi' ? 'medium' : 'light');
                quants.splice(i, 1);
                continue;
            }

            if (runnerShip.hp <= 0) {
                gameOver();
                return;
            }
            continue;
        }

        if (q.y > window.innerHeight + q.size) quants.splice(i, 1);
    }

    if (shipImg.complete) {
        runnerCtx.save();
        runnerCtx.translate(runnerShip.x, runnerShip.y);
        runnerCtx.rotate(dx * 0.02);
        runnerCtx.drawImage(shipImg, -runnerShip.w/2, -runnerShip.h/2, runnerShip.w, runnerShip.h);
        
        const barW = 60;
        const hpRate = Math.max(0, runnerShip.hp / runnerShip.maxHp);
        runnerCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        runnerCtx.fillRect(-barW/2, -runnerShip.h/2 - 15, barW, 6);
        runnerCtx.fillStyle = hpRate > 0.3 ? '#00ff00' : '#ff4444'; 
        runnerCtx.fillRect(-barW/2, -runnerShip.h/2 - 15, barW * hpRate, 6);
        
        runnerCtx.restore();
    }
    
    runnerCtx.restore();
    requestAnimationFrame(runnerLoop);
}

function spawnRunnerObject() {
    if (!isRunnerActive) return;

    let rand = Math.random() * 100;

    if (rand < 10) {
        // --- СПАВНИМ ВРАЖЕСКИЙ КОРАБЛЬ (ALIEN) ---
        let size = 70;
        quants.push({
            x: Math.random() * (window.innerWidth - size) + size / 2,
            y: -size,
            size: size,
            speed: 2 + Math.random() * 1.5, // Летит медленнее метеора, чтобы успеть выстрелить
            type: 'alien',
            lastShot: 0,
            shotInterval: 1500 // Стреляет каждые 1.5 секунды
        });
    } 
    else if (rand < 35) {
        // --- СПАВНИМ МЕТЕОР ---
        let size = 90;
        quants.push({
            x: Math.random() * (window.innerWidth - size) + size / 2,
            y: -size,
            size: size,
            speed: 4 + Math.random() * 3, 
            type: 'meteor',
            angle: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.1
        });
    } 
    else {
        // --- СПАВНИМ МОНЕТКУ ---
        let type = (Math.random() * 100 < 5) ? 'qubi' : 'quant';
        let newSize = type === 'qubi' ? 60 : 50; 
        quants.push({
            x: Math.random() * (window.innerWidth - newSize) + newSize / 2,
            y: -newSize,
            size: newSize,
            speed: 2.5 + Math.random() * 3.5,
            type: type
        });
    }

    let nextSpawn = 800 + Math.random() * 500; // Немного ускорим темп игры
    if (this.spawnTimer) clearTimeout(this.spawnTimer);
    this.spawnTimer = setTimeout(spawnRunnerObject, nextSpawn);
}

// --- 7. ЛУНА, ЛИДЕРЫ И РЕГЕН ---
function openMoonMenu() {
    const modal = document.getElementById('moon-modal');
    if (modal) {
        modal.style.display = 'flex';
        updateMoonUI(); // Чтобы сразу видеть актуальный лимит
    }
}

// Функция самой переработки (логика)
function exchangeEnergy(type) {
    const today = new Date().toDateString();
    
    // Проверка смены дня (сброс лимитов)
    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    let cost = 0;
    let reward = 10;
    let limitMax = 0;
    let currentProcessed = 0;

    // Настраиваем условия в зависимости от типа ресурса
    if (type === 'quant') {
        cost = 50;
        limitMax = 500;
        currentProcessed = playerData.dailyExchangeQuant || 0;
        
        if (playerData.quant < cost) {
            alert("Недостаточно QUANT!");
            return;
        }
    } else if (type === 'qubi') {
        cost = 5;
        limitMax = 50;
        currentProcessed = playerData.dailyExchangeQubi || 0;

        if (playerData.qubi < cost) {
            alert("Недостаточно QUBI!");
            return;
        }
    }

    // Общие проверки
    if (currentProcessed + cost > limitMax) {
        alert("Дневной лимит переработки исчерпан!");
        return;
    }
    if (playerData.energy >= 100) {
        alert("Энергия уже на максимуме!");
        return;
    }

    // Выполнение обмена
    if (type === 'quant') {
        playerData.quant -= cost;
        playerData.dailyExchangeQuant = currentProcessed + cost;
    } else {
        playerData.qubi -= cost;
        playerData.dailyExchangeQubi = currentProcessed + cost;
    }

    playerData.energy = Math.min(100, (playerData.energy || 0) + reward);

    // Сохранение в Firebase
    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        energy: playerData.energy,
        dailyExchangeQuant: playerData.dailyExchangeQuant,
        dailyExchangeQubi: playerData.dailyExchangeQubi,
        lastExchangeDate: playerData.lastExchangeDate
    }).then(() => {
        if (window.Telegram && Telegram.WebApp.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        
        // ВАЖНО: Обновляем интерфейс после обмена
        updateMoonUI(); 
        updateUI(); // Обновляем статы на главном экране (энергию)
    }).catch(err => {
        console.error("Ошибка обмена:", err);
    });
}

// Функция обновления текста в модалке (чтобы цифры менялись на глазах)
function updateMoonUI() {
    const today = new Date().toDateString();

    // 1. Проверяем/сбрасываем лимиты, если наступил новый день
    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    // 2. Обновляем запасы игрока в нижней части окна
    const resQuantEl = document.getElementById('res-amount-quant');
    const resQubiEl = document.getElementById('res-amount-qubi');
    if (resQuantEl) resQuantEl.innerText = Math.floor(playerData.quant || 0) + " QNT";
    if (resQubiEl) resQubiEl.innerText = Math.floor(playerData.qubi || 0) + " QUB";

    // --- ЛИНИЯ QUANT (Лимит 500) ---
    const qProcessed = playerData.dailyExchangeQuant || 0;
    const qTotal = 500;
    const qPercent = Math.min(100, (qProcessed / qTotal) * 100);

    const qText = document.getElementById('limit-quant-text');
    const qFill = document.getElementById('limit-quant-fill');
    const qPercText = document.getElementById('limit-quant-percent');

    if (qText) qText.innerText = qProcessed;
    if (qPercText) qPercText.innerText = Math.floor(qPercent) + "%";
    if (qFill) {
        qFill.style.width = qPercent + "%";
        // Красный цвет, если лимит исчерпан
        qFill.style.background = (qPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #00e5ff, #007bff)';
    }

    // --- ЛИНИЯ QUBI (Лимит 50) ---
    const bProcessed = playerData.dailyExchangeQubi || 0;
    const bTotal = 50;
    const bPercent = Math.min(100, (bProcessed / bTotal) * 100);

    const bText = document.getElementById('limit-qubi-text');
    const bFill = document.getElementById('limit-qubi-fill');
    const bPercText = document.getElementById('limit-qubi-percent');

    if (bText) bText.innerText = bProcessed;
    if (bPercText) bPercText.innerText = Math.floor(bPercent) + "%";
    if (bFill) {
        bFill.style.width = bPercent + "%";
        // Красный цвет, если лимит исчерпан
        bFill.style.background = (bPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #a855f7, #6b21a8)';
    }
}

function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const container = document.getElementById('leaderboard-container');
    
    if (modal) modal.style.display = 'flex';
    if (container) container.innerHTML = '<div style="text-align:center; padding:20px;">Загрузка...</div>';

    // Сначала принудительно обновляем твои данные в базе перед открытием топа
    syncWithLeaderboard();

    db.ref('leaderboard').orderByChild('qubi').limitToLast(100).once('value', (snap) => {
        if (container) {
            container.innerHTML = '';
            let players = [];
            
            // Собираем данные и добавляем ID игрока для точной проверки
            snap.forEach(child => {
                let data = child.val();
                data.uid = child.key; // Сохраняем ID из ключа Firebase
                players.push(data);
            });

            // Сортируем: самые богатые сверху
            players.reverse().forEach((p, i) => {
                const row = document.createElement('div');
                row.className = 'player-row';
                
                // СРАВНИВАЕМ ПО ID (это 100% точность), а не по имени
                const isMe = p.uid === String(tgUser.id) ? 'style="color: #00e5ff; font-weight: bold; background: rgba(0,229,255,0.1);"' : '';
                
                row.innerHTML = `
                    <span ${isMe}>${i + 1}. ${p.name || 'Unknown'}</span>
                    <span class="score" ${isMe}>${Math.floor(p.qubi || 0)} QUBI</span>
                `;
                container.appendChild(row);
            });
        }
    });
}

function regenerateEnergy() {
    if (!playerData.lastEnergyUpdate) return; // Если данных еще нет

    const now = Date.now();
    const MAX_ENERGY = 100;
    const REGEN_AMOUNT_PER_HOUR = 20;
    const STOP_LIMIT_HOURS = 4; // Лимит простоя

    // Считаем сколько времени прошло в часах
    let hoursPassed = (now - playerData.lastEnergyUpdate) / (1000 * 60 * 60);

    // Условие: если прошло больше 4 часов, считаем только за 4
    if (hoursPassed > STOP_LIMIT_HOURS) {
        hoursPassed = STOP_LIMIT_HOURS;
    }

    // Начисляем энергию только если прошел хотя бы 1 час
    if (hoursPassed >= 1) {
        const fullHours = Math.floor(hoursPassed);
        const energyToAdd = fullHours * REGEN_AMOUNT_PER_HOUR;

        // Обновляем энергию, не превышая максимум
        const newEnergy = Math.min(MAX_ENERGY, (playerData.energy || 0) + energyToAdd);
        
        // Обновляем время. 
        // ВАЖНО: отнимаем только целые часы, чтобы "хвостик" минут не пропадал
        const updatedTime = playerData.lastEnergyUpdate + (fullHours * 1000 * 60 * 60);

        playerData.energy = newEnergy;
        playerData.lastEnergyUpdate = updatedTime;

        // Сохраняем в базу
        userRef.update({ 
            energy: playerData.energy,
            lastEnergyUpdate: updatedTime 
        });

        updateUI();
        console.log(`Регенерация: +${energyToAdd} энергии за ${fullHours} ч.`);
    }
}

function gameOver() {
    isRunnerActive = false;
    if (this.spawnTimer) clearTimeout(this.spawnTimer);

    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
    }

    // Универсальное сообщение
    alert(`ИГРА ОКОНЧЕНА!\n\nТвой корабль QUBI получил критические повреждения.\n\nСобрано QUANT: ${sessionQuants}\nСобрано QUBI: ${sessionQubi}`);

    closeRunnerWindow(); 
}

// --- 8. СОБЫТИЯ УПРАВЛЕНИЯ ---
function isUiHit(target) { return target.closest('.exit-btn') || target.closest('.score-display'); }

function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    
    // Получаем координаты тача или мыши
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    // Считаем клик БЕЗ умножения на dpr
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    planets.forEach(p => {
        // Считаем дистанцию между логическим кликом и логической планетой
        const dist = Math.hypot(clickX - p.x, clickY - p.y);
        
        // Зона клика (размер планеты)
        if (dist < p.size * 0.8) { 
            if (window.Telegram && Telegram.WebApp.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }

            if (p.action) {
                p.action(); // Откроет станцию
            } else if (p.id === 'leaderboard') {
                openLeaderboard();
            } else if (p.id === 'moon') {
                openMoonMenu();
            } else {
                activatePlanet(p.id);
            }
        }
    });
}

// 2. Привязываем новую функцию к кликам
canvas.addEventListener('click', handleCanvasClick);
canvas.addEventListener('touchstart', (e) => {
    handleCanvasClick(e);
    if (e.cancelable) e.preventDefault();
}, { passive: false });

// Оставляем управление кораблем (оно у тебя верное)
runnerWin.addEventListener('touchstart', (e) => {
    if (!isRunnerActive || isUiHit(e.target)) return;
    runnerShip.targetX = e.touches[0].clientX;
}, { passive: false });

runnerWin.addEventListener('touchmove', (e) => {
    if (!isRunnerActive || isUiHit(e.target)) return;
    runnerShip.targetX = e.touches[0].clientX;
    if (e.cancelable) e.preventDefault();
}, { passive: false });

// Кнопки интерфейса
document.getElementById('exit-runner').onclick = closeRunnerWindow;
document.getElementById('process-btn').onclick = startRefining; 

document.getElementById('close-moon').onclick = () => {
    document.getElementById('moon-modal').style.display = 'none';
};

document.getElementById('close-leaderboard').onclick = () => {
    document.getElementById('leaderboard-modal').style.display = 'none';
};

// ЗАПУСК
bg.onload = () => { initGame(); draw(); };
if (bg.complete) { initGame(); draw(); }

function buyModule(moduleId, priceQuant, priceQubi, name, type, power) {
    // 1. Проверяем баланс игрока
    if (playerData.quant < priceQuant || playerData.qubi < priceQubi) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        alert("Недостаточно ресурсов для покупки!");
        return;
    }

    // 2. Списываем валюту
    playerData.quant -= priceQuant;
    playerData.qubi -= priceQubi;

    // 3. Создаем объект модуля
    if (!playerData.inventory) playerData.inventory = [];
    
    const newModule = {
        id: moduleId + "_" + Date.now(), // Уникальный ID, чтобы можно было купить 2 одинаковых модуля
        name: name,
        type: type,   // 'hp', 'barrier', 'income_quant', 'income_qubi'
        power: power
    };

    playerData.inventory.push(newModule);

    // 4. Сохраняем всё в Firebase
    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        inventory: playerData.inventory
    }).then(() => {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        console.log("Покупка успешна!");
        updateUI(); // Обновляем баланс на главном экране
    }).catch(err => {
        console.error("Ошибка при покупке:", err);
    });
}

function calculateCurrentStats() {
    let stats = {
        hp: 100,
        barrier: 0,
        energy: 100,
        incomeQuant: 0,
        incomeQubi: 0
    };

    if (playerData.equipped && playerData.inventory) {
        playerData.equipped.forEach(modId => {
            const module = playerData.inventory.find(m => m.id === modId);
            if (module) {
                if (module.type === 'hp') stats.hp += module.power;
                if (module.type === 'barrier') stats.barrier += module.power;
                if (module.type === 'income_quant') stats.incomeQuant += module.power;
                if (module.type === 'income_qubi') stats.incomeQubi += module.power;
                // Энергию обычно делаем как множитель или макс. запас
            }
        });
    }
    return stats;
}

function openStation() {
    document.getElementById('station-modal').style.display = 'flex';

    // Получаем актуальные статы с учетом модулей
    const current = calculateCurrentStats();

    // 1. Заполняем текстовые блоки
    document.getElementById('stat-hp').innerText = current.hp;
    document.getElementById('stat-barrier').innerText = current.barrier;
    document.getElementById('stat-energy').innerText = Math.floor(playerData.energy || 0) + '%';
    document.getElementById('stat-income-quant').innerText = current.incomeQuant;
    document.getElementById('stat-income-qubi').innerText = current.incomeQubi;

    // 2. Отрисовка АКТИВНЫХ СЛОТОВ (верхние 5 ячеек)
    const activeContainer = document.getElementById('active-slots-container');
    if (activeContainer) {
        activeContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const slot = document.createElement('div');
            const equippedId = playerData.equipped ? playerData.equipped[i] : null;
            
            if (equippedId) {
                const mod = playerData.inventory.find(m => m.id === equippedId);
                slot.className = 'slot-mini filled';
                slot.innerHTML = `<img src="assets/modules/${mod.type}.png" style="width:100%">`;
            } else {
                slot.className = 'slot-mini empty';
            }
            activeContainer.appendChild(slot);
        }
    }

    // 3. Отрисовка ИНВЕНТАРЯ (нижняя листалка)
    const scrollList = document.getElementById('inventory-scroll-list');
    scrollList.innerHTML = '';

    if (playerData.inventory && playerData.inventory.length > 0) {
        playerData.inventory.forEach(item => {
            const isEquipped = playerData.equipped?.includes(item.id);
            const card = document.createElement('div');
            card.className = `module-card ${isEquipped ? 'equipped' : ''}`;
            
            card.innerHTML = `
                <img src="assets/modules/${item.type}.png" style="width:35px">
                <span>${item.name}</span>
                <small style="color: #00e5ff">+${item.power}</small>
            `;
            
            card.onclick = () => toggleModule(item.id);
            scrollList.appendChild(card);
        });
    } else {
        scrollList.innerHTML = '<div class="no-modules">Купите модули в магазине</div>';
    }
}

function toggleModule(modId) {
    if (!playerData.equipped) playerData.equipped = [];
    
    const index = playerData.equipped.indexOf(modId);
    if (index > -1) {
        // Снимаем модуль
        playerData.equipped.splice(index, 1);
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    } else {
        // Ставим модуль (проверка на лимит 5)
        if (playerData.equipped.length < 5) {
            playerData.equipped.push(modId);
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            // Можно вывести сообщение, что слоты заняты
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            return; 
        }
    }

    // Сохраняем в Firebase и обновляем окно
    userRef.update({ equipped: playerData.equipped }).then(() => {
        openStation(); 
    });
}

function closeStation() {
    // 1. Скрываем окно
    const modal = document.getElementById('station-modal');
    if (modal) modal.style.display = 'none';

    // 2. На всякий случай сохраняем текущий набор модулей в Firebase
    // Это гарантирует, что выбор игрока не пропадет при перезагрузке
    if (playerData.equipped) {
        userRef.update({ 
            equipped: playerData.equipped 
        }).then(() => {
            console.log("Конфигурация модулей сохранена");
        }).catch((err) => {
            console.error("Ошибка сохранения ангара:", err);
        });
    }

    // 3. (Опционально) Если ты хочешь, чтобы статы на главном экране 
    // тоже обновились после смены модулей:
    if (typeof updateUI === "function") {
        updateUI();
    }
}
