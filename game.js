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

const planets = [
    { id: 'runner', src: 'assets/quant.png', x: 0.5, y: 0.5, size: 120, rotation: 0, speed: 0.002, img: new Image() },
    { id: 'build', src: 'assets/earth.png', x: 0.22, y: 0.5, size: 75, rotation: 0, speed: 0.001, img: new Image() },
    { id: 'shop', src: 'assets/mars.png', x: 0.78, y: 0.5, size: 75, rotation: 0, speed: -0.001, img: new Image() },
    { id: 'moon', src: 'assets/moon.png', x: 0.5, y: 0.72, size: 60, rotation: 0, speed: 0.003, img: new Image() },
    { id: 'leaderboard', src: 'assets/neptun.png', x: 0.5, y: 0.32, size: 70, rotation: 0, speed: -0.0015, img: new Image() }
];
planets.forEach(p => { p.img.src = p.src; });

let runnerShip = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 150,
    w: 80, h: 80,
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
    runnerShip.y = window.innerHeight - 150;
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
    ctx.scale(dpr, dpr);

    if (bg.complete) ctx.drawImage(bg, 0, 0, window.innerWidth, window.innerHeight);

    planets.forEach(p => {
        if (p.img.complete) {
            ctx.save();
            ctx.translate(p.x * window.innerWidth, p.y * window.innerHeight);
            p.rotation += p.speed;
            ctx.rotate(p.rotation);
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });
    ctx.restore();
    requestAnimationFrame(draw);
}

function processInput(e) {
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    planets.forEach(p => {
        const posX = p.x * window.innerWidth;
        const posY = p.y * window.innerHeight;
        if (Math.hypot(clickX - posX, clickY - posY) < (p.size / 2) + 15) {
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            if (p.id === 'leaderboard') openLeaderboard();
            else if (p.id === 'moon') openMoonMenu();
            else activatePlanet(p.id);
        }
    });
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

    // Сбрасываем текст в новых ID
    const qEl = document.getElementById('runner-score-quant');
    const bEl = document.getElementById('runner-score-qubi');
    if (qEl) qEl.innerText = "0";
    if (bEl) bEl.innerText = "0";

    runnerWin.style.display = 'block';
    runnerShip.x = window.innerWidth / 2;
    runnerShip.targetX = window.innerWidth / 2;
    
    spawnRunnerObject();
    requestAnimationFrame(runnerLoop);
}

