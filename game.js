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

const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();
if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
tg.isClosingConfirmationEnabled = true;
tg.setHeaderColor('#000000');
tg.setBackgroundColor('#000000');

if (tg.requestFullscreen) {
    try { tg.requestFullscreen(); } catch (e) { console.error(e); }
}

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

const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);

let playerData = { 
    quant: 0, 
    qubi: 0, 
    energy: 100, 
    level: 1,
    factoryLimit: {
        date: new Date().toLocaleDateString(),
        processedToday: 0
    }
};

function regenerateEnergy() {
    // 1. Проверяем, загружены ли данные
    if (typeof playerData === 'undefined' || !playerData || !window.userRef) return;

    const now = Date.now();
    const MAX_VAL = 100;
    const REGEN_PER_HOUR = 20;
    const MS_PER_UNIT = (60 * 60 * 1000) / REGEN_PER_HOUR; 
    const STOP_LIMIT = 4 * 60 * 60 * 1000; 

    let lastUpdate = Number(playerData.lastEnergyUpdate);

    if (!lastUpdate || isNaN(lastUpdate)) {
        playerData.lastEnergyUpdate = now;
        window.userRef.update({ lastEnergyUpdate: now });
        return;
    }

    let timePassed = now - lastUpdate;
    if (timePassed > STOP_LIMIT) timePassed = STOP_LIMIT;

    const energyToAdd = Math.floor(timePassed / MS_PER_UNIT);

    if (energyToAdd > 0 && (playerData.energy || 0) < MAX_VAL) {
        const newEnergy = Math.min(MAX_VAL, (playerData.energy || 0) + energyToAdd);
        const updatedTime = lastUpdate + (energyToAdd * MS_PER_UNIT);

        playerData.energy = newEnergy;
        playerData.lastEnergyUpdate = updatedTime;

        window.userRef.update({ 
            energy: playerData.energy,
            lastEnergyUpdate: updatedTime 
        }).then(() => {
            console.log(`🔋 Регенерация: +${energyToAdd}`);
            if (typeof updateUI === 'function') updateUI();
        }).catch(e => console.error("Ошибка обновления энергии:", e));
    }
}

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
const lightningImg = new Image(); lightningImg.src = 'assets/molniya.png';

