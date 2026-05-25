// ======= НАСТРОЙКИ FIREBASE =======
// !!! Вставь сюда СВОИ данные из консоли Firebase !!!

const firebaseConfig = {
  apiKey: "AIzaSyDaqDEFnRgoOoQRpoQoZ5_OZq4FywdbByM",
  authDomain: "checkers-roulette.firebaseapp.com",
  databaseURL: "https://checkers-roulette-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "checkers-roulette",
  storageBucket: "checkers-roulette.firebasestorage.app",
  messagingSenderId: "856460439104",
  appId: "1:856460439104:web:0e386cc2afca3b655af9a5"
};

// Инициализируем Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ======= Игровые Константы =======
const BETTING_TIME = 15;         // Время ставок (сек)
const BALL_MAX_SPEED = 100;       // Виртуальная скорость
const BALL_DECELERATION = 0.985; // Коэффициент замедления
const MIN_BET = 10;              // Минимальная ставка

// Виртуальные размеры поля для 100% одинаковой физики на телефонах и ПК
const VIRTUAL_WIDTH = 400;
const VIRTUAL_HEIGHT = 400;
const VIRTUAL_RADIUS = 12;

// ======= Глобальные переменные состояния =======
let myPlayerId = localStorage.getItem('roulette_player_id');
if (!myPlayerId) {
    myPlayerId = `player_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('roulette_player_id', myPlayerId);
}

let players = {};         // Локальная копия игроков из БД
let gameState = {};       // Состояние игры из БД
let onlinePlayers = [];   // Список ID игроков, которые сейчас ОНЛАЙН

let timerInterval = null;
let animationFrameId = null;
let serverOffset = 0;     // Разница во времени между клиентом и сервером

// Физика и воспроизведение пути
let currentPath = [];     // Сюда запишется рассчитанный путь шарика
let animStartTime = 0;    // Точное время запуска анимации на устройстве
let ballX = 200, ballY = 200;

// Контрастные цвета
const DISTINCT_COLORS = [
    '#FF3D00', '#00e632', '#101e35', '#FFEA00', '#D500F9', '#1ba3b3', 
    '#FF9100', '#F50057', '#7daf55', '#3D5AFE',  '#5d8056', '#000000', '#58615c', '#eb5d7c'
];

// DOM Элементы
let bettingTimerDisplay, totalBankDisplay, wheelInner, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, gameMessage;

function getServerTime() {
    return Date.now() + serverOffset;
}

// Определение Хоста: первый отсортированный ID среди тех, кто реально ОНЛАЙН
function isHost() {
    if (onlinePlayers.length === 0) return false;
    return onlinePlayers[0] === myPlayerId;
}

// ======= Инициализация при загрузке страницы =======
document.addEventListener('DOMContentLoaded', () => {
    bettingTimerDisplay = document.getElementById('bettingTimer');
    totalBankDisplay = document.getElementById('totalBank');
    wheelInner = document.getElementById('wheelInner');
    gameAreaWrapper = document.getElementById('gameAreaWrapper');
    ball = document.getElementById('ball');
    playerNameInput = document.getElementById('playerNameInput');
    betAmountInput = document.getElementById('betAmountInput');
    placeBetButton = document.getElementById('placeBetButton');
    betList = document.getElementById('betList');
    gameMessage = document.getElementById('gameMessage');

    const savedName = localStorage.getItem('roulette_player_name');
    if (savedName && playerNameInput) {
        playerNameInput.value = savedName;
    }

    if (placeBetButton) placeBetButton.addEventListener('click', placeBet);
    if (betAmountInput) betAmountInput.addEventListener('keypress', e => { if (e.key === 'Enter') placeBet(); });

    // Проверяем, зашел ли Администратор (?admin=1 в ссылке)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1') {
        document.getElementById('adminPanel').style.display = 'block';
        initAdminPanel();
    }

    // 1. Получаем разницу во времени с сервером
    db.ref('.info/serverTimeOffset').on('value', (snap) => {
        serverOffset = snap.val() || 0;
    });

    // 2. Система мониторинга присутствия (Online/Offline)
    db.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === true) {

const presenceRef = db.ref(`presence/${myPlayerId}`);
            presenceRef.set(true);
            presenceRef.onDisconnect().remove();
        }
    });

    // 3. Отслеживаем список тех, кто сейчас онлайн
    db.ref('presence').on('value', (snap) => {
        onlinePlayers = Object.keys(snap.val() || {}).sort();
        checkHostTimerLogic();
    });

    // 4. Слушаем изменения игроков (ставок, балансов)
    db.ref('players').on('value', (snapshot) => {
        players = snapshot.val() || {};
        
        // Отображение приветствия и баланса в шапке
        const me = players[myPlayerId];
        if (me) {
            document.getElementById('userWelcome').textContent = me.name || "Игрок";
            document.getElementById('myBalance').textContent = me.balance || 0;
        } else {
            document.getElementById('userWelcome').textContent = playerNameInput.value.trim() || "Игрок";
            document.getElementById('myBalance').textContent = 0;
        }

        renderBets();
        renderWheelSections();
        checkHostTimerLogic();
    });

    // 5. Слушаем состояние игры
    db.ref('gameState').on('value', (snapshot) => {
        gameState = snapshot.val() || { status: 'betting' };
        syncGameWithDatabase();
    });
});

// ======= Логика Ставок (с учетом Баланса) =======
function placeBet() {
    const status = gameState.status || 'betting';
    if (status !== 'betting') {
        alert('Ставки закрыты!');
        return;
    }

    const name = playerNameInput ? playerNameInput.value.trim() : '';
    const amount = betAmountInput ? parseInt(betAmountInput.value) : NaN;

    if (!name) {
        alert('Введите имя!');
        return;
    }
    if (isNaN(amount) || amount < MIN_BET) {
        alert(`Минимальная ставка — ${MIN_BET} ₽!`);
        return;
    }

    // Проверяем баланс игрока в БД
    const myData = players[myPlayerId] || { balance: 0 };
    const myCurrentBalance = myData.balance || 0;

    if (amount > myCurrentBalance) {
        alert(`Недостаточно средств! Ваш баланс: ${myCurrentBalance} ₽. Пополните его, нажав на кнопку баланса.`);
        return;
    }

    localStorage.setItem('roulette_player_name', name);

    // Списываем ставку из баланса и прибавляем к ставке раунда
    const newBalance = myCurrentBalance - amount;
    const currentBet = myData.totalBet || 0;
    const playerColor = myData.color || DISTINCT_COLORS[Object.keys(players).length % DISTINCT_COLORS.length];

    db.ref(`players/${myPlayerId}`).update({
        name: name,
        color: playerColor,
        totalBet: currentBet + amount,
        balance: newBalance
    });

    if (betAmountInput) betAmountInput.value = '';
}

// ======= Синхронизация с базой данных =======
function syncGameWithDatabase() {
    const status = gameState.status || 'betting';
    const totalBank = calculateTotalBank();

    if (placeBetButton) placeBetButton.disabled = (status !== 'betting');
    if (betAmountInput) betAmountInput.disabled = (status !== 'betting');
    if (playerNameInput) playerNameInput.disabled = (status !== 'betting');
    if (totalBankDisplay) totalBankDisplay.textContent = totalBank;

    if (status === 'betting') {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (ball) ball.style.display = 'none';

        if (gameState.timerEnd && gameState.timerEnd > 0) {
            if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'block';
            if (gameMessage) {
                gameMessage.textContent = 'Ставки приняты! Время пошло';
                gameMessage.style.color = '#61dafb';
                gameMessage.style.backgroundColor = 'transparent';
            }
            startLocalTimer(gameState.timerEnd);
        } else {
            if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
            if (gameMessage) {
                gameMessage.textContent = 'Ждем ставки...';
                gameMessage.style.color = 'white';
                gameMessage.style.backgroundColor = 'transparent';
            }
            stopLocalTimer();
        }
    } 
    else if (status === 'running') {
        stopLocalTimer();
        if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
        if (gameMessage) {
            gameMessage.textContent = 'Шарик запущен!';
            gameMessage.style.color = '#61dafb';
            gameMessage.style.backgroundColor = 'transparent';
        }
        if (!animationFrameId) {
            startLocalRound(gameState.launchAngle);
        }
    } 
    else if (status === 'finished') {
        stopLocalTimer();
        if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
        
        if (gameMessage) {
            gameMessage.style.display = 'block';
            gameMessage.style.color = 'black';
            gameMessage.style.backgroundColor = gameState.winnerColor || '#61dafb';
            gameMessage.textContent = `Победил: ${gameState.winnerName} 🎉 (+${gameState.winnerPrize} ₽)`;
        }
    }
}

// ======= Таймер =======
function startLocalTimer(timerEnd) {
    stopLocalTimer();
    timerInterval = setInterval(() => {
        const timeLeft = Math.max(0, Math.ceil((timerEnd - getServerTime()) / 1000));
        if (bettingTimerDisplay) bettingTimerDisplay.textContent = timeLeft + 'с';

        if (timeLeft <= 0) {
            stopLocalTimer();
            if (isHost() && gameState.status === 'betting') {
                triggerRoundStart();
            }
        }
    }, 200);
}

function stopLocalTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ======= Усиленная Логика Хоста =======
function checkHostTimerLogic() {
    if (!isHost()) return;

    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    const status = gameState.status || 'betting';
    const now = getServerTime();

    // Если время вышло, а мы все еще в статусе "ставки" - запускаем раунд принудительно
    if (status === 'betting' && gameState.timerEnd > 0 && now >= gameState.timerEnd) {
        triggerRoundStart();
        return;
    }

    // Запуск таймера при наличии 2 и более игроков
    if (status === 'betting' && activePlayers.length >= 2 && (!gameState.timerEnd || gameState.timerEnd === 0)) {
        db.ref('gameState').update({
            timerEnd: now + (BETTING_TIME * 1000)
        });
    }

    // Сброс таймера, если активных игроков стало меньше 2
    if (status === 'betting' && activePlayers.length < 2 && (gameState.timerEnd && gameState.timerEnd > 0)) {
        db.ref('gameState').update({
            timerEnd: 0
        });
    }
}

function triggerRoundStart() {
    const launchAngle = Math.random() * Math.PI * 2;
    db.ref('gameState').set({
        status: 'running',
        launchAngle: launchAngle,
        timerEnd: 0
    });
}

// ======= Путь шарика и его отрисовка =======
function generateDeterministicPath(angle) {
    let x = VIRTUAL_WIDTH / 2;
    let y = VIRTUAL_HEIGHT / 2;
    let vx = Math.cos(angle) * BALL_MAX_SPEED;
    let vy = Math.sin(angle) * BALL_MAX_SPEED;
    
    const path = [];
    let iterations = 0;

    while ((Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) && iterations < 2000) {
        x += vx;
        y += vy;

        if (x - VIRTUAL_RADIUS < 0) {
            vx = Math.abs(vx);
            x = VIRTUAL_RADIUS;
        } else if (x + VIRTUAL_RADIUS > VIRTUAL_WIDTH) {
            vx = -Math.abs(vx);
            x = VIRTUAL_WIDTH - VIRTUAL_RADIUS;
        }

        if (y - VIRTUAL_RADIUS < 0) {
            vy = Math.abs(vy);
            y = VIRTUAL_RADIUS;
        } else if (y + VIRTUAL_RADIUS > VIRTUAL_HEIGHT) {
            vy = -Math.abs(vy);
            y = VIRTUAL_HEIGHT - VIRTUAL_RADIUS;
        }

        vx *= BALL_DECELERATION;
        vy *= BALL_DECELERATION;

        path.push({ x: x, y: y });
        iterations++;
    }


return path;
}

function startLocalRound(launchAngle) {
    if (ball) ball.style.display = 'block';
    currentPath = generateDeterministicPath(launchAngle);
    animStartTime = Date.now();
    animationFrameId = requestAnimationFrame(animateDeterministicBall);
}

function animateDeterministicBall() {
    const elapsed = Date.now() - animStartTime;
    const targetFps = 60;
    const frameIndex = Math.floor((elapsed / 1000) * targetFps);

    if (frameIndex < currentPath.length) {
        const coord = currentPath[frameIndex];
        ballX = coord.x;
        ballY = coord.y;

        if (ball && gameAreaWrapper) {
            const rect = gameAreaWrapper.getBoundingClientRect();
            const borderSize = 5;
            const actualSize = rect.width - (borderSize * 2);
            const scale = actualSize / VIRTUAL_WIDTH;

            const screenX = ballX * scale;
            const screenY = ballY * scale;
            const screenRadius = VIRTUAL_RADIUS * scale;

            ball.style.width = `${screenRadius * 2}px`;
            ball.style.height = `${screenRadius * 2}px`;
            ball.style.left = `${screenX - screenRadius}px`;
            ball.style.top = `${screenY - screenRadius}px`;
        }

        animationFrameId = requestAnimationFrame(animateDeterministicBall);
    } else {
        const finalCoord = currentPath[currentPath.length - 1];
        ballX = finalCoord.x;
        ballY = finalCoord.y;

        animationFrameId = null;
        if (isHost()) {
            determineAndPublishWinner();
        }
    }
}

// ======= Определение Победителя =======
function determineAndPublishWinner() {
    const dx = ballX - (VIRTUAL_WIDTH / 2);
    const dy = ballY - (VIRTUAL_HEIGHT / 2);

    let finalAngle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
    if (finalAngle < 0) finalAngle += 360;
    if (finalAngle >= 360) finalAngle -= 360;

    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    let winner = null;
    let winAmount = calculateTotalBank();

    if (activePlayers.length > 0) {
        activePlayers.sort((a, b) => a.name.localeCompare(b.name));
        let currentAngle = 0;

        for (const p of activePlayers) {
            const size = (p.totalBet / winAmount) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + size;
            currentAngle += size;

            if (startAngle <= endAngle) {
                if (finalAngle >= startAngle && finalAngle < endAngle) {
                    winner = p;
                    break;
                }
            } else {
                if (finalAngle >= startAngle || finalAngle < endAngle) {
                    winner = p;
                    break;
                }
            }
        }
        if (!winner) winner = activePlayers[0];
    }

    if (winner) {
        // Начисляем выигрыш победителю на его баланс в БД
        const winnerId = Object.keys(players).find(k => players[k].name === winner.name);
        if (winnerId) {
            const winnerCurrentBalance = players[winnerId].balance || 0;
            db.ref(`players/${winnerId}`).update({
                balance: winnerCurrentBalance + winAmount
            });
        }

        db.ref('gameState').set({
            status: 'finished',
            winnerName: winner.name,
            winnerColor: winner.color,
            winnerPrize: winAmount
        });
    } else {
        db.ref('gameState').set({
            status: 'finished',
            winnerName: 'Никто',
            winnerColor: '#e57373',
            winnerPrize: 0
        });
    }

    setTimeout(() => {
        if (isHost()) {
            resetRoomForNextRound();
        }
    }, 6000);
}

function resetRoomForNextRound() {
    const updatedPlayers = {};
    const shuffledColors = [...DISTINCT_COLORS].sort(() => Math.random() - 0.5);

    let colorIndex = 0;
    for (const id in players) {
        if (onlinePlayers.includes(id)) {
            updatedPlayers[id] = {
                name: players[id].name,
                color: shuffledColors[colorIndex % shuffledColors.length],
                totalBet: 0,
                balance: players[id].balance || 0 // баланс сохраняем!
            };
            colorIndex++;
        }
    }

    db.ref('players').set(updatedPlayers);
    db.ref('gameState').set({
        status: 'betting',
        timerEnd: 0
    });
}

// ======= Окна Пополнения (Депозитов) =======
function openDepositModal() {
    document.getElementById('depositModal').style.display = 'block';
    document.getElementById('depositStep1').style.display = 'block';
    document.getElementById('depositStep2').style.display = 'none';
    document.getElementById('depositStep3').style.display = 'none';
}

function closeDepositModal() {
    document.getElementById('depositModal').style.display = 'none';
}

function goToDepositStep2() {
    const amount = parseInt(document.getElementById('depositAmountInput').value);
    if (isNaN(amount) || amount < 10) {
        alert('Минимальная сумма пополнения — 10 ₽!');
        return;
    }
    document.getElementById('reqAmount').textContent = amount;
    document.getElementById('depositStep1').style.display = 'none';
    document.getElementById('depositStep2').style.display = 'block';
}

function sendDepositRequest() {
    const amount = parseInt(document.getElementById('depositAmountInput').value);
    const name = playerNameInput.value.trim() || "Без имени";

    // Создаем запись запроса на пополнение в Firebase
    const reqRef = db.ref('deposit_requests').push();
    reqRef.set({
        id: reqRef.key,
        playerId: myPlayerId,
        playerName: name,
        amount: amount,
        status: 'pending'
    });

    document.getElementById('depositStep2').style.display = 'none';
    document.getElementById('depositStep3').style.display = 'block';
}

// ======= ПАНЕЛЬ АДМИНИСТРАТОРА =======
function initAdminPanel() {
    db.ref('deposit_requests').on('value', (snap) => {
        const requests = snap.val() || {};
        const adminList = document.getElementById('adminRequestsList');
        adminList.innerHTML = '';

        const pending = Object.values(requests).filter(r => r.status === 'pending');

        if (pending.length === 0) {
            adminList.innerHTML = '<p class="no-reqs">Нет активных заявок на пополнение</p>';
            return;
        }

        pending.forEach(req => {
            const item = document.createElement('div');
            item.className = 'admin-req-item';
            item.innerHTML = `
                <p>👤 <strong>${req.playerName}</strong> просит пополнить <strong>${req.amount} ₽</strong></p>
                <div class="admin-btns">
                    <button class="admin-approve-btn" onclick="approveDeposit('${req.id}', '${req.playerId}', ${req.amount})">Принять</button>
                    <button class="admin-decline-btn" onclick="declineDeposit('${req.id}')">Отклонить</button>
                </div>
            `;
            adminList.appendChild(item);
        });
    });
}

// Одобрение заявки админом
window.approveDeposit = function(reqId, playerId, amount) {
    // Начисляем баланс игроку транзакцией
    db.ref(`players/${playerId}/balance`).transaction((current) => {
        return (current || 0) + amount;
    });
    // Удаляем или меняем статус заявки
    db.ref(`deposit_requests/${reqId}`).remove();
}

// Отклонение заявки админом
window.declineDeposit = function(reqId) {
    db.ref(`deposit_requests/${reqId}`).remove();
}

// ======= Вспомогательные отрисовки UI =======
function calculateTotalBank() {
    return Object.values(players).reduce((acc, p) => acc + (p.totalBet || 0), 0);
}

function renderBets() {
    if (!betList) return;
    const active = Object.values(players).filter(p => p.totalBet > 0).sort((a, b) => b.totalBet - a.totalBet);
    const totalB = calculateTotalBank();

    betList.innerHTML = '';
    if (active.length === 0) {
        betList.innerHTML= '<div class="bet-placeholder">Пока нет ставок...</div>';
        return;
    }

    active.forEach(p => {
        const percentage = ((p.totalBet / totalB) * 100).toFixed(1);

        const item = document.createElement('div');
        item.className = 'bet-item';
        item.style.borderLeft = `4px solid ${p.color}`;
        item.innerHTML = `
            <div class="avatar" style="background:${p.color}">${p.name[0].toUpperCase()}</div>
            <div class="bet-info">
                <strong>${p.name}</strong> 
                <span>${p.totalBet} ₽</span>
            </div>
            <div class="bet-chance">${percentage}%</div>
        `;
        betList.appendChild(item);
    });
}

function renderWheelSections() {
    if (!wheelInner) return;
    const active = Object.values(players).filter(p => p.totalBet > 0);
    const totalB = calculateTotalBank();

    if (active.length === 0 || totalB === 0) {
        wheelInner.style.background = '#333';
        if (gameAreaWrapper) {
            gameAreaWrapper.classList.add('empty-field');
        }
        return;
    } else {
        if (gameAreaWrapper) {
            gameAreaWrapper.classList.remove('empty-field');
        }
    }

    active.sort((a, b) => a.name.localeCompare(b.name));

    let currentAngle = 0;
    const segments = active.map(p => {
        const size = (p.totalBet / totalB) * 360;
        const start = currentAngle;
        const end = currentAngle + size;
        const seg = `${p.color} ${start}deg ${end}deg`;
        currentAngle += size;
        return seg;
    });

    wheelInner.style.background = `conic-gradient(${segments.join(', ')})`;
}


