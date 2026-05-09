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
    { id: 'runner', src: 'assets/earth.png', x: 0.15, y: 0.3, size: 80, rotation: 0, speed: 0.002, img: new Image() },
    { id: 'planet', src: 'assets/quant.png', x: 0.5, y: 0.5, size: 140, rotation: 0, speed: 0.001, img: new Image() },
    { id: 'shop',   src: 'assets/mars.png',  x: 0.8, y: 0.65, size: 90,  rotation: 0, speed: -0.0015, img: new Image() }
];

planets.forEach(p => { p.img.src = p.src; });

// Данные игрока
const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);
let playerData = { quant: 0, qubi: 0, energy: 100, level: 1 };

let mouseX = 0, mouseY = 0;
// Ослабил параллакс для мобилок (коэффициент 5 вместо 15)
window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 5;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 5;
});

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

    if (bg.complete) ctx.drawImage(bg, -20 + mouseX, -20 + mouseY, canvas.width + 40, canvas.height + 40);

    stars.forEach(s => {
        ctx.globalAlpha = 0.2 + Math.abs(Math.sin(Date.now() * s.blink));
        ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc((s.x/100) * canvas.width, (s.y/100) * canvas.height, s.size, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    planets.forEach(p => {
        if (p.img.complete && p.img.naturalWidth !== 0) {
            const pX = p.x * canvas.width + (mouseX * 0.5), pY = p.y * canvas.height + (mouseY * 0.5);
            ctx.save();
            ctx.translate(pX, pY);
            p.rotation += p.speed;
            ctx.rotate(p.rotation);
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });
    requestAnimationFrame(draw);
}

canvas.addEventListener('click', (e) => {
    const x = e.clientX, y = e.clientY;
    planets.forEach(p => {
        const pX = p.x * canvas.width + (mouseX * 0.5), pY = p.y * canvas.height + (mouseY * 0.5);
        if (Math.sqrt((x - pX)**2 + (y - pY)**2) < p.size / 2) {
            createClickRipple(x, y);
            handlePress(p.id);
        }
    });
});

function handlePress(id) {
    tg.HapticFeedback.impactOccurred('light');
    if (id === 'runner') console.log("Run Game");
    else if (id === 'planet') {
        playerData.quant += 1; // Простой кликер для теста
        updateUI();
        userRef.update({ quant: playerData.quant });
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