const planets = [
    { id: 'runner', src: 'assets/quant.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, size: 120, rotation: 0, speed: 0.002, img: new Image() },
    { id: 'build', src: 'assets/earth.png', x: window.innerWidth * 0.22, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: 0.001, img: new Image() },
    { id: 'shop', src: 'assets/mars.png', x: window.innerWidth * 0.78, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: -0.001, img: new Image() },
    { id: 'moon', src: 'assets/moon.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.72, size: 60, rotation: 0, speed: 0.003, img: new Image() },
    { id: 'leaderboard', src: 'assets/neptun.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.32, size: 70, rotation: 0, speed: -0.0015, img: new Image() },
    { id: 'station', src: 'assets/station.png', x: window.innerWidth * 0.2, y: window.innerHeight * 0.4, size: 70, rotation: 0, speed: 0, img: new Image(), action: () => openStation() }
];

const SHOP_MODULES = [
    // --- Энергия (Max Energy) ---
    { id: 'mod_en_1', name: 'Медный конденсатор', type: 'energy_max', power: 25, price: 2500, currency: 'QUANT', rarity: 'common', desc: 'Увеличивает макс. запас энергии на 25 ед.', img: 'module_01.png' },
    { id: 'mod_en_2', name: 'Ионная ячейка', type: 'energy_max', power: 50, price: 5000, currency: 'QUANT', rarity: 'common', desc: 'Стабильный поток ионов дает +50 к энергии.', img: 'module_11.png' },
    { id: 'mod_en_3', name: 'Плазменный блок', type: 'energy_max', power: 100, price: 500, currency: 'QUBI', rarity: 'uncommon', desc: 'Сжатая плазма расширяет бак до +100 ед.', img: 'module_04.png' },
    { id: 'mod_en_4', name: 'Темная материя (S)', type: 'energy_max', power: 200, price: 1200, currency: 'QUBI', rarity: 'rare', desc: 'Энергия из пустоты. Дает +200 к запасу.', img: 'module_14.png' },
    { id: 'mod_en_5', name: 'Сингулярность', type: 'energy_max', power: 500, price: 0.5, currency: 'TON', rarity: 'epic', desc: 'Горизонт событий в твоем кармане: +500 энергии.', img: 'module_09.png' },

    // --- Регенерация (Regen Speed) ---
    { id: 'mod_reg_1', name: 'Кварцевый чип', type: 'energy_regen', power: 30000, price: 3000, currency: 'QUANT', rarity: 'common', desc: 'Ускоряет регенерацию на 30 секунд.', img: 'module_02.png' },
    { id: 'mod_reg_2', name: 'Турбо-инъектор', type: 'energy_regen', power: 60000, price: 400, currency: 'QUBI', rarity: 'uncommon', desc: 'Впрыск топлива ускоряет реген на 1 минуту.', img: 'module_12.png' },
    { id: 'mod_reg_3', name: 'Разгонщик частот', type: 'energy_regen', power: 90000, price: 700, currency: 'QUBI', rarity: 'uncommon', desc: 'Снимает лимиты: -90 сек ожидания.', img: 'module_05.png' },
    { id: 'mod_reg_4', name: 'Квантовый резонатор', type: 'energy_regen', power: 120000, price: 1500, currency: 'QUBI', rarity: 'rare', desc: 'Регенерация энергии всего за 1 минуту.', img: 'module_15.png' },
    { id: 'mod_reg_5', name: 'Хронос-двигатель', type: 'energy_regen', power: 160000, price: 0.8, currency: 'TON', rarity: 'epic', desc: 'Почти мгновенное восстановление: реген 20 сек!', img: 'module_08.png' },

    // --- Броня (HP) ---
    { id: 'mod_hp_1', name: 'Стальная пластина', type: 'hp', power: 50, price: 2000, currency: 'QUANT', rarity: 'common', desc: 'Базовая защита корпуса: +50 HP.', img: 'module_03.png' },
    { id: 'mod_hp_2', name: 'Титановый каркас', type: 'hp', power: 100, price: 4500, currency: 'QUANT', rarity: 'common', desc: 'Легкий и прочный сплав: +100 HP.', img: 'module_13.png' },
    { id: 'mod_hp_3', name: 'Керамический композит', type: 'hp', power: 150, price: 600, currency: 'QUBI', rarity: 'uncommon', desc: 'Поглощает удары метеоров: +150 HP.', img: 'module_06.png' },
    { id: 'mod_hp_4', name: 'Силовое поле v.1', type: 'hp', power: 250, price: 1800, currency: 'QUBI', rarity: 'rare', desc: 'Энергетический щит вокруг судна: +250 HP.', img: 'module_16.png' },
    { id: 'mod_hp_5', name: 'Нано-защита "Омни"', type: 'hp', power: 500, price: 0.6, currency: 'TON', rarity: 'epic', desc: 'Технологии древних: +500 HP.', img: 'module_10.png' },

    // --- Гибриды (Hybrid) ---
    { id: 'mod_hyb_1', name: 'Альфа-ядро', type: 'hybrid', power: {hp: 100, en: 100}, price: 2500, currency: 'QUBI', rarity: 'rare', desc: 'Баланс во всем: +100 HP и +100 Энергии.', img: 'module_17.png' },
    { id: 'mod_hyb_2', name: 'Прототип "Звезда"', type: 'hybrid', power: {hp: 200, reg: 120000}, price: 1.2, currency: 'TON', rarity: 'epic', desc: 'Легендарный образец: +200 HP и быстрый реген.', img: 'module_18.png' },
    { id: 'mod_hyb_3', name: 'QUANT-Мастер', type: 'hybrid', power: {en: 250, reg: 120000}, price: 1.0, currency: 'TON', rarity: 'epic', desc: 'Для марафонцев: +250 энергии и реген 1 мин.', img: 'module_19.png' },
    { id: 'mod_hyb_4', name: 'Дрон Mk.1', type: 'hybrid', power: {hp: 300, en: 150}, price: 1.5, currency: 'TON', rarity: 'epic', desc: 'Верный спутник: +300 HP и +150 энергии.', img: 'module_20.png' },
    { id: 'mod_hyb_5', name: 'Бесконечность', type: 'hybrid', power: {hp: 500, en: 500, reg: 150000}, price: 2.5, currency: 'TON', rarity: 'legendary', desc: 'Абсолютная власть над космосом.', img: 'module_07.png' }
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

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://plugy17.github.io/QUBI/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-btn'
});

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    [canvas, runnerCanvas].forEach(c => {
        if (!c) return;
        
        // Устанавливаем внутреннее разрешение
        c.width = width * dpr;
        c.height = height * dpr;
        
        // Устанавливаем физический размер в браузере
        c.style.width = width + 'px';
        c.style.height = height + 'px';

        // Важно: масштабируем контекст рисования под DPR
        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Сброс трансформации перед масштабированием
        ctx.scale(dpr, dpr);
    });

    if (typeof runnerShip !== 'undefined') {
        runnerShip.y = height - 200;
    }
}

// Слушатель событий
window.addEventListener('resize', resizeCanvas);

resizeCanvas();

// И вызываем повторно через короткие паузы, когда WebView стабилизируется
setTimeout(resizeCanvas, 100);
setTimeout(resizeCanvas, 300);

function initGame() {
    const nameEl = document.getElementById('player-name');
    if(nameEl) nameEl.innerText = tgUser.first_name;

    userRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            
            // Проверка и инициализация данных обмена, если их нет
            if (!playerData.dailyExchangeQuant) playerData.dailyExchangeQuant = 0;
            if (!playerData.dailyExchangeQubi) playerData.dailyExchangeQubi = 0;
            
            // ВАЖНО: Запускаем расчет энергии сразу после загрузки данных
            regenerateEnergy(); 
            
            updateUI();
            syncWithLeaderboard(); 
        } else {
            // Если игрок новый, записываем текущее время как точку отсчета регенерации
            playerData.lastEnergyUpdate = Date.now();
            userRef.set(playerData);
        }
        hideLoading();
    });
}

