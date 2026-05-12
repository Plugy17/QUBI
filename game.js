// --- 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ---
let lastEnergyUpdate = Date.now();

let playerData = { 
    quant: 0, 
    qubi: 0, 
    energy: 100, 
    level: 1,
    inventory: [], // Добавлено для хранения модулей
    equipped: [],  // Добавлено для активных слотов
    factoryLimit: {
        date: new Date().toLocaleDateString(),
        processedToday: 0
    }
};

// --- СОСТОЯНИЕ КОРАБЛЯ ---
let runnerShip = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 200, 
    w: 80, h: 80,
    hp: 100, 
    maxHp: 100, 
    targetX: window.innerWidth / 2,
    lerpSpeed: 0.2
};

// Функция для получения текущих лимитов (с учетом модулей)
function getLimits() {
    if (typeof calculateCurrentStats === 'function') {
        return calculateCurrentStats();
    }
    return { maxEnergy: 100, hp: 100, regenBonusMs: 0 }; // Значения по умолчанию
}

// Теперь эти переменные будут обновляться динамически в коде
let currentStats = getLimits();
let MAX_ENERGY = currentStats.maxEnergy; 

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

function regenerateEnergy() {
    if (typeof playerData === 'undefined' || !playerData || !window.userRef) return;

    const now = Date.now();
    
    // ПРИВЯЗКА К МОДУЛЯМ: берем макс. энергию из статов
    const stats = getLimits();
    const CURRENT_MAX = stats.maxEnergy; 
    
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

    // Сравниваем с CURRENT_MAX (например 125), а не жестко со 100
    if (energyToAdd > 0 && (playerData.energy || 0) < CURRENT_MAX) {
        const newEnergy = Math.min(CURRENT_MAX, (playerData.energy || 0) + energyToAdd);
        const updatedTime = lastUpdate + (energyToAdd * MS_PER_UNIT);

        playerData.energy = newEnergy;
        playerData.lastEnergyUpdate = updatedTime;

        window.userRef.update({ 
            energy: playerData.energy,
            lastEnergyUpdate: updatedTime 
        }).then(() => {
            console.log(`🔋 Регенерация: +${energyToAdd} (Лимит: ${CURRENT_MAX})`);
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
        lastUpdate: Date.now() 
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

// --- ЗАГРУЗКА РЕСУРСОВ ---
const bg = new Image(); bg.src = 'assets/background1.jpg';
const runnerBg = new Image(); runnerBg.src = 'assets/background2.jpg';
const shipImg = new Image(); shipImg.src = 'assets/samolet.png';
const quantImg = new Image(); quantImg.src = 'assets/quant-icon.png';
const qubiImg = new Image(); qubiImg.src = 'assets/qubi-icon.png';
const meteorImg = new Image(); meteorImg.src = 'assets/meteor.png'; 
const alienImg = new Image(); alienImg.src = 'assets/alien.png';
const lightningImg = new Image(); lightningImg.src = 'assets/molniya.png';

// --- ОБЪЕКТЫ ПЛАНЕТ ---
const planets = [
    { id: 'runner', src: 'assets/quant.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, size: 120, rotation: 0, speed: 0.002, img: new Image() },
    { id: 'build', src: 'assets/earth.png', x: window.innerWidth * 0.22, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: 0.001, img: new Image() },
    { id: 'shop', src: 'assets/mars.png', x: window.innerWidth * 0.78, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: -0.001, img: new Image() },
    { id: 'moon', src: 'assets/moon.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.72, size: 60, rotation: 0, speed: 0.003, img: new Image() },
    { id: 'leaderboard', src: 'assets/neptun.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.32, size: 70, rotation: 0, speed: -0.0015, img: new Image() },
    { id: 'station', src: 'assets/station.png', x: window.innerWidth * 0.2, y: window.innerHeight * 0.4, size: 70, rotation: 0, speed: 0, img: new Image(), action: () => openStation() }
];

// Инициализация картинок планет
planets.forEach(p => { p.img.src = p.src; });

// --- КОНФИГУРАЦИЯ МАГАЗИНА ---
// ВАЖНО: Пути к картинкам теперь соответствуют твоей папке assets/shop/
const SHOP_MODULES = [
    { id: 'mod_en_1', name: 'Медный конденсатор', type: 'energy_max', power: 25, price: 2500, currency: 'QUANT', rarity: 'common', desc: 'Увеличивает макс. запас энергии на 25 ед.', img: 'module_01.png' },
    { id: 'mod_en_2', name: 'Ионная ячейка', type: 'energy_max', power: 50, price: 5000, currency: 'QUANT', rarity: 'common', desc: 'Стабильный поток ионов дает +50 к энергии.', img: 'module_11.png' },
    { id: 'mod_en_3', name: 'Плазменный блок', type: 'energy_max', power: 100, price: 500, currency: 'QUBI', rarity: 'uncommon', desc: 'Сжатая плазма расширяет бак до +100 ед.', img: 'module_04.png' },
    { id: 'mod_en_4', name: 'Темная материя (S)', type: 'energy_max', power: 200, price: 1200, currency: 'QUBI', rarity: 'rare', desc: 'Энергия из пустоты. Дает +200 к запасу.', img: 'module_14.png' },
    { id: 'mod_en_5', name: 'Сингулярность', type: 'energy_max', power: 500, price: 0.5, currency: 'TON', rarity: 'epic', desc: 'Горизонт событий в твоем кармане: +500 энергии.', img: 'module_09.png' },

    { id: 'mod_reg_1', name: 'Кварцевый чип', type: 'energy_regen', power: 30000, price: 3000, currency: 'QUANT', rarity: 'common', desc: 'Ускоряет регенерацию на 30 секунд.', img: 'module_02.png' },
    { id: 'mod_reg_2', name: 'Турбо-инъектор', type: 'energy_regen', power: 60000, price: 400, currency: 'QUBI', rarity: 'uncommon', desc: 'Впрыск топлива ускоряет реген на 1 минуту.', img: 'module_12.png' },
    { id: 'mod_reg_3', name: 'Разгонщик частот', type: 'energy_regen', power: 90000, price: 700, currency: 'QUBI', rarity: 'uncommon', desc: 'Снимает лимиты: -90 сек ожидания.', img: 'module_05.png' },
    { id: 'mod_reg_4', name: 'Квантовый резонатор', type: 'energy_regen', power: 120000, price: 1500, currency: 'QUBI', rarity: 'rare', desc: 'Регенерация энергии всего за 1 минуту.', img: 'module_15.png' },
    { id: 'mod_reg_5', name: 'Хронос-двигатель', type: 'energy_regen', power: 160000, price: 0.8, currency: 'TON', rarity: 'epic', desc: 'Почти мгновенное восстановление: реген 20 сек!', img: 'module_08.png' },

    { id: 'mod_hp_1', name: 'Стальная пластина', type: 'hp', power: 50, price: 2000, currency: 'QUANT', rarity: 'common', desc: 'Базовая защита корпуса: +50 HP.', img: 'module_03.png' },
    { id: 'mod_hp_2', name: 'Титановый каркас', type: 'hp', power: 100, price: 4500, currency: 'QUANT', rarity: 'common', desc: 'Легкий и прочный сплав: +100 HP.', img: 'module_13.png' },
    { id: 'mod_hp_3', name: 'Керамический композит', type: 'hp', power: 150, price: 600, currency: 'QUBI', rarity: 'uncommon', desc: 'Поглощает удары метеоров: +150 HP.', img: 'module_06.png' },
    { id: 'mod_hp_4', name: 'Силовое поле v.1', type: 'hp', power: 250, price: 1800, currency: 'QUBI', rarity: 'rare', desc: 'Энергетический щит вокруг судна: +250 HP.', img: 'module_16.png' },
    { id: 'mod_hp_5', name: 'Нано-защита "Омни"', type: 'hp', power: 500, price: 0.6, currency: 'TON', rarity: 'epic', desc: 'Технологии древних: +500 HP.', img: 'module_10.png' },

    { id: 'mod_hyb_1', name: 'Альфа-ядро', type: 'hybrid', power: {hp: 100, en: 100}, price: 2500, currency: 'QUBI', rarity: 'rare', desc: 'Баланс во всем: +100 HP и +100 Энергии.', img: 'module_17.png' },
    { id: 'mod_hyb_2', name: 'Прототип "Звезда"', type: 'hybrid', power: {hp: 200, reg: 120000}, price: 1.2, currency: 'TON', rarity: 'epic', desc: 'Легкий образец: +200 HP и быстрый реген.', img: 'module_18.png' },
    { id: 'mod_hyb_3', name: 'QUANT-Мастер', type: 'hybrid', power: {en: 250, reg: 120000}, price: 1.0, currency: 'TON', rarity: 'epic', desc: 'Для марафонцев: +250 энергии и реген 1 мин.', img: 'module_19.png' },
    { id: 'mod_hyb_4', name: 'Дрон Mk.1', type: 'hybrid', power: {hp: 300, en: 150}, price: 1.5, currency: 'TON', rarity: 'epic', desc: 'Верный спутник: +300 HP и +150 энергии.', img: 'module_20.png' },
    { id: 'mod_hyb_5', name: 'Бесконечность', type: 'hybrid', power: {hp: 500, en: 500, reg: 150000}, price: 2.5, currency: 'TON', rarity: 'legendary', desc: 'Абсолютная власть над космосом.', img: 'module_07.png' }
];

// Функция для обновления параметров корабля перед стартом
function syncShipStats() {
    if (typeof calculateCurrentStats === 'function') {
        const stats = calculateCurrentStats();
        runnerShip.maxHp = stats.hp;
        runnerShip.hp = stats.hp;
    }
}

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
        c.width = width * dpr;
        c.height = height * dpr;
        c.style.width = width + 'px';
        c.style.height = height + 'px';

        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0); 
        ctx.scale(dpr, dpr);
    });

    if (typeof runnerShip !== 'undefined') {
        runnerShip.y = height - 200;
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

setTimeout(resizeCanvas, 100);
setTimeout(resizeCanvas, 300);

function initGame() {
    const nameEl = document.getElementById('player-name');
    if(nameEl) nameEl.innerText = tgUser.first_name;

    userRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            
            // Инициализация массивов, если их нет в базе
            if (!playerData.inventory) playerData.inventory = [];
            if (!playerData.equipped) playerData.equipped = [];
            if (!playerData.dailyExchangeQuant) playerData.dailyExchangeQuant = 0;
            if (!playerData.dailyExchangeQubi) playerData.dailyExchangeQubi = 0;
            
            // Запускаем регенерацию с учетом новых лимитов
            regenerateEnergy(); 
            
            updateUI();
            syncWithLeaderboard(); 
        } else {
            // Новый игрок
            playerData.lastEnergyUpdate = Date.now();
            playerData.inventory = [];
            playerData.equipped = [];
            userRef.set(playerData);
        }
        hideLoading();
    });
}

// Основная функция открытия магазина
function openShop() {
    const shopModal = document.getElementById('shop-modal');
    if (shopModal) {
        shopModal.style.display = 'flex';
        renderShopItems('all'); // При открытии всегда показываем всё
    }
}

// Функция отрисовки предметов с фильтрацией (вызывается из HTML кнопками)
function renderShopItems(filter = 'all') {
    const shopList = document.getElementById('shop-list');
    if (!shopList) return;
    
    shopList.innerHTML = ''; 

    // Фильтруем модули на основе выбранной вкладки
    const filteredModules = SHOP_MODULES.filter(item => {
        if (filter === 'all') return true;
        if (filter === 'ton') return item.currency === 'TON';
        
        // Маппинг: если нажата "ЭНЕРГИЯ" (energy_max), показываем лимит и реген
        if (filter === 'energy_max') {
            return item.type === 'energy_max' || item.type === 'energy_regen';
        }
        
        // Маппинг: если нажата "БРОНЯ" (hp), показываем HP и щиты
        if (filter === 'hp') {
            return item.type === 'hp' || item.type === 'barrier';
        }
        
        return item.type === filter;
    });

    filteredModules.forEach(item => {
        const isOwned = playerData.inventory && playerData.inventory.some(owned => 
            owned.shopId === item.id
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

    // Обновляем визуальный стиль кнопок
    updateShopTabsUI(filter);

    if (window.tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

// Подсветка активной кнопки в меню магазина
function updateShopTabsUI(activeFilter) {
    // Получаем все кнопки внутри контейнера вкладок магазина
    const shopNav = document.querySelector('.shop-nav'); // Убедись, что у тебя есть этот класс или используй подходящий селектор
    if (!shopNav) return;

    const buttons = shopNav.querySelectorAll('button');
    
    buttons.forEach(btn => {
        // Проверяем, на какую функцию ссылается кнопка
        const onClickAttr = btn.getAttribute('onclick');
        
        if (onClickAttr && onClickAttr.includes(`'${activeFilter}'`)) {
            btn.style.color = (activeFilter === 'ton') ? '#ffa500' : '#00e5ff';
            // Можно добавить подчеркивание
            btn.style.borderBottom = `2px solid ${activeFilter === 'ton' ? '#ffa500' : '#00e5ff'}`;
        } else {
            btn.style.color = '#fff';
            btn.style.borderBottom = 'none';
        }
    });
}

function closeShop() {
    const shopModal = document.getElementById('shop-modal');
    if (shopModal) shopModal.style.display = 'none';
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

async function payWithTON(amountInTon, itemId) {
    const amountInNanotons = (amountInTon * 1000000000).toString();
    
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 120,
        messages: [
            {
                address: "UQAolTf91hk9X9SbfkeWcs10mOCwQCvq5iax2WgQ4H678l6r", 
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

// --- ИСПРАВЛЕННЫЙ ИНТЕРФЕЙС ---
function updateUI() {
    const q = document.getElementById('quant-val'),
          b = document.getElementById('qubi-val'),
          e = document.getElementById('energy-fill'),
          et = document.getElementById('energy-text'); // Если у тебя есть текст на полоске

    if(q) q.innerText = Math.floor(playerData.quant);
    if(b) b.innerText = Math.floor(playerData.qubi);
    
    if(e) {
        // Считаем % динамически: (текущая / максимальная) * 100
        const stats = getLimits();
        const percent = Math.min(100, (playerData.energy / stats.maxEnergy) * 100);
        e.style.width = percent + "%";
        
        // Опционально: если хочешь выводить цифры типа "125/125"
        if(et) et.innerText = `${Math.floor(playerData.energy)}/${stats.maxEnergy}`;
    }
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (bg.complete) {
        ctx.drawImage(bg, 0, 0, window.innerWidth, window.innerHeight);
    }

    planets.forEach(p => {
        if (p.img && p.img.complete) {
            ctx.save();
            ctx.translate(p.x, p.y); 

            if (p.id === 'station') {
                const floatY = Math.sin(Date.now() * 0.002) * 5; 
                ctx.translate(0, floatY);
            } else {
                p.rotation += p.speed;
                ctx.rotate(p.rotation);
            }
            
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });
    
    requestAnimationFrame(draw);
}

function activatePlanet(id) {
    if (isAnyModalOpen()) return;

    if (id === 'runner') {
        if (playerData.energy < 10) {
            if (window.Telegram && Telegram.WebApp.showAlert) {
                Telegram.WebApp.showAlert("Недостаточно энергии! Нужно минимум 10 ⚡");
            }
            return;
        }
        
        playerData.energy -= 10;
        if (typeof updateUI === "function") updateUI();
        
        if (typeof userRef !== "undefined") {
            userRef.update({ energy: playerData.energy });
        }
        
        if (typeof openRunnerWindow === "function") {
            openRunnerWindow();
        }
    } 
    else if (id === 'shop') {
        if (typeof openShop === 'function') openShop();
    }
    else if (id === 'leaderboard') {
        if (typeof openLeaderboard === 'function') openLeaderboard();
    }
    else if (id === 'moon') {
        if (typeof openMoonMenu === 'function') openMoonMenu();
    }
    else if (id === 'build') {
        if (window.Telegram && Telegram.WebApp.showAlert) {
            Telegram.WebApp.showAlert("Режим «Создание» скоро!");
        }
    }
}

function openRunnerWindow() {
    isRunnerActive = true;
    sessionQuants = 0; 
    sessionQubi = 0; 
    quants = [];

    // --- ОБНОВЛЕНИЕ HP ПЕРЕД СТАРТОМ ---
    if (typeof syncShipStats === 'function') {
        syncShipStats(); 
    } else {
        // Если функции еще нет, ставим стандарт
        runnerShip.maxHp = 100;
        runnerShip.hp = 100;
    }

    const qEl = document.getElementById('runner-score-quant');
    const bEl = document.getElementById('runner-score-qubi');
    if (qEl) qEl.innerText = "0";
    if (bEl) bEl.innerText = "0";

    runnerWin.style.display = 'block';
    
    runnerShip.x = window.innerWidth / 2;
    runnerShip.targetX = window.innerWidth / 2;
    runnerShip.y = window.innerHeight - 250; 
    
    spawnRunnerObject();
    requestAnimationFrame(runnerLoop);
}

function closeRunnerWindow() {
    isRunnerActive = false;
    
    playerData.quant += sessionQuants;
    playerData.qubi += sessionQubi;
    
    userRef.update({ 
        quant: playerData.quant, 
        qubi: playerData.qubi 
    }).then(() => {
        syncWithLeaderboard();
        updateUI(); 
        console.log("Данные сохранены");
    }).catch((err) => {
        console.error("Ошибка сохранения:", err);
    });
    
    runnerWin.style.display = 'none';
    quants = []; 
}

function runnerLoop() {
    if (!isRunnerActive) return;

    runnerCtx.clearRect(0, 0, runnerCanvas.width, runnerCanvas.height);

    if (runnerBg.complete) {
        runnerCtx.drawImage(runnerBg, 0, 0, window.innerWidth, window.innerHeight);
    }

    let dx = runnerShip.targetX - runnerShip.x;
    runnerShip.x += dx * runnerShip.lerpSpeed;

    for (let i = quants.length - 1; i >= 0; i--) {
        let q = quants[i];
        
        if (q.type !== 'lightning') {
            q.y += q.speed;
        }

        if (q.type === 'lightning') {
            q.timer++;

            if (q.timer < q.warningTime) {
                runnerCtx.save();
                runnerCtx.globalAlpha = (Math.sin(Date.now() * 0.05) * 0.2) + 0.3;
                runnerCtx.fillStyle = '#00e5ff';
                runnerCtx.fillRect(q.x - q.width / 2, 0, q.width, window.innerHeight);
                runnerCtx.restore();
            } 
            else if (q.timer >= q.warningTime && q.timer < q.warningTime + 10) {
                q.active = true; 
                runnerCtx.save();
                if (typeof lightningImg !== 'undefined' && lightningImg.complete) {
                    runnerCtx.shadowBlur = 30;
                    runnerCtx.shadowColor = '#fff';
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
        }
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

        // --- ЛОГИКА СТОЛКНОВЕНИЙ ---
        if (q.type === 'lightning') {
            if (q.active && Math.abs(q.x - runnerShip.x) < (runnerShip.w / 2.5 + q.width / 2)) {
                if (runnerShip.hp > 0) {
                    runnerShip.hp = 0;
                    gameOver();
                }
                return;
            }
        }
        else if (Math.hypot(q.x - runnerShip.x, q.y - runnerShip.y) < (runnerShip.w / 3 + q.size / 2)) {
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

                if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(q.type === 'qubi' ? 'medium' : 'light');
                quants.splice(i, 1);
                continue;
            }

            if (runnerShip.hp <= 0) {
                runnerShip.hp = 0;
                gameOver();
                return;
            }
            continue;
        }

        if (q.type !== 'lightning' && q.y > window.innerHeight + q.size) {
            quants.splice(i, 1);
        }
    }

    // --- ОТРИСОВКА КОРАБЛЯ И HP BAR ---
    if (shipImg.complete) {
        runnerCtx.save();
        runnerCtx.translate(runnerShip.x, runnerShip.y);
        runnerCtx.rotate(dx * 0.02);
        runnerCtx.drawImage(shipImg, -runnerShip.w/2, -runnerShip.h/2, runnerShip.w, runnerShip.h);
        
        // Полоска здоровья
        const barW = 60;
        // Используем runnerShip.maxHp (который теперь может быть 500+) для расчета пропорции
        const hpRate = Math.max(0, runnerShip.hp / runnerShip.maxHp);
        
        runnerCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        runnerCtx.fillRect(-barW/2, -runnerShip.h/2 - 15, barW, 6);
        
        // Цвет меняется от зеленого к красному
        runnerCtx.fillStyle = hpRate > 0.3 ? '#00ff00' : '#ff4444'; 
        runnerCtx.fillRect(-barW/2, -runnerShip.h/2 - 15, barW * hpRate, 6);
        
        runnerCtx.restore();
    }
    
    requestAnimationFrame(runnerLoop);
}

function spawnLightning() {
    quants.push({
        x: runnerShip.x, 
        y: 0,
        width: 60, 
        type: 'lightning',
        warningTime: 35, 
        timer: 0,
        active: false
    });
}

function spawnRunnerObject() {
    if (!isRunnerActive) return;

    let rand = Math.random() * 100;

    if (rand < 10) {
        spawnLightning(); // Используем отдельную функцию для чистоты кода
    } 
    else if (rand < 15) {
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

    // Рекурсивный вызов спавна
    let nextSpawn = 700 + Math.random() * 500;
    if (spawnRunnerObject.spawnTimer) clearTimeout(spawnRunnerObject.spawnTimer);
    spawnRunnerObject.spawnTimer = setTimeout(spawnRunnerObject, nextSpawn);
}

// --- ЛУННАЯ СТАНЦИЯ (ОБМЕН) ---

function openMoonMenu() {
    const modal = document.getElementById('moon-modal');
    if (modal) {
        modal.style.display = 'flex';
        updateMoonUI(); 
    }
}

function closeMoon() {
    const modal = document.getElementById('moon-modal');
    if (modal) modal.style.display = 'none';
}

function exchangeEnergy(type) {
    const today = new Date().toDateString();
    const stats = calculateCurrentStats(); // Получаем актуальный макс. лимит энергии
    
    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    let cost = 0;
    let reward = 10;
    let limitMax = 0;
    let currentProcessed = 0;

    if (type === 'quant') {
        cost = 50;
        limitMax = 500;
        currentProcessed = playerData.dailyExchangeQuant || 0;
        
        if (playerData.quant < cost) {
            if(tg.showAlert) tg.showAlert("Недостаточно QUANT!");
            return;
        }
    } else if (type === 'qubi') {
        cost = 5;
        limitMax = 50;
        currentProcessed = playerData.dailyExchangeQubi || 0;

        if (playerData.qubi < cost) {
            if(tg.showAlert) tg.showAlert("Недостаточно QUBI!");
            return;
        }
    }

    if (currentProcessed + cost > limitMax) {
        if(tg.showAlert) tg.showAlert("Дневной лимит переработки исчерпан!");
        return;
    }

    // ИСПРАВЛЕНИЕ: Проверка на макс. энергию с учетом модулей
    if (playerData.energy >= stats.maxEnergy) {
        if(tg.showAlert) tg.showAlert("Энергия уже на максимуме (" + stats.maxEnergy + ")!");
        return;
    }

    if (type === 'quant') {
        playerData.quant -= cost;
        playerData.dailyExchangeQuant = currentProcessed + cost;
    } else {
        playerData.qubi -= cost;
        playerData.dailyExchangeQubi = currentProcessed + cost;
    }

    // Добавляем энергию, но не выше расширенного лимита
    playerData.energy = Math.min(stats.maxEnergy, (playerData.energy || 0) + reward);

    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        energy: playerData.energy,
        dailyExchangeQuant: playerData.dailyExchangeQuant,
        dailyExchangeQubi: playerData.dailyExchangeQubi,
        lastExchangeDate: playerData.lastExchangeDate
    }).then(() => {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        updateMoonUI(); 
        updateUI(); 
    }).catch(err => console.error("Ошибка обмена:", err));
}

function updateMoonUI() {
    const today = new Date().toDateString();

    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    const resQuantEl = document.getElementById('res-amount-quant');
    const resQubiEl = document.getElementById('res-amount-qubi');
    if (resQuantEl) resQuantEl.innerText = Math.floor(playerData.quant || 0) + " QNT";
    if (resQubiEl) resQubiEl.innerText = Math.floor(playerData.qubi || 0) + " QUB";

    // QUANT Лимит
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
        qFill.style.background = (qPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #00e5ff, #007bff)';
    }

    // QUBI Лимит
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
        bFill.style.background = (bPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #a855f7, #6b21a8)';
    }
}

function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const container = document.getElementById('leaderboard-container');
    
    if (modal) modal.style.display = 'flex';
    if (container) container.innerHTML = '<div style="text-align:center; padding:20px;">Загрузка...</div>';

    // Принудительная синхронизация перед чтением топа
    syncWithLeaderboard();

    db.ref('leaderboard').orderByChild('qubi').limitToLast(100).once('value', (snap) => {
        if (container) {
            container.innerHTML = '';
            let players = [];
            
            snap.forEach(child => {
                let data = child.val();
                data.uid = child.key; 
                players.push(data);
            });

            // Богатые сверху, выделяем себя синим
            players.reverse().forEach((p, i) => {
                const row = document.createElement('div');
                row.className = 'player-row';
                
                const isMe = p.uid === String(tgUser.id) ? 'style="color: #00e5ff; font-weight: bold; background: rgba(0,229,255,0.1); border-radius: 8px;"' : '';
                
                row.innerHTML = `
                    <span ${isMe}>${i + 1}. ${p.name || 'Unknown'}</span>
                    <span class="score" ${isMe}>${Math.floor(p.qubi || 0)} QUBI</span>
                `;
                container.appendChild(row);
            });
        }
    });
}

function closeLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.style.display = 'none';
}

function gameOver() {
    if (!isRunnerActive) return; 
    isRunnerActive = false;
    runnerShip.hp = 0;

    // Останавливаем таймер спавна
    if (spawnRunnerObject.spawnTimer) {
        clearTimeout(spawnRunnerObject.spawnTimer);
    }

    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
    }

    console.log("Game Over. Quants:", sessionQuants, "Qubi:", sessionQubi);

    setTimeout(() => {
        // Здесь можно будет заменить на красивое HTML-окно результатов
        alert(`ИГРА ОКОНЧЕНА!\n\nКорабль уничтожен.\n\nСобрано QUANT: ${sessionQuants}\nСобрано QUBI: ${sessionQubi}`);
        closeRunnerWindow(); 
    }, 300);
}

// --- УПРАВЛЕНИЕ И КЛИКИ ---

function isUiHit(target) { 
    return target.closest('.exit-btn') || target.closest('.score-display') || target.closest('button'); 
}

function isAnyModalOpen() {
    // Список всех ID модальных окон
    const modals = ['moon-modal', 'leaderboard-modal', 'station-modal', 'shop-modal', 'runner-window'];
    return modals.some(id => {
        const el = document.getElementById(id);
        if (!el) return false;
        return window.getComputedStyle(el).display !== 'none';
    });
}

// --- ГЛАВНЫЙ МОЗГ ХАРАКТЕРИСТИК ---
function calculateCurrentStats() {
    let stats = {
        hp: 100,
        maxEnergy: 100,
        regenBonusMs: 0, 
        barrier: 0,
        incomeQuant: 0,
        incomeQubi: 0
    };

    // Проверка на загрузку данных
    if (typeof playerData === 'undefined' || !playerData || !playerData.inventory) {
        return stats;
    }

    if (playerData.equipped) {
        playerData.equipped.forEach(modId => {
            const module = playerData.inventory.find(m => m.id === modId);
            if (module && module.power) {
                if (typeof module.power === 'number') {
                    if (module.type === 'hp') stats.hp += module.power;
                    if (module.type === 'energy_max') stats.maxEnergy += module.power;
                    if (module.type === 'energy_regen') stats.regenBonusMs += module.power;
                    if (module.type === 'barrier') stats.barrier += module.power;
                    if (module.type === 'income_quant') stats.incomeQuant += module.power;
                    if (module.type === 'income_qubi') stats.incomeQubi += module.power;
                } 
                else if (typeof module.power === 'object') {
                    if (module.power.hp) stats.hp += module.power.hp;
                    if (module.power.en) stats.maxEnergy += module.power.en;
                    if (module.power.reg) stats.regenBonusMs += module.power.reg;
                }
            }
        });
    }
    return stats;
}

// --- ЛОГИКА ОБРАБОТКИ КЛИКОВ ---
function handleCanvasClick(e) {
    if (isAnyModalOpen()) return;

    // Получаем координаты клика
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    // Проверяем попадание по каждой планете
    planets.forEach(p => {
        const dx = x - p.x;
        const dy = y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < p.size / 2) {
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            
            // Если у планеты есть свое действие (например, Станция)
            if (p.action) {
                p.action();
            } else {
                // Иначе стандартная активация (Раннер и т.д.)
                activatePlanet(p.id);
            }
        }
    });
}

// --- СЛУШАТЕЛИ СОБЫТИЙ ---
if (typeof canvas !== 'undefined' && canvas) {
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', (e) => {
        handleCanvasClick(e);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });
}

if (typeof runnerWin !== 'undefined' && runnerWin) {
    runnerWin.addEventListener('touchstart', (e) => {
        if (typeof isRunnerActive !== 'undefined' && isRunnerActive) {
            if (!isUiHit(e.target)) {
                runnerShip.targetX = e.touches[0].clientX;
            }
        }
    }, { passive: false });

    runnerWin.addEventListener('touchmove', (e) => {
        if (typeof isRunnerActive !== 'undefined' && isRunnerActive) {
            if (!isUiHit(e.target)) {
                runnerShip.targetX = e.touches[0].clientX;
                if (e.cancelable) e.preventDefault();
            }
        }
    }, { passive: false });
}

const exitRunnerBtn = document.getElementById('exit-runner');
if (exitRunnerBtn) {
    exitRunnerBtn.onclick = () => {
        if (typeof closeRunnerWindow === 'function') closeRunnerWindow();
    };
}

// Запуск отрисовки и инициализации
bg.onload = () => { 
    if (typeof initGame === 'function') initGame(); 
    if (typeof draw === 'function') draw(); 
};
if (bg.complete) { 
    if (typeof initGame === 'function') initGame(); 
    if (typeof draw === 'function') draw(); 
}

// --- ФУНКЦИИ МАГАЗИНА И АНГАРА ---
async function buyModule(moduleId) {
    const itemData = SHOP_MODULES.find(m => m.id === moduleId);
    if (!itemData) return;

    if (itemData.currency === 'TON') {
        try {
            const success = await payWithTON(itemData.price, itemData.id);
            if (success) grantModule(itemData);
        } catch (e) { console.error(e); }
        return;
    }

    let priceQuant = itemData.currency === 'QUANT' ? itemData.price : 0;
    let priceQubi = itemData.currency === 'QUBI' ? itemData.price : 0;

    if (playerData.quant < priceQuant || playerData.qubi < priceQubi) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        alert("Недостаточно ресурсов!");
        return;
    }
    playerData.quant -= priceQuant;
    playerData.qubi -= priceQubi;
    grantModule(itemData);
}

function grantModule(itemData) {
    if (!playerData.inventory) playerData.inventory = [];
    const newModule = {
        id: itemData.id + "_" + Date.now(), 
        shopId: itemData.id, name: itemData.name, type: itemData.type,
        power: itemData.power, rarity: itemData.rarity, img: itemData.img
    };
    playerData.inventory.push(newModule);
    userRef.update({ quant: playerData.quant, qubi: playerData.qubi, inventory: playerData.inventory })
    .then(() => {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        updateUI(); openShop();
    });
}

function openStation() {
    const modal = document.getElementById('station-modal');
    if (modal) modal.style.display = 'flex';

    // Получаем актуальные статы с учетом надетых модулей
    const current = calculateCurrentStats();

    // 1. Обновляем текстовые показатели в UI
    const hpEl = document.getElementById('stat-hp');
    const enEl = document.getElementById('stat-energy');
    const regEl = document.getElementById('stat-income-quant'); // Используем этот ID под реген, как в твоем исходнике

    if (hpEl) hpEl.innerText = current.hp;
    if (enEl) enEl.innerText = current.maxEnergy;
    
    if (regEl) {
        // Переводим мс в минуты (например, 60000мс -> 1.0 мин)
        const regenBonusMin = (current.regenBonusMs / 60000).toFixed(1);
        regEl.innerText = "-" + regenBonusMin + " мин";
    }

    // 2. Рендерим 5 верхних слотов экипировки
    const activeContainer = document.getElementById('active-slots-container');
    if (activeContainer) {
        activeContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const slot = document.createElement('div');
            const equippedId = (playerData.equipped && playerData.equipped[i]) ? playerData.equipped[i] : null;
            
            if (equippedId) {
                const mod = playerData.inventory.find(m => m.id === equippedId);
                slot.className = 'slot-mini filled';
                const shopData = SHOP_MODULES.find(sm => sm.id === mod.shopId);
                const imgPath = shopData ? `assets/shop/${shopData.img}` : `assets/shop/module_01.png`;
                slot.innerHTML = `<img src="${imgPath}" style="width:100%; height:100%; object-fit:contain;">`;
            } else {
                slot.className = 'slot-mini empty';
            }
            activeContainer.appendChild(slot);
        }
    }

    // 3. Рендерим список всех модулей в инвентаре (нижний список)
    const scrollList = document.getElementById('inventory-scroll-list');
    if (scrollList) {
        scrollList.innerHTML = '';
        if (playerData.inventory && playerData.inventory.length > 0) {
            playerData.inventory.forEach(item => {
                const isEquipped = playerData.equipped && playerData.equipped.includes(item.id);
                const card = document.createElement('div');
                card.className = `module-card ${isEquipped ? 'equipped' : ''}`;
                
                const shopData = SHOP_MODULES.find(sm => sm.id === item.shopId);
                const imgPath = shopData ? `assets/shop/${shopData.img}` : `assets/shop/module_01.png`;

                card.innerHTML = `
                    <img src="${imgPath}" style="width:35px; height:35px; object-fit:contain;">
                    <div style="display:flex; flex-direction:column; margin-left:10px;">
                        <span style="font-size:12px; font-weight:bold;">${item.name}</span>
                        <small style="color: ${isEquipped ? '#00e5ff' : '#888'}; font-size:10px;">
                            ${isEquipped ? 'УСТАНОВЛЕНО' : 'В ГАРДЕРОБЕ'}
                        </small>
                    </div>
                `;
                
                // При клике на карточку — снимаем или надеваем модуль
                card.onclick = () => toggleModule(item.id);
                scrollList.appendChild(card);
            });
        } else {
            scrollList.innerHTML = '<div class="no-modules" style="text-align:center; padding:20px; color:#666;">Ангар пуст. Купи модули в магазине!</div>';
        }
    }
}

function toggleModule(modId) {
    if (!playerData.equipped) playerData.equipped = [];
    const index = playerData.equipped.indexOf(modId);
    if (index > -1) {
        playerData.equipped.splice(index, 1);
    } else if (playerData.equipped.length < 5) {
        playerData.equipped.push(modId);
    }
    userRef.update({ equipped: playerData.equipped }).then(() => openStation());
}

function closeStation() {
    const modal = document.getElementById('station-modal');
    if (modal) modal.style.display = 'none';
    if (typeof updateUI === "function") updateUI();
}

setInterval(() => {
    if (typeof regenerateEnergy === 'function' && window.playerData) {
        regenerateEnergy();
    }
}, 60000);