function closeRunnerWindow() {
    isRunnerActive = false;
    
    // Прибавляем собранное за забег
    playerData.quant += sessionQuants;
    playerData.qubi += sessionQubi;
    
    // Сохраняем в Firebase
    userRef.update({ 
        quant: playerData.quant, 
        qubi: playerData.qubi 
    }).then(() => {
        syncWithLeaderboard();
        updateUI(); // <-- ДОБАВЬ ЭТО: чтобы на главном экране сразу выросли цифры
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

        // --- ЛОГИКА ДЛЯ МЕТЕОРА ---
        if (q.type === 'meteor') {
            q.angle += q.rotationSpeed; // Вращаем метеор

            if (meteorImg.complete) {
                runnerCtx.save();
                runnerCtx.translate(q.x, q.y);
                
                // === ЭФФЕКТ УХОДЯЩЕГО ОГНЯ ===
                // Рисуем несколько полупрозрачных кругов сзади метеора
                let tailLength = 5;
                for (let j = 0; j < tailLength; j++) {
                    let tailY = -j * (q.size / 3); // Смещение назад
                    let tailSize = q.size * (1 - j/tailLength); // Уменьшение размера
                    let alpha = 0.6 * (1 - j/tailLength); // Прозрачность
                    
                    runnerCtx.beginPath();
                    // Цвет огня: от оранжевого к красному
                    runnerCtx.fillStyle = `rgba(255, ${100 + j*30}, 0, ${alpha})`; 
                    runnerCtx.arc(0, tailY, tailSize / 2, 0, Math.PI * 2);
                    runnerCtx.fill();
                }

                // === РИСУЕМ САМ МЕТЕОР ===
                runnerCtx.rotate(q.angle);
                runnerCtx.drawImage(meteorImg, -q.size/2, -q.size/2, q.size, q.size);
                runnerCtx.restore();
            }
        } 
        // --- ЛОГИКА ДЛЯ МОНЕТОК (старая) ---
        else {
            let currentImg = (q.type === 'qubi') ? qubiImg : quantImg;
            if (currentImg.complete) runnerCtx.drawImage(currentImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
        }

        // --- ПРОВЕРКА СТОЛКНОВЕНИЯ ---
        if (Math.hypot(q.x - runnerShip.x, q.y - runnerShip.y) < (runnerShip.w/3 + q.size/2)) {
            
            // СТОЛКНУЛИСЬ С МЕТЕОРОМ -> КОНЕЦ ИГРЫ
            if (q.type === 'meteor') {
                gameOver(); // Вызываем функцию проигрыша
                return; // Прерываем цикл, игра окончена
            } 
            
            // СОБРАЛИ МОНЕТКУ (старая логика)
            else {
                if (q.type === 'qubi') {
                    sessionQubi++;
                    const qubiEl = document.getElementById('runner-score-qubi');
                    if (qubiEl) qubiEl.innerText = sessionQubi;
                } else {
                    sessionQuants++;
                    const quantEl = document.getElementById('runner-score-quant');
                    if (quantEl) quantEl.innerText = sessionQuants;
                }
                if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(q.type === 'qubi' ? 'medium' : 'light');
                quants.splice(i, 1);
                continue;
            }
        }
        if (q.y > window.innerHeight + q.size) quants.splice(i, 1);
    }

    if (shipImg.complete) {
        runnerCtx.save();
        runnerCtx.translate(runnerShip.x, runnerShip.y);
        runnerCtx.rotate(dx * 0.02);
        runnerCtx.drawImage(shipImg, -runnerShip.w/2, -runnerShip.h/2, runnerShip.w, runnerShip.h);
        runnerCtx.restore();
    }
    runnerCtx.restore();
    requestAnimationFrame(runnerLoop);
}

function spawnRunnerObject() {
    if (!isRunnerActive) return;

    // Сначала определяем, ЧТО заспавнить: монетку (85%) или метеор (15%)
    if (Math.random() * 100 < 35) {
        // СПАВНИМ МЕТЕОР
        let size = 90; // Метеор должен быть заметным и опасным
        quants.push({
            x: Math.random() * (window.innerWidth - size) + size / 2,
            y: -size,
            size: size,
            // Метеоры могут лететь чуть быстрее монет
            speed: 4 + Math.random() * 3, 
            type: 'meteor', // Новый тип объекта
            angle: Math.random() * Math.PI * 2, // Случайный поворот метеора
            rotationSpeed: (Math.random() - 0.5) * 0.1 // Медленное вращение
        });
    } else {
        // СПАВНИМ МОНЕТКУ (твоя старая логика)
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

    // Время до следующего спавна (оставляем как есть)
    let nextSpawn = 900 + Math.random() * 600;
    
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
function startRefining() {
    const today = new Date().toLocaleDateString();
    const amountToProcess = 5;

    // Инициализируем лимит, если его еще нет в профиле
    if (!playerData.factoryLimit) {
        playerData.factoryLimit = { date: today, processedToday: 0 };
    }

    // Сброс лимита, если наступил новый день
    if (playerData.factoryLimit.date !== today) {
        playerData.factoryLimit.date = today;
        playerData.factoryLimit.processedToday = 0;
    }

    const remainingLimit = 50 - playerData.factoryLimit.processedToday;

    if (remainingLimit <= 0) {
        tg.showAlert("Лимит 50 QUANT на сегодня исчерпан!");
        return;
    }

    if (playerData.quant >= amountToProcess) {
        playerData.quant -= amountToProcess;
        playerData.energy = Math.min(MAX_ENERGY, (playerData.energy || 0) + 10);
        playerData.factoryLimit.processedToday += amountToProcess;

        // Сохраняем ВСЁ в Firebase, включая обновленный лимит
        userRef.update({
            quant: playerData.quant,
            energy: playerData.energy,
            factoryLimit: playerData.factoryLimit // ТЕПЕРЬ ЛИМИТ В БАЗЕ!
        }).then(() => {
            updateUI();
            updateMoonUI();
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('success');
        });
    } else {
        tg.showAlert("Недостаточно QUANT!");
    }
}

// Функция обновления текста в модалке (чтобы цифры менялись на глазах)
function updateMoonUI() {
    const resAmt = document.getElementById('res-amount');
    const limitText = document.getElementById('factory-limit-text');
    const limitFill = document.getElementById('limit-bar-fill');
    
    if (resAmt) resAmt.innerText = Math.floor(playerData.quant || 0);
    
    if (playerData.factoryLimit) {
        const today = new Date().toLocaleDateString();
        // Если день сменился, считаем, что потрачено 0
        const processed = (playerData.factoryLimit.date === today) ? playerData.factoryLimit.processedToday : 0;
        const totalLimit = 50;
        
        // Обновляем текст (например: "25 / 50")
        if (limitText) limitText.innerText = `${processed} / ${totalLimit}`;
        
        // Обновляем полоску (в процентах)
        if (limitFill) {
            const percentage = (processed / totalLimit) * 100;
            limitFill.style.width = `${percentage}%`;
            
            // Если лимит исчерпан, можно подсветить красным
            if (percentage >= 100) {
                limitFill.style.background = '#ff4444';
            } else {
                limitFill.style.background = 'linear-gradient(90deg, #00e5ff, #007bff)';
            }
        }
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
    const now = Date.now();
    const hoursPassed = (now - lastEnergyUpdate) / (1000 * 60 * 60);
    if (hoursPassed >= 1) {
        const energyToAdd = Math.floor(hoursPassed) * 10;
        playerData.energy = Math.min(MAX_ENERGY, (playerData.energy || 0) + energyToAdd);
        lastEnergyUpdate = now;
        userRef.update({ energy: playerData.energy });
        updateUI();
    }
}

function gameOver() {
    isRunnerActive = false;
    if (this.spawnTimer) clearTimeout(this.spawnTimer); // Останавливаем спавн

    // Сильное вибро при столкновении
    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
    }

    // Простенький алерт (лучше потом заменить на красивое UI окно)
    alert(`ВРЕЗАЛСЯ В МЕТЕОР!\n\nСобрано Квантов: ${sessionQuants}\nСобрано Qubi: ${sessionQubi}`);

    // Закрываем окно игры и сохраняем то, что успели собрать
    closeRunnerWindow(); 
}

// --- 8. СОБЫТИЯ УПРАВЛЕНИЯ ---
function isUiHit(target) { return target.closest('.exit-btn') || target.closest('.score-display'); }

runnerWin.addEventListener('touchstart', (e) => {
    if (!isRunnerActive || isUiHit(e.target)) return;
    runnerShip.targetX = e.touches[0].clientX;
}, { passive: false });

runnerWin.addEventListener('touchmove', (e) => {
    if (!isRunnerActive || isUiHit(e.target)) return;
    runnerShip.targetX = e.touches[0].clientX;
    if (e.cancelable) e.preventDefault();
}, { passive: false });

canvas.addEventListener('click', processInput);

// Кнопки окон
document.getElementById('exit-runner').onclick = closeRunnerWindow;

// Кнопка завода на Луне (ТВОЯ НОВАЯ СТРОКА)
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