function openShop() {
    const shopModal = document.getElementById('shop-modal');
    const shopList = document.getElementById('shop-list');
    
    if (!shopList || !shopModal) return;
    
    shopList.innerHTML = ''; // Очистка

    SHOP_MODULES.forEach(item => {
        // Проверяем наличие модуля в инвентаре игрока
        const isOwned = playerData.inventory && playerData.inventory.some(owned => 
            owned.shopId === item.id || owned.id === item.id
        );
        
        const itemEl = document.createElement('div');
        itemEl.className = `shop-item ${item.rarity}`;
        
        const priceText = item.currency === 'TON' ? `${item.price} TON` : `${item.price} ${item.currency}`;

        itemEl.innerHTML = `
            <img src="assets/shop/${item.img}" style="width:70px; height:70px; object-fit:contain; margin-bottom:8px;">
            <div style="font-weight:bold; font-size:13px; color:#fff;">${item.name}</div>
            <div style="font-size:10px; color:rgba(255,255,255,0.6); margin:5px 0; min-height:30px;">${item.desc}</div>
            <div class="price-container" style="margin-top:auto;">
                ${isOwned ? 
                    `<div class="owned-tag" style="color:#39ff14; font-size:12px; font-weight:bold; padding:8px;">КУПЛЕНО</div>` : 
                    `<div class="price-tag" style="font-size:14px; color:#00e5ff; margin-bottom:5px;">${priceText}</div>
                     <button onclick="buyModule('${item.id}')" class="buy-btn">КУПИТЬ</button>`
                }
            </div>
        `;
        shopList.appendChild(itemEl);
    });

    shopModal.style.display = 'flex';
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

function closeShop() {
    const shopModal = document.getElementById('shop-modal');
    if (shopModal) shopModal.style.display = 'none';
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

async function payWithTON(amountInTon, itemId) {
    const amountInNanotons = (amountInTon * 1000000000).toString();
    
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 120, // 2 минуты на оплату
        messages: [
            {
                address: "UQAolTf91hk9X9SbfkeWcs10mOCwQCvq5iax2WgQ4H678l6r", // ЗАМЕНИ НА СВОЙ
                amount: amountInNanotons,
            }
        ]
    };

    try {
        const result = await tonConnectUI.sendTransaction(transaction);
        return true; 
    } catch (e) {
        console.error("Ошибка оплаты:", e);
        return false;
    }
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

function draw() {
    // 1. Очищаем холст, используя ФИЗИЧЕСКИЕ пиксели (те, что с DPR)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (bg.complete) {
        ctx.drawImage(bg, 0, 0, window.innerWidth, window.innerHeight);
    }

    // 3. РИСУЕМ ПЛАНЕТЫ
    planets.forEach(p => {
        if (p.img && p.img.complete) {
            ctx.save();
            
            // Смещение (p.x и p.y теперь автоматически масштабируются благодаря resizeCanvas)
            ctx.translate(p.x, p.y); 

            if (p.id === 'station') {
                // Плавное покачивание станции
                const floatY = Math.sin(Date.now() * 0.002) * 5; 
                ctx.translate(0, floatY);
            } else {
                // Вращение планет
                p.rotation += p.speed;
                ctx.rotate(p.rotation);
            }
            
            // Рисуем саму планету
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            
            ctx.restore();
        }
    });
    
    // Запускаем следующий кадр
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

function openRunnerWindow() {
    isRunnerActive = true;
    sessionQuants = 0; 
    sessionQubi = 0; 
    quants = [];

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

    // 1. Очистка по физическим пикселям
    runnerCtx.clearRect(0, 0, runnerCanvas.width, runnerCanvas.height);

    // 2. Фон
    if (runnerBg.complete) {
        runnerCtx.drawImage(runnerBg, 0, 0, window.innerWidth, window.innerHeight);
    }

    let dx = runnerShip.targetX - runnerShip.x;
    runnerShip.x += dx * runnerShip.lerpSpeed;

    for (let i = quants.length - 1; i >= 0; i--) {
        let q = quants[i];
        
        // Молния не падает как предметы, у нее своя логика времени
        if (q.type !== 'lightning') {
            q.y += q.speed;
        }

        if (q.type === 'lightning') {
            q.timer++;

            if (q.timer < q.warningTime) {
                // 1. ПРЕДУПРЕЖДЕНИЕ: Тонкий мигающий луч
                runnerCtx.save();
                runnerCtx.globalAlpha = (Math.sin(Date.now() * 0.05) * 0.2) + 0.3;
                runnerCtx.fillStyle = '#00e5ff';
                runnerCtx.fillRect(q.x - q.width / 2, 0, q.width, window.innerHeight);
                runnerCtx.restore();
            } 
            else if (q.timer >= q.warningTime && q.timer < q.warningTime + 10) {
                // 2. УДАР: Вспышка изображения молнии
                q.active = true; 
                runnerCtx.save();
                if (typeof lightningImg !== 'undefined' && lightningImg.complete) {
                    runnerCtx.shadowBlur = 30;
                    runnerCtx.shadowColor = '#fff';
                    // Рисуем молнию на всю высоту
                    runnerCtx.drawImage(lightningImg, q.x - q.width, 0, q.width * 2, window.innerHeight);
                }
                
                if (q.timer === q.warningTime && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('error'); 
                }
                runnerCtx.restore();
            } 
            else {
                quants.splice(i, 1);
                continue;
            }

            if (q.active && Math.abs(q.x - runnerShip.x) < (runnerShip.w / 2.5 + q.width / 2)) {
                runnerShip.hp = 0;
                gameOver();
                return;
            }
        }
        // --- ОТРИСОВКА МЕТЕОРА ---
        else if (q.type === 'meteor') {
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
        // --- ОТРИСОВКА АЛИЕНА ---
        else if (q.type === 'alien') {
            if (alienImg.complete) {
                runnerCtx.drawImage(alienImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
            }
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
        // --- ОТРИСОВКА ПЛАЗМЫ ---
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
            if (currentImg.complete) {
                runnerCtx.drawImage(currentImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
            }
        }

        if (q.type === 'lightning') {
            if (q.active && Math.abs(q.x - runnerShip.x) < (runnerShip.w / 2.5 + q.width / 2)) {
                // Выполняем смерть только если корабль еще "жив"
                if (runnerShip.hp > 0) {
                    runnerShip.hp = 0;
                    gameOver();
                }
                return; // Прекращаем обработку текущего кадра
            }
        }
        // 2. Проверка для остальных объектов
        else if (Math.hypot(q.x - runnerShip.x, q.y - runnerShip.y) < (runnerShip.w / 3 + q.size / 2)) {
            if (q.type === 'meteor') {
                runnerShip.hp -= 50;
                if (window.Telegram && Telegram.WebApp.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
                }
                quants.splice(i, 1);
            } 
            else if (q.type === 'plasma') {
                runnerShip.hp -= 25;
                if (window.Telegram && Telegram.WebApp.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                }
                quants.splice(i, 1);
            }
            else if (q.type === 'alien') {
                runnerShip.hp -= 100;
                quants.splice(i, 1);
            }
            else {
                // Сбор валюты
                if (q.type === 'qubi') sessionQubi++;
                else sessionQuants++;
                
                const qEl = document.getElementById('runner-score-quant');
                const bEl = document.getElementById('runner-score-qubi');
                if (qEl) qEl.innerText = sessionQuants;
                if (bEl) bEl.innerText = sessionQubi;

                if (window.Telegram && Telegram.WebApp.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.impactOccurred(q.type === 'qubi' ? 'medium' : 'light');
                }
                quants.splice(i, 1);
                continue;
            }

            // Если после попадания метеора/плазмы HP кончилось
            if (runnerShip.hp <= 0) {
                runnerShip.hp = 0; // На всякий случай фиксируем в 0
                gameOver();
                return;
            }
            continue;
        }

        // Удаление объектов за экраном (кроме молнии, у неё своя логика в цикле выше)
        if (q.type !== 'lightning' && q.y > window.innerHeight + q.size) {
            quants.splice(i, 1);
        }
    } // конец цикла for

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
    
    requestAnimationFrame(runnerLoop);
}

function spawnLightning() {
    quants.push({
        x: runnerShip.x, // Целимся точно в игрока в момент появления
        y: 0,
        width: 60, // Ширина поражения
        type: 'lightning',
        warningTime: 35, // Время мерцания (примерно 0.5-0.7 сек)
        timer: 0,
        active: false
    });
}

function spawnRunnerObject() {
    if (!isRunnerActive) return;

    let rand = Math.random() * 100;

    if (rand < 10) { 
        // Молния появляется с шансом 5%
        quants.push({
            x: runnerShip.x, // Целимся точно в текущую позицию игрока
            y: 0,
            width: 60, // Ширина зоны поражения
            type: 'lightning',
            warningTime: 35, // Кол-во кадров мерцания до удара (~0.6 сек)
            timer: 0,
            active: false
        });
    } 
    else if (rand < 15) { // Сдвигаем границы остальных шансов
        // --- СПАВНИМ ВРАЖЕСКИЙ КОРАБЛЬ (ALIEN) ---
        let size = 70;
        quants.push({
            x: Math.random() * (window.innerWidth - size) + size / 2,
            y: -size,
            size: size,
            speed: 2 + Math.random() * 1.5,
            type: 'alien',
            lastShot: 0,
            shotInterval: 1500 
        });
    } 
    else if (rand < 40) {
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
}

    // Темп появления объектов
    let nextSpawn = 700 + Math.random() * 500; // Чуть-чуть уменьшил минимальный порог для динамики
    if (this.spawnTimer) clearTimeout(this.spawnTimer);
    this.spawnTimer = setTimeout(spawnRunnerObject, nextSpawn);

userRef.update({ equipped: playerData.equipped }).then(() => {
        if (typeof openStation === 'function') openStation(); 
    });
