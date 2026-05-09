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
bg.src = 'assets/background1.jpg';

// Данные из ТГ
const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);

let playerData = {
    quant: 0,
    qubi: 0,
    energy: 100,
    level: 1
};

// --- 1. ПЕРЕМЕННЫЕ И НАСТРОЙКИ ---
const zones = [
    { id: 'runner', x: 0.22, y: 0.36, r: 60, color: 'rgba(0, 229, 255, 0.4)' }, // Земля
    { id: 'planet', x: 0.50, y: 0.52, r: 80, color: 'rgba(255, 255, 255, 0.3)' }, // Центр
    { id: 'shop',   x: 0.85, y: 0.46, r: 55, color: 'rgba(255, 87, 34, 0.4)' }  // Марс
];

let stars = [];
// Создаем 80 мерцающих звезд
for(let i = 0; i < 80; i++) {
    stars.push({
        x: Math.random() * 100, // в процентах
        y: Math.random() * 100,
        size: Math.random() * 2,
        opacity: Math.random(),
        speed: 0.01 + Math.random() * 0.03
    });
}

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

    // Эффект "дыхания" фона
    const breathe = Math.sin(Date.now() * 0.001) * 0.01;
    const w = canvas.width * (1.02 + breathe);
    const h = canvas.height * (1.02 + breathe);
    const offsetX = (canvas.width - w) / 2;
    const offsetY = (canvas.height - h) / 2;

    // Рисуем основной фон
    ctx.drawImage(bg, offsetX, offsetY, w, h);

    // Рисуем живые звезды
    ctx.fillStyle = "white";
    stars.forEach(s => {
        const opacity = 0.3 + Math.abs(Math.sin(Date.now() * s.blink));
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc((s.x/100) * canvas.width, (s.y/100) * canvas.height, s.size, 0, Math.PI*2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Анимированное свечение планет
    zones.forEach(z => {
        const pulse = Math.sin(Date.now() * 0.004) * 8;
        const x = z.x * canvas.width;
        const y = z.y * canvas.height;

        const gradient = ctx.createRadialGradient(x, y, z.r * 0.7, x, y, z.r + pulse);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(1, z.color);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, z.r + pulse, 0, Math.PI * 2);
        ctx.fill();
    });

    requestAnimationFrame(draw);
}

function handlePress(id) {
    // Разная вибрация для разных планет
    if (id === 'runner') tg.HapticFeedback.notificationOccurred('success');
    else if (id === 'planet') tg.HapticFeedback.impactOccurred('heavy');
    else tg.HapticFeedback.impactOccurred('medium');

    // Эффект вспышки на экране
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '100';
    document.body.appendChild(flash);
    
    setTimeout(() => flash.remove(), 100);

    // Логика по планетам
    switch(id) {
        case 'runner':
            console.log("Режим полета");
            // Здесь можно запустить анимацию "влета" в планету
            break;
        case 'planet':
            tg.showPopup({
                title: 'Ваша Планета',
                message: `Уровень: ${playerData.level}\nРесурсов: ${playerData.quant}`,
                buttons: [{type: 'ok'}]
            });
            break;
        case 'shop':
            tg.showAlert("Магазин QUANT: Скоро открытие!");
            break;
    }
}

bg.onload = () => {
    initGame();
    draw();
};

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    zones.forEach(z => {
        const dist = Math.sqrt((x - z.x*canvas.width)**2 + (y - z.y*canvas.height)**2);
        if (dist < z.r) {
            createClickRipple(x, y); // Эффект круга при клике
            handlePress(z.id);
        }
    });
});

function createClickRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}
