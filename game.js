let orbitAngle = 0;

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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const bg = new Image();
bg.src = 'assets/background1.jpg'; 

// --- 2. ПЛАНЕТЫ ---
const planets = [
    { 
        id: 'runner', 
        src: 'assets/quant.png', 
        x: 0.5, y: 0.5, // ЦЕНТР ГАЛАКТИКИ
        size: 120, 
        rotation: 0, speed: 0.002, img: new Image() 
    },
    { 
        id: 'build',  
        src: 'assets/earth.png', 
        x: 0.25, y: 0.5, // СЛЕВА от ядра
        size: 70, 
        rotation: 0, speed: 0.001, img: new Image() 
    },
    { 
        id: 'shop',   
        src: 'assets/mars.png',  
        x: 0.75, y: 0.5, // СПРАВА от ядра
        size: 70, 
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

    // Сбрасываем все настройки канваса до "чистых"
    ctx.filter = 'none'; 
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    if (bg.complete) {
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    }

    // Увеличиваем общий угол орбиты
    orbitAngle += 0.003; 

    planets.forEach(p => {
        if (p.img.complete) {
            ctx.save();
            
            let posX, posY;

            if (p.id === 'runner') {
                // Квант-ядро строго в центре
                posX = 0.5 * canvas.width;
                posY = 0.5 * canvas.height;
            } else if (p.id === 'build') {
                // Земля: радиус чуть меньше (20% от ширины)
                const radius = canvas.width * 0.22;
                posX = (0.5 * canvas.width) + Math.cos(orbitAngle) * radius;
                posY = (0.5 * canvas.height) + Math.sin(orbitAngle) * radius;
            } else if (p.id === 'shop') {
                // Марс: радиус чуть больше (30% от ширины) и смещен на пол-круга (Math.PI)
                const radius = canvas.width * 0.32;
                posX = (0.5 * canvas.width) + Math.cos(orbitAngle + Math.PI) * radius;
                posY = (0.5 * canvas.height) + Math.sin(orbitAngle + Math.PI) * radius;
            }

            ctx.translate(posX, posY);
            
            // Вращение самой планеты вокруг своей оси
            p.rotation += p.speed;
            ctx.rotate(p.rotation);
            
            // Рисуем строго в размер p.size без эффектов
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });

    requestAnimationFrame(draw);
}

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    planets.forEach(p => {
        let posX, posY;

        // ВЫЧИСЛЯЕМ ТЕКУЩИЕ КООРДИНАТЫ (копия логики из draw)
        if (p.id === 'runner') {
            posX = 0.5 * canvas.width;
            posY = 0.5 * canvas.height;
        } else if (p.id === 'build') {
            const radius = canvas.width * 0.22;
            posX = (0.5 * canvas.width) + Math.cos(orbitAngle) * radius;
            posY = (0.5 * canvas.height) + Math.sin(orbitAngle) * radius;
        } else if (p.id === 'shop') {
            const radius = canvas.width * 0.32;
            posX = (0.5 * canvas.width) + Math.cos(orbitAngle + Math.PI) * radius;
            posY = (0.5 * canvas.height) + Math.sin(orbitAngle + Math.PI) * radius;
        }

        // Проверяем расстояние от клика до центра планеты
        const dist = Math.hypot(clickX - posX, clickY - posY);

        if (dist < p.size / 2) {
            console.log('Нажали на:', p.id);
            activatePlanetFunction(p.id); // Твоя функция активации
        }
    });
});

function handlePress(id) {
    tg.HapticFeedback.impactOccurred('medium');

    if (id === 'runner') {
        // Квант-ядро: вход в добычу ресурсов
        tg.showPopup({
            title: 'Добыча Кванта',
            message: 'Вход в режим Runner для сбора ресурсов и переработки их в Квант.',
            buttons: [{id: 'start', type: 'default', text: 'Запустить'}, {type: 'cancel'}]
        }, (buttonId) => {
            if (buttonId === 'start') {
                // Здесь будет переход: window.location.href = 'runner.html';
                console.log("Запуск Раннера...");
            }
        });
    } 
    else if (id === 'build') {
        // Земля: создание своей планеты
        tg.showAlert("Режим «Создание планеты» станет доступен в следующем обновлении!");
    }
    else if (id === 'shop') {
        tg.showAlert("Магазин временно на техобслуживании.");
    }
}

function createClickRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = x + 'px'; ripple.style.top = y + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
}

bg.onload = () => { initGame(); draw(); };
if (bg.complete) { initGame(); draw(); }
