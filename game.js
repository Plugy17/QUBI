console.log("ГЕЙМ-СКРИПТ ЗАПУЩЕН");

let playerData = { 
    quant: 0, 
    qubi: 0, 
    energy: 100, 
    level: 1,
    inventory: [], 
    equipped: [],  
    lastEnergyUpdate: 0, // Инициализируем нулем, значение придет из Firebase
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

let quants = []; 
let sessionQuants = 0;
let sessionQubi = 0;
let isRunnerActive = false;
let sessionArtifacts = 0;

let isPvPRaid = false;       // Режим ПВП
let pvpDistance = 0;         // Текущий пройденный путь
let targetDistance = 0;      // Дистанция до финиша (зависит от врага)
let currentOpponent = null;  // Данные жертвы

let pvpCanvas = document.getElementById('pvpCanvas');
let pvpCtx = pvpCanvas.getContext('2d');

// --- ЕДИНАЯ ФУНКЦИЯ РАСЧЕТА ХАРАКТЕРИСТИК ---
function calculateCurrentStats() {
    let stats = {
        hp: 100,
        maxEnergy: 100,
        regenBonusMs: 0, 
        barrier: 0,
        incomeQuant: 0,
        incomeQubi: 0
    };

    if (playerData && playerData.equipped && playerData.inventory) {
        playerData.equipped.forEach(modId => {
            const module = playerData.inventory.find(m => m.id === modId);
            if (module && module.power) {
                if (typeof module.power === 'object') {
                    stats.hp += Number(module.power.hp || 0);
                    stats.maxEnergy += Number(module.power.en || 0);
                    stats.regenBonusMs += Number(module.power.reg || 0);
                } else {
                    const p = Number(module.power);
                    if (module.type === 'hp') stats.hp += p;
                    if (module.type === 'energy_max') stats.maxEnergy += p;
                    if (module.type === 'energy_regen') stats.regenBonusMs += p;
                    if (module.type === 'barrier') stats.barrier += p;
                }
            }
        });
    }
    return stats;
}

// --- РЕГЕНЕРАЦИЯ ЭНЕРГИИ ---
function regenerateEnergy() {
    // 1. Базовые проверки + проверка на активность в раннере
    if (!playerData || !userRef || isRunnerActive) return;

    const now = Date.now();
    let lastUpdate = Number(playerData.lastEnergyUpdate) || now;
    
    // 2. Исправление "будущего" времени
    if (lastUpdate > (now + 60000)) {
        console.log("🛠 Исправляю время из будущего...");
        playerData.lastEnergyUpdate = now;
        userRef.update({ lastEnergyUpdate: now });
        return;
    }

    const stats = calculateCurrentStats();
    const maxE = Number(stats.maxEnergy) || 100;
    const bonus = Number(stats.regenBonusMs) || 0;
    
    // 3. Рассчитываем время восстановления 1 единицы (минимум 1 секунда)
    const MS_PER_UNIT = Math.max(1000, 60000 - bonus);
    
    const timePassed = now - lastUpdate;

    // Редкий лог для отладки
    if (Math.random() < 0.01) console.log("Проверка регена... Прошло мс:", timePassed);

    // 4. Логика начисления
    if (timePassed >= MS_PER_UNIT && playerData.energy < maxE) {
        const energyToAdd = Math.floor(timePassed / MS_PER_UNIT);
        
        if (energyToAdd > 0) {
            // Прибавляем энергию, но не выше максимума
            playerData.energy = Math.min(maxE, (Number(playerData.energy) || 0) + energyToAdd);
            
            // СДВИГАЕМ время последнего обновления вперед на количество начисленной энергии
            playerData.lastEnergyUpdate = lastUpdate + (energyToAdd * MS_PER_UNIT);

            // 5. Синхронизация с UI и базой
            updateUI(); 
            userRef.update({
                energy: playerData.energy,
                lastEnergyUpdate: playerData.lastEnergyUpdate
            });
            
            console.log("🔋 Энергия начислена:", energyToAdd, "| Всего:", playerData.energy);
        }
    }
}

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

const buildingTypes = {
    mine: {
        name: "Шахта",
        icon: "assets/buildings/mine.png", // Путь к твоей PNG
        baseCost: 1500,
        baseYield: 15, // Квантов в час
        yieldType: "quant",
        artifactUpgradeBase: 20 // Сколько артефактов нужно для 1-го апгрейда
    },
    lab: {
        name: "Лаборатория",
        icon: "assets/buildings/lab.png",
        baseCost: 2500,
        baseYield: 5, // QUBI в час
        yieldType: "qubi",
        artifactUpgradeBase: 30
    },
    shield: {
        name: "Щит",
        icon: "assets/buildings/shield.png",
        baseCost: 5000,
        baseYield: 5, // % защиты
        yieldType: "protection",
        artifactUpgradeBase: 40
    }
};

// --- ЗАГРУЗКА РЕСУРСОВ ---
const bg = new Image(); bg.src = 'assets/background1.jpg';
const runnerBg = new Image(); runnerBg.src = 'assets/background2.jpg';
const shipImg = new Image(); shipImg.src = 'assets/samolet.png';
const quantImg = new Image(); quantImg.src = 'assets/quant-icon.png';
const qubiImg = new Image(); qubiImg.src = 'assets/qubi-icon.png';
const meteorImg = new Image(); meteorImg.src = 'assets/meteor.png'; 
const alienImg = new Image(); alienImg.src = 'assets/alien.png';
const lightningImg = new Image(); lightningImg.src = 'assets/molniya.png';
const artifactImg = new Image(); artifactImg.src = 'assets/artifact.png';

// --- ОБЪЕКТЫ ПЛАНЕТ ---
const planets = [
    { id: 'runner', src: 'assets/quant.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, size: 120, rotation: 0, speed: 0.002, img: new Image() },
    { id: 'build', src: 'assets/earth.png', x: window.innerWidth * 0.22, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: 0.001, img: new Image() },
    { id: 'shop', src: 'assets/mars.png', x: window.innerWidth * 0.78, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: -0.001, img: new Image() },
    { id: 'moon', src: 'assets/moon.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.72, size: 60, rotation: 0, speed: 0.003, img: new Image() },
    { id: 'leaderboard', src: 'assets/neptun.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.32, size: 70, rotation: 0, speed: -0.0015, img: new Image() },
    { id: 'station', src: 'assets/station.png', x: window.innerWidth * 0.2, y: window.innerHeight * 0.4, size: 70, rotation: 0, speed: 0, img: new Image(), action: () => openStation() },
    
    // --- НОВАЯ ПЛАНЕТА PVP ---
    { 
    id: 'pvp', 
    src: 'assets/star-pvp.png', 
    x: window.innerWidth * 0.12, 
    y: window.innerHeight * 0.82, 
    size: 90, 
    action: () => openPvPMenu() 
    },
];

// Инициализация картинок планет
// Проверь, нет ли тут ошибки. Добавь проверку на существование p и p.img
planets.forEach(p => {
    if (p && p.img) {
        p.img.src = p.src;
    }
});

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

    // Используем .once, чтобы загрузить данные ПРИ ВХОДЕ один раз
    userRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            
            // Проверка и инициализация данных
            const now = Date.now();
            if (!playerData.lastEnergyUpdate) {
                playerData.lastEnergyUpdate = now;
                userRef.update({ lastEnergyUpdate: now });
            }

            if (!playerData.inventory) playerData.inventory = [];
            if (!playerData.equipped) playerData.equipped = [];
            
            // СТАРТУЕМ ТАЙМЕРЫ ОДИН РАЗ
            // Если таймер уже запущен где-то в другом месте, здесь его не дублируем!
            updateUI();
            syncWithLeaderboard(); 
        } else {
            // Новый игрок
            playerData.lastEnergyUpdate = Date.now();
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
        // При открытии по умолчанию активируем вкладку "ВСЕ"
        renderShopItems('all'); 
    }
}

// Функция отрисовки предметов с активной подсветкой вкладок
function renderShopItems(filter = 'all') {
    const shopList = document.getElementById('shop-list');
    if (!shopList) return;
    
    shopList.innerHTML = ''; 

    // 1. Фильтрация модулей
    const filteredModules = SHOP_MODULES.filter(item => {
        if (filter === 'all') return true;
        if (filter === 'ton') return item.currency === 'TON';
        if (filter === 'energy_max') return item.type === 'energy_max' || item.type === 'energy_regen';
        if (filter === 'hp') return item.type === 'hp' || item.type === 'barrier';
        return item.type === filter;
    });

    // 2. Отрисовка карточек
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
                    `<div style="color:#39ff14; font-size:12px; font-weight:bold; padding:8px;">КУПЛЕНО</div>` : 
                    `<div style="font-size:14px; color:#00e5ff; margin-bottom:5px;">${priceText}</div>
                     <button onclick="buyModule('${item.id}')" class="buy-btn">КУПИТЬ</button>`
                }
            </div>
        `;
        shopList.appendChild(itemEl);
    });

    // 3. ПОДСВЕТКА КНОПОК
    updateShopTabsVisuals(filter);

    if (window.tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

// Вспомогательная функция для выделения активной кнопки
function updateShopTabsVisuals(activeFilter) {
    const tabsContainer = document.querySelector('.shop-tabs');
    if (!tabsContainer) return;

    const buttons = tabsContainer.querySelectorAll('button');
    
    buttons.forEach(btn => {
        // Проверяем, какой фильтр привязан к кнопке через атрибут onclick
        if (btn.getAttribute('onclick').includes(`'${activeFilter}'`)) {
            // Если это активная кнопка
            btn.classList.add('active-tab');
            btn.style.opacity = "1";
            if (activeFilter === 'ton') {
                btn.style.color = "#ffa500"; // Золотой для ТОН
            } else {
                btn.style.color = "#00e5ff"; // Голубой для остальных
            }
        } else {
            // Для неактивных кнопок
            btn.classList.remove('active-tab');
            btn.style.color = "#fff";
            btn.style.opacity = "0.5";
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
        const stats = calculateCurrentStats();
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
    
    // ПРОВЕРКА: Теперь регенерация будет вызываться 60 раз в секунду
    regenerateEnergy();

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
    
    // ЭТА СТРОКА ЗАПУСКАЕТ БЕСКОНЕЧНЫЙ ЦИКЛ
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

        // --- КРИТИЧЕСКИ ВАЖНО: СБРОС PVP ПЕРЕД ОБЫЧНЫМ РЕЖИМОМ ---
        isPvPRaid = false; 
        // -------------------------------------------------------

        playerData.energy -= 10;
        if (typeof updateUI === "function") updateUI();
        if (typeof userRef !== "undefined") userRef.update({ energy: playerData.energy });
        if (typeof openRunnerWindow === "function") openRunnerWindow();
    } 
    else if (id === 'pvp') {
        if (playerData.energy < 40) {
            if (window.Telegram && Telegram.WebApp.showAlert) {
                Telegram.WebApp.showAlert("Недостаточно энергии для рейда! Нужно 40 ⚡");
            }
            return;
        }

        // --- КРИТИЧЕСКИ ВАЖНО: ВКЛЮЧАЕМ PVP РЕЖИМ ---
        isPvPRaid = true;
        // --------------------------------------------

        if (typeof openPvPMenu === 'function') {
            openPvPMenu(); 
        } else {
            console.error("Функция openPvPMenu не найдена!");
        }
    }
    // Остальные блоки (shop, leaderboard и т.д.) конфликтов не вызывают
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
        if (typeof openEarth === 'function') openEarth();
    }
    else if (id === 'station') {
        if (typeof openStation === 'function') openStation();
    }
}

function openRunnerWindow() {
    // 1. ПРОВЕРКА ЭНЕРГИИ (Минимум 20 для старта)
    if (playerData.energy < 20) {
        alert("Недостаточно энергии для вылета! Нужно 20.");
        return; 
    }

    // 2. СПИСАНИЕ И СБРОС ТАЙМЕРА РЕГЕНА
    const now = Date.now();
    playerData.energy -= 20;
    playerData.lastEnergyUpdate = now; // Важно: реген начнет считать от этого момента

    // Сразу сохраняем списание в базу, чтобы игрок не схитрил, обновив страницу
    if (typeof userRef !== 'undefined' && userRef.update) {
        userRef.update({
            energy: playerData.energy,
            lastEnergyUpdate: playerData.lastEnergyUpdate
        });
    }

    // 3. СТАНДАРТНАЯ ЛОГИКА ЗАПУСКА
    isRunnerActive = true;
    sessionQuants = 0; 
    sessionQubi = 0; 
    sessionArtifacts = 0; 
    quants = [];

    // Обновление UI (энергия на главном экране)
    if (typeof updateUI === 'function') updateUI();

    // --- ОБНОВЛЕНИЕ HP ПЕРЕД СТАРТОМ ---
    if (typeof syncShipStats === 'function') {
        syncShipStats(); 
    } else {
        runnerShip.maxHp = 100;
        runnerShip.hp = 100;
    }

    // Сбрасываем визуальные счетчики в UI раннера
    const qEl = document.getElementById('runner-score-quant');
    const bEl = document.getElementById('runner-score-qubi');
    const aEl = document.getElementById('runner-score-artifact'); 
    
    if (qEl) qEl.innerText = "0";
    if (bEl) bEl.innerText = "0";
    if (aEl) aEl.innerText = "0";

    runnerWin.style.display = 'block';
    
    runnerShip.x = window.innerWidth / 2;
    runnerShip.targetX = window.innerWidth / 2;
    runnerShip.y = window.innerHeight - 250; 
    
    spawnRunnerObject();
    requestAnimationFrame(runnerLoop);

    console.log("🚀 Полет начат. Списано 20 энергии. Остаток:", playerData.energy);
}

function closeRunnerWindow() {
    isRunnerActive = false;
    
    // Прибавляем собранное за сессию к основным данным игрока
    playerData.quant += sessionQuants;
    playerData.qubi = (playerData.qubi || 0) + sessionQubi;
    playerData.artifacts = (playerData.artifacts || 0) + (sessionArtifacts || 0); // СОХРАНЯЕМ АРТЕФАКТЫ
    
    // Сохраняем всё в Firebase
    userRef.update({ 
        quant: playerData.quant, 
        qubi: playerData.qubi,
        artifacts: playerData.artifacts // ОТПРАВЛЯЕМ В ОБЛАКО
    }).then(() => {
        syncWithLeaderboard();
        updateUI(); 
        console.log("Прогресс сохранен: + " + (sessionArtifacts || 0) + " артефактов");
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
            // Отрисовка бонусов: QUANT, QUBI и ARTIFACT
            let currentImg;
            if (q.type === 'artifact') {
                currentImg = artifactImg;
            } else {
                currentImg = (q.type === 'qubi') ? qubiImg : quantImg;
            }

            if (currentImg && currentImg.complete) {
                runnerCtx.drawImage(currentImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
            }
        }

        // --- ОТРИСОВКА КОРАБЛЯ ---
    if (shipImg.complete) {
        runnerCtx.save();
        
        // Перемещаем центр рисования в координаты корабля
        runnerCtx.translate(runnerShip.x, runnerShip.y);
        
        // ВЫЧИСЛЯЕМ УГОЛ НАКЛОНА
        let angle = 0;
        if (isPvPRaid) {
            // В PvP наклон зависит от вертикальной скорости (vy)
            angle = runnerShip.vy * 0.05; 
        } else {
            // В обычном режиме наклон зависит от горизонтального рывка (dx)
            let dx = (runnerShip.targetX - runnerShip.x);
            angle = dx * 0.02;
        }
        
        runnerCtx.rotate(angle);

        // Рисуем само изображение корабля (центрируем по -w/2, -h/2)
        runnerCtx.drawImage(
            shipImg, 
            -runnerShip.w / 2, 
            -runnerShip.h / 2, 
            runnerShip.w, 
            runnerShip.h
        );

        // --- ОТРИСОВКА ПОЛОСКИ HP ---
const barMaxWidth = 60; // ЖЕСТКО задаем максимальную ширину рамки в пикселях
const barHeight = 6;
const hpPercentage = Math.max(0, runnerShip.hp / runnerShip.maxHp); // Отношение текущего к макс.

// Центрируем полоску над кораблем
const barX = -barMaxWidth / 2; 
const barY = -runnerShip.h / 2 - 15; // Высота над спрайтом

// 1. Рисуем подложку (серый или красный фон полоски)
runnerCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
runnerCtx.fillRect(barX, barY, barMaxWidth, barHeight);

// 2. Рисуем саму жизнь (Зеленая часть)
// Теперь длина полоски ВСЕГДА будет в пределах 60 пикселей
runnerCtx.fillStyle = hpPercentage > 0.3 ? '#00ff00' : '#ff4444';
runnerCtx.fillRect(barX, barY, barMaxWidth * hpPercentage, barHeight);

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
                // Сбор ресурсов
                if (q.type === 'artifact') {
                    sessionArtifacts = (sessionArtifacts || 0) + 1;
                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                } 
                else if (q.type === 'qubi') {
                    sessionQubi++;
                    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
                } 
                else {
                    sessionQuants++;
                    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
                }
                
                // Обновление интерфейса счета
                const qEl = document.getElementById('runner-score-quant');
                const bEl = document.getElementById('runner-score-qubi');
                const aEl = document.getElementById('runner-score-artifact'); 

                if (qEl) qEl.innerText = sessionQuants;
                if (bEl) bEl.innerText = sessionQubi;
                if (aEl) aEl.innerText = sessionArtifacts || 0;

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

       // 1. Закрываем проверку выхода за экран (твой if)
        if (q.type !== 'lightning' && q.y > window.innerHeight + q.size) {
            quants.splice(i, 1);
        }
    } // 2. Закрываем цикл for (который перебирает quants)

    // 3. Запускаем следующий кадр анимации
    requestAnimationFrame(runnerLoop);

} // 4. ЗАКРЫВАЕМ САМУ ФУНКЦИЮ runnerLoop (этой скобки у тебя не хватало)

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
        spawnLightning(); 
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
    // БЛОК БОНУСОВ
    else {
        let bonusRand = Math.random() * 100;
        let type;
        
        if (bonusRand < 5) {
            type = 'artifact'; // Те самые 5% на артефакт
        } else if (bonusRand < 15) { 
            type = 'qubi';     // Оставляем шанс на QUBI
        } else {
            type = 'quant';    // Всё остальное - обычный QUANT
        }

        let newSize = (type === 'artifact') ? 65 : (type === 'qubi' ? 60 : 50); 
        
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

function exchangeResources(getQubi, costQuant) {
    if (!playerData || !userRef) return;

    if (playerData.quant >= costQuant) {
        // Процесс обмена
        playerData.quant -= costQuant;
        playerData.qubi += getQubi;

        // Сохранение в базу данных
        userRef.update({
            quant: playerData.quant,
            qubi: playerData.qubi
        }).then(() => {
            console.log(`✅ Успешный обмен: ${getQubi} QUBI получено.`);
            
            // Визуальное обновление
            updateUI();
            
            // Можно добавить легкое уведомление через Telegram
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            
            alert(`Преобразование завершено!\nВы получили ${getQubi} QUBI`);
        }).catch((err) => {
            console.error("Ошибка при обмене:", err);
            alert("Ошибка связи с базой данных.");
        });
    } else {
        // Если денег не хватает
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
        alert(`Недостаточно QUANT!\nВам нужно еще ${costQuant - playerData.quant} для этого пакета.`);
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

    if (spawnRunnerObject.spawnTimer) clearTimeout(spawnRunnerObject.spawnTimer);
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

    setTimeout(() => {
        // Находим контейнер
        const report = document.querySelector('.results-container');
        if (!report) return; // Страховка от ошибок

        // Наполняем его данными (убедись, что переменные session... существуют)
        const sArt = window.sessionArtifacts || 0; 
        
        report.innerHTML = `
    <div class="result-row">
        <div class="result-label">
            <img src="assets/quant-icon.png" class="res-icon">
            <span>QUANT:</span>
        </div>
        <span class="res-value" style="color: #00e5ff;">+${sessionQuants}</span>
    </div>
    <div class="result-row">
        <div class="result-label">
            <img src="assets/qubi-icon.png" class="res-icon">
            <span>QUBI:</span>
        </div>
        <span class="res-value" style="color: #ffca28;">+${sessionQubi}</span>
    </div>
    <div class="result-row">
        <div class="result-label">
            <img src="assets/artifact.png" class="res-icon">
            <span>АРТЕФАКТЫ:</span>
        </div>
        <span class="res-value" style="color: #fff;">+${sessionArtifacts || 0}</span>
    </div>
`;
        // ТЕПЕРЬ ПОКАЗЫВАЕМ ОКНО
        document.getElementById('game-over-modal').style.display = 'flex';
        
    }, 500);
}

// Эту функцию привяжи к кнопке "ПОПРОБОВАТЬ СНОВА" в окне Game Over
// --- ВСТАВЬ ЭТО В САМЫЙ КОНЕЦ ТЕГА <script> ---

function restartGame() {
    console.log("Попытка перезапуска...");
    
    // 1. Скрываем окно
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.style.display = 'none';

    // 2. ВЫЗЫВАЕМ СОХРАНЕНИЕ (если у тебя есть такая функция)
    // saveGameResults(); 

    // 3. Закрываем и открываем заново
    if (typeof closeRunnerWindow === "function") {
        closeRunnerWindow();
    }
    
    setTimeout(() => {
        if (typeof openRunnerWindow === "function") {
            openRunnerWindow();
        }
    }, 100);
}

function goToMenu() {
    console.log("Возврат в меню...");
    
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.style.display = 'none';

    // Сохраняем результаты перед выходом
    // saveGameResults();

    if (typeof closeRunnerWindow === "function") {
        closeRunnerWindow();
    }
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

// --- ЛОГИКА ОБРАБОТКИ КЛИКОВ ---
function handleCanvasClick(e) {
    // 1. ПРОВЕРКА: Если клик был по интерфейсу (кнопки, инпуты, окна)
    // мы просто выходим и даем браузеру обработать клик в HTML
    if (e.target.tagName !== 'CANVAS') {
        return; 
    }

    // 2. БЛОКИРОВКА ФОНА, ЕСЛИ ОКНА ОТКРЫТЫ
    const earthScreen = document.getElementById('earth-screen');
    const nameModal = document.getElementById('name-input-modal');
    const buildMenu = document.getElementById('build-menu');

    const isUIOpen = (earthScreen && earthScreen.style.display === 'flex') || 
                     (nameModal && nameModal.style.display === 'flex') ||
                     (buildMenu && buildMenu.style.display === 'flex');

    if (isUIOpen) {
        return; // Блокируем вибрацию и логику планет
    }

    // 3. Остальная стандартная логика
    if (isAnyModalOpen()) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    planets.forEach(p => {
        const dx = x - p.x;
        const dy = y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < p.size / 2) {
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            if (p.action) p.action();
            else activatePlanet(p.id);
        }
    });
}

// Используем pointerdown — он понимает и клик мыши, и тап пальцем
runnerCanvas.addEventListener('pointerdown', (e) => {
    // Предотвращаем лишнее поведение (например, выделение текста)
    e.preventDefault();

    if (isRunnerActive && isPvPRaid) {
        // Даем импульс вверх
        runnerShip.vy = runnerShip.jumpPower;

        // Если хочешь добавить вибрацию при прыжке (для кайфа)
        if (window.Telegram && Telegram.WebApp.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
    }
}, { passive: false });

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

function openEarth() {
    if (!playerData.earthOpened) {
        if (playerData.quant < 500) {
            if (tg.WebApp && tg.WebApp.showAlert) {
                tg.WebApp.showAlert("Недостаточно ресурсов! Нужно 500 QUANT для терраформирования.");
            }
            return;
        }
        
        // Показываем окно
        const modal = document.getElementById('name-input-modal');
        modal.style.display = 'flex';
        
        // Автоматически ставим фокус в поле ввода через небольшую задержку
        setTimeout(() => {
            const input = document.getElementById('colony-name-input');
            input.focus();
            input.select(); // Выделяем текст "НОВАЯ ЗЕМЛЯ", чтобы его было легко стереть
        }, 100);

    } else {
        enterStrategyMode();
    }
}

// Новая функция для кнопки ОТМЕНА
function closeNameModal() {
    document.getElementById('name-input-modal').style.display = 'none';
}

function confirmColonyName() {
    const input = document.getElementById('colony-name-input');
    let pName = input.value.trim();
    
    if (!pName) pName = "НОВАЯ ЗЕМЛЯ";

    // Скрываем окно
    closeNameModal();

    // Снимаем оплату и открываем доступ
    playerData.earthOpened = true;
    playerData.colonyName = pName;
    playerData.quant -= 500;
    playerData.buildings = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    playerData.lastCollect = Date.now();

    // Сохраняем в Firebase
    userRef.update({
        earthOpened: true,
        colonyName: pName,
        quant: playerData.quant,
        buildings: playerData.buildings,
        lastCollect: playerData.lastCollect
    }).then(() => {
        updateUI();
        enterStrategyMode();
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    });
}

function calculatePassiveIncome() {
    if (!playerData.buildings || !playerData.lastCollect) {
        console.log("Нет данных для начисления дохода");
        playerData.lastCollect = Date.now(); // Инициализируем, если пусто
        return;
    }

    const now = Date.now();
    const diffInMs = now - playerData.lastCollect;
    const hoursPassed = diffInMs / (1000 * 60 * 60);

    if (diffInMs < 10000) return; 

    let totalQuant = 0;
    let totalQubi = 0;

    playerData.buildings.forEach(b => {
        // Проверяем, что b - это объект и здание существует в конфиге
        if (b && b !== 0 && buildingTypes[b.type]) {
            const config = buildingTypes[b.type];
            const levelMult = b.level || 1; // Множитель уровня

            // Считаем доход: (Базовый доход * Уровень) * Прошедшее время
            if (config.yieldType === "quant") {
                totalQuant += (config.baseYield * levelMult) * hoursPassed;
            } else if (config.yieldType === "qubi") {
                totalQubi += (config.baseYield * levelMult) * hoursPassed;
            }
        }
    });

    if (totalQuant >= 1 || totalQubi >= 1) {
        const gainedQuant = Math.floor(totalQuant);
        const gainedQubi = Math.floor(totalQubi);

        playerData.quant += gainedQuant;
        playerData.qubi = (playerData.qubi || 0) + gainedQubi;
        playerData.lastCollect = now;

        userRef.update({
            quant: playerData.quant,
            qubi: playerData.qubi,
            lastCollect: now
        }).then(() => {
            console.log(`💰 Пассивный доход: +${gainedQuant} QNT, +${gainedQubi} QUBI`);
            updateUI(); 
            // Если мы на экране Земли, обновляем и его счетчики
            if (document.getElementById('earth-screen').style.display === 'flex') {
                updateEarthUI(); 
            }
        });
    }
}

function enterStrategyMode() {
    // 1. Показываем экран Земли
    const earthScreen = document.getElementById('earth-screen');
    if (earthScreen) earthScreen.style.display = 'flex';
    
    // 2. Выводим имя планеты
    const nameDisplay = document.getElementById('colony-name-display');
    if (nameDisplay) nameDisplay.innerText = playerData.colonyName || "КОЛОНИЯ";
    
    // 3. Обновляем балансы QUANT, QUBI и Артефактов в шапке экрана
    // Используем Math.floor, чтобы не пугать игрока длинными десятичными дробями
    const quantLabel = document.getElementById('earth-quant-balance');
    const qubiLabel = document.getElementById('earth-qubi-balance');
    const artLabel = document.getElementById('player-artifacts');

    if (quantLabel) quantLabel.innerText = Math.floor(playerData.quant);
    if (qubiLabel) qubiLabel.innerText = Math.floor(playerData.qubi || 0);
    if (artLabel) artLabel.innerText = playerData.artifacts || 0;
    
    // 4. Пересчитываем текущий доход в час (только текст в инфо-панели)
    updateColonyStats();

    // 5. Отрисовываем PNG здания в слотах
    renderBuildings();
    
    // Опционально: легкая вибрация при входе в режим стратегии
    if (window.tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Выход
function exitEarth() {
    // 1. Скрываем экран
    document.getElementById('earth-screen').style.display = 'none';

    // 2. Фиксируем время выхода, чтобы доход считался с этого момента
    if (playerData.earthOpened) {
        const now = Date.now();
        playerData.lastCollect = now;
        
        userRef.update({
            lastCollect: now
        }).then(() => {
            console.log("Время сбора синхронизировано при выходе.");
        });
    }
}

function updateEarthUI() {
    const quantLabel = document.getElementById('earth-quant-balance');
    const qubiLabel = document.getElementById('earth-qubi-balance');
    const artLabel = document.getElementById('player-artifacts');

    if (quantLabel) quantLabel.innerText = Math.floor(playerData.quant);
    if (qubiLabel) qubiLabel.innerText = Math.floor(playerData.qubi || 0);
    if (artLabel) artLabel.innerText = playerData.artifacts || 0;

    // Также обновляем статистику дохода в час
    updateColonyStats();
}

// Отрисовка зданий в слотах
function renderBuildings() {
    const grid = document.getElementById('building-grid');
    const slots = grid.getElementsByClassName('slot');

    playerData.buildings.forEach((b, index) => {
        const slot = slots[index];
        slot.innerHTML = ""; // Очищаем слот перед отрисовкой

        if (b !== 0 && b !== "0") {
            // Если здание есть (b — это объект {type: 'mine', level: 1})
            const typeInfo = buildingTypes[b.type];
            
            // Создаем картинку
            const img = document.createElement('img');
            img.src = typeInfo.icon; // Путь к твоим PNG
            img.alt = typeInfo.name;
            slot.appendChild(img);

            // Добавляем индикатор уровня
            const levelTag = document.createElement('div');
            levelTag.className = 'slot-level';
            levelTag.innerText = `Lvl ${b.level}`;
            slot.appendChild(levelTag);
        } else {
            // Если пусто — можно добавить плюсик или оставить прозрачным
            slot.innerHTML = '<span style="color: rgba(0,229,255,0.2); font-size: 24px;">+</span>';
        }
    });
}

let currentSelectedSlot = null; // Запоминаем, какой слот нажали

function clickSlot(index) {
    if (!playerData.buildings) return;

    let bData = playerData.buildings[index];

    // Если слот пустой
    if (bData === 0 || bData === "0") {
        currentSelectedSlot = index;
        openBuildMenu();
    } else {
        // Если здание есть, bData будет объектом типа {type: 'mine', level: 1}
        openUpgradeMenu(index, bData);
    }
}

function openUpgradeMenu(index, building) {
    const menu = document.getElementById('build-menu');
    const list = document.getElementById('buildings-list');
    const typeInfo = buildingTypes[building.type];
    
    // Расчет стоимости: базовая цена * уровень
    const upgradeCost = typeInfo.artifactUpgradeBase * building.level;
    const hasArtifacts = (playerData.artifacts || 0) >= upgradeCost;

    list.innerHTML = `
        <div style="padding: 10px; text-align: center;">
            <img src="${typeInfo.icon}" style="width: 80px; margin-bottom: 10px; filter: drop-shadow(0 0 10px #00e5ff);">
            
            <h3 style="color: #fff; margin: 5px 0;">${typeInfo.name}</h3>
            <p style="color: #aaa; font-size: 12px;">Уровень: ${building.level} → <span style="color: #00e5ff;">${building.level + 1}</span></p>
            
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; margin: 15px 0;">
                <div style="font-size: 11px; color: #eee; margin-bottom: 8px;">Стоимость улучшения:</div>
                
                <div style="font-size: 20px; font-weight: bold; color: ${hasArtifacts ? '#ffca28' : '#ff4b2b'}; display: flex; align-items: center; justify-content: center; gap: 12px;">
                    <img src="assets/artifact.png" style="width: 52px; height: 52px; object-fit: contain; filter: drop-shadow(0 0 8px rgba(255, 202, 40, 0.4));">
                    <span>${upgradeCost} Артефактов</span>
                </div>
            </div>

            <button onclick="upgradeBuilding(${index})" 
                style="width: 100%; padding: 14px; background: ${hasArtifacts ? '#00e5ff' : '#444'}; 
                color: #000; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                ${hasArtifacts ? 'УЛУЧШИТЬ' : 'НУЖНО БОЛЬШЕ АРТЕФАКТОВ'}
            </button>
        </div>
    `;

    menu.style.display = 'flex';
}

function openBuildMenu() {
    const menu = document.getElementById('build-menu');
    const list = document.getElementById('buildings-list');
    list.innerHTML = ""; 

    Object.keys(buildingTypes).forEach(key => {
        const b = buildingTypes[key];
        const item = document.createElement('div');
        item.className = 'build-item';
        
        // Проверяем, хватает ли денег, чтобы визуально подсказать игроку
        const canAfford = playerData.quant >= b.baseCost;
        if (!canAfford) item.style.opacity = "0.5";

        item.onclick = () => {
            if (canAfford) {
                buildBuilding(currentSelectedSlot, key);
                closeBuildMenu();
            } else {
                tg.HapticFeedback.notificationOccurred('error');
                alert("Недостаточно QUANT!");
            }
        };

        item.innerHTML = `
            <div class="build-icon">
                <img src="${b.icon}" style="width: 40px; height: 40px; object-fit: contain;">
            </div>
            <div class="build-info">
                <span class="build-name">${b.name}</span>
                <span class="build-cost" style="color: ${canAfford ? '#00e5ff' : '#ff4b2b'}">
                    Цена: ${b.baseCost} QNT
                </span>
            </div>
        `;
        list.appendChild(item);
    });

    menu.style.display = 'flex';
}

function buildBuilding(slotIndex, type) {
    const config = buildingTypes[type];

    // --- ПРОВЕРКА НА ДУБЛИКАТЫ ---
    // Проверяем, есть ли уже здание такого типа в любом из слотов
    const alreadyHasThisType = playerData.buildings && playerData.buildings.some(b => b && b.type === type);

    if (alreadyHasThisType) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        alert(`Здание типа "${config.name}" уже построено! Нельзя ставить одинаковые здания.`);
        return; // Останавливаем выполнение функции
    }
    // -----------------------------

    // 1. Проверяем баланс еще раз (на всякий случай)
    if (playerData.quant >= config.baseCost) {
        
        // 2. Списываем валюту
        playerData.quant -= config.baseCost;

        // 3. Создаем объект здания в нужном слоте
        // Убедимся, что массив существует
        if (!playerData.buildings) playerData.buildings = [];

        playerData.buildings[slotIndex] = {
            type: type,
            level: 1
        };

        // 4. Сохраняем обновленный массив зданий и баланс в Firebase
        userRef.update({
            quant: playerData.quant,
            buildings: playerData.buildings
        }).then(() => {
            // 5. Обновляем интерфейс
            renderBuildings();   // Перерисовываем иконки на планете
            updateColonyStats(); // Пересчитываем доход в час
            updateUI();          // Обновляем общий баланс в шапке
            
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            console.log(`Здание ${config.name} успешно построено!`);
        }).catch((err) => {
            console.error("Ошибка при сохранении постройки:", err);
        });

    } else {
        // Если вдруг денег не хватило
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        alert("Недостаточно ресурсов!");
    }
}

function upgradeBuilding(index) {
    const building = playerData.buildings[index];
    const typeInfo = buildingTypes[building.type];
    const upgradeCost = typeInfo.artifactUpgradeBase * building.level;

    if (playerData.artifacts >= upgradeCost) {
        playerData.artifacts -= upgradeCost;
        playerData.buildings[index].level += 1; // Повышаем уровень!

        // Синхронизируем
        userRef.update({
            artifacts: playerData.artifacts,
            buildings: playerData.buildings
        }).then(() => {
            closeBuildMenu();
            renderBuildings(); // Перерисовываем слоты (чтобы сменился Lvl)
            updateEarthUI();   // Обновляем счетчики артефактов
            tg.HapticFeedback.notificationOccurred('success');
        });
    } else {
        tg.HapticFeedback.notificationOccurred('error');
    }
}

function closeBuildMenu() {
    document.getElementById('build-menu').style.display = 'none';
}

function updateColonyStats() {
    if (!playerData.buildings) return;

    let totalQNT = 0;
    let totalQUBI = 0;

    playerData.buildings.forEach(b => {
        if (b && b !== 0 && b !== "0") {
            const config = buildingTypes[b.type];
            // Проверяем, существует ли конфиг для этого типа здания
            if (config) {
                if (config.yieldType === "quant") {
                    totalQNT += config.baseYield * (b.level || 1);
                } else if (config.yieldType === "qubi") {
                    totalQUBI += config.baseYield * (b.level || 1);
                }
            }
        }
    });

    // 1. Обновляем доход QUANT
    const qntYieldEl = document.getElementById('total-yield');
    if (qntYieldEl) qntYieldEl.innerText = totalQNT;

    // 2. ОБНОВЛЯЕМ ДОХОД QUBI (добавлено)
    const qubiYieldEl = document.getElementById('total-qubi-yield');
    if (qubiYieldEl) qubiYieldEl.innerText = totalQUBI;

    // 3. Обновляем артефакты
    const artEl = document.getElementById('player-artifacts');
    if (artEl) {
        artEl.innerText = playerData.artifacts || 0;
    }
}

// Функция сбора (вызывается кнопкой)
function collectResources() {
    const now = Date.now();
    const last = playerData.lastCollect || now;
    const hoursPassed = (now - last) / (1000 * 60 * 60);

    if (hoursPassed < 0.01) { 
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
        return;
    }

    let earnedQNT = 0;
    let earnedQUBI = 0;

    playerData.buildings.forEach(b => {
        if (b && b !== 0) {
            const config = buildingTypes[b.type];
            const yieldVal = config.baseYield * (b.level || 1) * hoursPassed;
            if (config.yieldType === "quant") earnedQNT += yieldVal;
            if (config.yieldType === "qubi") earnedQUBI += yieldVal;
        }
    });

    const finalQNT = Math.floor(earnedQNT);
    const finalQUBI = Math.floor(earnedQUBI);

    playerData.quant += finalQNT;
    playerData.qubi = (playerData.qubi || 0) + finalQUBI;
    playerData.lastCollect = now;

    // Сохраняем и обновляем UI
    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        lastCollect: now
    }).then(() => {
        updateUI();
        updateEarthUI();
        showCollectModal(finalQNT, finalQUBI); // Вызываем красивое окно
    });

    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

// Функции для управления окном сбора
function showCollectModal(qnt, qubi) {
    const report = document.getElementById('collect-report');
    
    // Показываем 1 знак после запятой, чтобы видеть даже +0.1
    const finalQNT = Number(qnt || 0).toFixed(1);
    const finalQUBI = Number(qubi || 0).toFixed(1);

    let html = `
        <div class="resource-line">
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="assets/quant-icon.png" class="modal-icon">
                <span>QUANT:</span>
            </div>
            <span style="color: #fff; font-weight: bold;">+${finalQNT}</span>
        </div>
    `;
    
    // Теперь ищем 'lab', так как ты переименовал тип здания
    const hasLab = playerData.buildings && playerData.buildings.some(b => b && b.type === 'lab');

    if (hasLab) {
        html += `
            <div class="resource-line" style="margin-top: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="assets/qubi-icon.png" class="modal-icon">
                    <span>QUBI:</span>
                </div>
                <span style="color: #00e5ff; font-weight: bold;">+${finalQUBI}</span>
            </div>
        `;
    }

    report.innerHTML = html;
    document.getElementById('collect-modal').style.display = 'flex';
}

function closeCollectModal() {
    document.getElementById('collect-modal').style.display = 'none';
}

function openPvPMenu() {
    console.log("Поиск противника...");
    // Здесь будет вызов Firebase для поиска игрока, а пока тест:
    let mockOpponent = { id: "enemy123", buildings: [1, 1, 0] }; 
    startPvPRaid(mockOpponent);
}

function startPvPRaid(opponent) {
    // 1. Настройка данных
    isPvPRaid = true;
    currentOpponent = opponent;
    pvpDistance = 0;
    targetDistance = 1000 + ((opponent.buildings ? opponent.buildings.filter(b => b).length : 0) * 500);

    // 2. Настройка UI
    document.getElementById('pvp-max-dist').innerText = targetDistance;
    document.getElementById('pvp-target-name').innerText = opponent.name || "ВРАЖЕСКАЯ БАЗА";
    
    // 3. Открываем новое окно
    document.getElementById('pvp-window').style.display = 'block';
    
    // 4. Подгоняем размер канваса
    pvpCanvas.width = window.innerWidth;
    pvpCanvas.height = window.innerHeight;

    // 5. Сброс корабля для ПВП
    runnerShip.y = pvpCanvas.height / 2;
    runnerShip.vy = 0;
    runnerShip.hp = runnerShip.maxHp;

    quants = []; // Очищаем список стен
    isRunnerActive = true;
    
    spawnPvPWalls(); // Запускаем спавн стен
    pvpRaidLoop();   // Запускаем цикл (важно: используй pvpCtx внутри!)
}

function closePvPRaid() {
    isPvPRaid = false;
    isRunnerActive = false;
    document.getElementById('pvp-window').style.display = 'none';
}
    
function calculateTargetDistance(opponentData) {
    let base = 1500; // Базовые 1500 метров
    
    // Если у врага есть здания, каждое увеличивает путь на 500м
    if (opponentData.buildings) {
        opponentData.buildings.forEach(b => {
            if (b) base += 500; 
        });
    }
    return base;
}

// 1. ГЛАВНЫЙ ЦИКЛ PVP (Вместо runnerLoop)
function pvpRaidLoop() {
    if (!isRunnerActive || !isPvPRaid) return;

    runnerCtx.clearRect(0, 0, runnerCanvas.width, runnerCanvas.height);
    
    // Рисуем фон
    if (runnerBg.complete) runnerCtx.drawImage(runnerBg, 0, 0, window.innerWidth, window.innerHeight);

    // ФИЗИКА: Падение корабля
    runnerShip.vy += 0.25; // Гравитация
    runnerShip.y += runnerShip.vy;
    
    // Корабль зафиксирован слева
    runnerShip.x = window.innerWidth * 0.2;

    // Отрисовка и логика стен
    for (let i = quants.length - 1; i >= 0; i--) {
        let wall = quants[i];
        wall.x -= 4; // Скорость движения стен

        // Рисуем стены (красный неон)
        runnerCtx.fillStyle = '#ff4b2b';
        runnerCtx.shadowBlur = 15;
        runnerCtx.shadowColor = '#ff4b2b';
        runnerCtx.fillRect(wall.x, wall.y, wall.w, wall.h);
        runnerCtx.shadowBlur = 0;

        // КОЛЛИЗИЯ: Если задели стену
        if (runnerShip.x + 20 > wall.x && runnerShip.x - 20 < wall.x + wall.w &&
            runnerShip.y + 20 > wall.y && runnerShip.y - 20 < wall.y + wall.h) {
            gameOver(); // Или своя функция проигрыша
            return;
        }

        if (wall.x < -100) quants.splice(i, 1);
    }

    // ОТРИСОВКА КОРАБЛЯ (с наклоном)
    runnerCtx.save();
    runnerCtx.translate(runnerShip.x, runnerShip.y);
    runnerCtx.rotate(runnerShip.vy * 0.05);
    if (shipImg.complete) runnerCtx.drawImage(shipImg, -25, -25, 50, 50);
    runnerCtx.restore();

    // ШКАЛА ПРОГРЕССА
    pvpDistance += 1.5;
    drawPvPProgressBar(); 

    // ПРОВЕРКА ГРАНИЦ И ФИНИША
    if (runnerShip.y > runnerCanvas.height || runnerShip.y < 0) { gameOver(); return; }
    if (pvpDistance >= targetDistance) { winPvPRaid(); return; }

    requestAnimationFrame(pvpRaidLoop);
}

// 2. ОТДЕЛЬНЫЙ СПАВНЕР СТЕН
function spawnPvPWalls() {
    if (!isRunnerActive || !isPvPRaid) return;

    const gap = 180; // Проход
    const wallW = 60;
    const minH = 50;
    const topH = Math.random() * (runnerCanvas.height - gap - (minH * 2)) + minH;

    quants.push(
        { x: runnerCanvas.width, y: 0, w: wallW, h: topH, type: 'wall' },
        { x: runnerCanvas.width, y: topH + gap, w: wallW, h: runnerCanvas.height - topH - gap, type: 'wall' }
    );

    setTimeout(spawnPvPWalls, 1500);
}

// 3. ОТРИСОВКА ШКАЛЫ
function drawPvPProgressBar() {
    const pad = 50;
    const w = runnerCanvas.width - (pad * 2);
    const progress = Math.min(1, pvpDistance / targetDistance);

    runnerCtx.fillStyle = 'rgba(255,255,255,0.1)';
    runnerCtx.fillRect(pad, 40, w, 12);
    runnerCtx.fillStyle = '#ff4b2b';
    runnerCtx.fillRect(pad, 40, w * progress, 12);
    
    runnerCtx.fillStyle = '#fff';
    runnerCtx.font = "bold 14px Arial";
    runnerCtx.fillText("🏁 ЦЕЛЬ: БАЗА ВРАГА", runnerCanvas.width / 2 - 70, 30);
}

// 1. Создаем четкую функцию запуска
function startEverything() {
    console.log("Запуск всех систем...");
    initGame(); 
    // Мы НЕ вызываем здесь draw(), потому что в твоем файле 
    // regenerateEnergy уже вызывается внутри initGame (строка 206).
    // Но если ты хочешь, чтобы планеты крутились сразу, оставь:
    draw(); 
}

// 2. Проверяем загрузку фона и стартуем
if (bg.complete) {
    startEverything();
} else {
    bg.onload = startEverything;
}
