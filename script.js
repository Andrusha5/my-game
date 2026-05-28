// ======= НАСТРОЙКИ FIREBASE =======
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

// ======= Глобальные переменные состояния =======
let myPlayerId = localStorage.getItem('roulette_player_id');
if (!myPlayerId) {
    myPlayerId = `player_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('roulette_player_id', myPlayerId);
}

let players = {};         
let gameState = {};       
let onlinePlayers = [];   
let serverOffset = 0;     

// Переменные мультиплеера
const BETTING_TIME = 15;
const BALL_MAX_SPEED = 150;
const BALL_DECELERATION = 0.985;
const MIN_BET = 10;
const VIRTUAL_WIDTH = 400;
const VIRTUAL_HEIGHT = 400;
const VIRTUAL_RADIUS = 12;

let timerInterval = null;
let animationFrameId = null;
let currentPath = [];
let animStartTime = 0;
let ballX = 200, ballY = 200;

const DISTINCT_COLORS = [
     '#6d8681',  '#eeff00',  
      '#a7ff03', '#0026ff',  
    '#651FFF', '#FF1744',  '#e100ff',
    '#00ff15', '#FF6D00',  
    '#00a0ea',    
];


// Переменные «Невозможного колеса»
let spSelectedPercent = 50;  
let spTotalRotation = 0;     
let spIsSpinning = false;    

const SP_RULES = {
    75: { mult: 1.2, label: 'x1.2' },
    50: { mult: 1.4, label: 'x1.4' },
    33: { mult: 1.55, label: 'x1.55' },
    25: { mult: 1.8, label: 'x1.8' },
    10: { mult: 2.2, label: 'x2.2' },
    1:  { mult: 33.0, label: 'x33.0' }
};

// Переменные «Всегда Голубь» (Монетка)
let coinChoice = 'heads'; // 'heads' или 'tails'
let coinIsSpinning = false;

// Переменные «Везде мины»
let minesGameActive = false;
let minesMap = []; // Массив из 25 элементов (true - мина, false - пусто)
let minesOpened = []; // Массив открытых индексов
let minesCurrentBet = 0;

// Массив мультипликаторов для 3 мин из 25 клеток (всего 22 безопасные)
const MINES_MULTIPLIERS = [
    0.90, 1.00, 1.11, 1.33, 1.50, 1.86, 2.00, 2.75, 3.33, 4.00, 
    5.55, 6.15, 6.99, 8.99, 12.65, 15.33, 22.65, 33.33, 49.75, 
    67.00, 133.33, 555.55, 999.67
];

// DOM элементы
let bettingTimerDisplay, totalBankDisplay, gameCanvas, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, historyList, gameMessage;

function getServerTime() {
    return Date.now() + serverOffset;
}

function isHost() {
    if (onlinePlayers.length === 0) return false;
    return onlinePlayers[0] === myPlayerId;
}

window.showScreen = function(screenId) {
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('multiplayerGameScreen').style.display = 'none';
    document.getElementById('singleplayerGameScreen').style.display = 'none';
    document.getElementById('coinGameScreen').style.display = 'none';
    document.getElementById('minesGameScreen').style.display = 'none';
    
    document.getElementById(screenId).style.display = 'flex';
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    bettingTimerDisplay = document.getElementById('bettingTimer');
    totalBankDisplay = document.getElementById('totalBank');
    gameCanvas = document.getElementById('gameCanvas');
    gameAreaWrapper = document.getElementById('gameAreaWrapper');
    ball = document.getElementById('ball');
    playerNameInput = document.getElementById('playerNameInput');
    betAmountInput = document.getElementById('betAmountInput');
    placeBetButton = document.getElementById('placeBetButton');
    betList = document.getElementById('betList');
    historyList = document.getElementById('historyList');
    gameMessage = document.getElementById('gameMessage');

    const savedName = localStorage.getItem('roulette_player_name');
    if (savedName && playerNameInput) {
        playerNameInput.value = savedName;
    }

    if (placeBetButton) placeBetButton.addEventListener('click', placeBet);
    if (betAmountInput) betAmountInput.addEventListener('keypress', e => { if (e.key === 'Enter') placeBet(); });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1') {
        document.getElementById('adminPanel').style.display = 'block';
        initAdminPanel();
    }

    db.ref('.info/serverTimeOffset').on('value', (snap) => {
        serverOffset = snap.val() || 0;
    });

    db.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === true) {
            const presenceRef = db.ref(`presence/${myPlayerId}`);
            presenceRef.set(true);
            presenceRef.onDisconnect().remove();
        }
    });

    db.ref('presence').on('value', (snap) => {
        onlinePlayers = Object.keys(snap.val() || {}).sort();
        checkHostTimerLogic();
    });

    db.ref(`players/${myPlayerId}`).once('value', (snap) => {
        if (!snap.exists()) {
            db.ref(`players/${myPlayerId}`).set({
                name: savedName || "Игрок",
                balance: 100, 
                totalBet: 0,
                color: DISTINCT_COLORS[Math.floor(Math.random() * DISTINCT_COLORS.length)]
            });
        }
    });

    db.ref('players').on('value', (snapshot) => {
        players = snapshot.val() || {};
        const me = players[myPlayerId];
        if (me) {
            if (document.getElementById('userWelcome')) {
                document.getElementById('userWelcome').textContent = me.name || "Игрок";
            }
            if (document.getElementById('myBalance')) {
                document.getElementById('myBalance').textContent = me.balance || 0;
            }
            updateSpSummary();
            updateMinesSummary();
        }
        renderBets();
        renderWheelSections();
        checkHostTimerLogic();
    });

    db.ref('gameState').on('value', (snapshot) => {
        gameState = snapshot.val() || { status: 'betting' };
        syncGameWithDatabase();
    });

    // Получаем последние 10 записей истории
    db.ref('history').limitToLast(10).on('value', (snapshot) => {
        renderHistory(snapshot.val() || {});
    });

    selectSpPercent(50);
    renderMinesGrid();
});

// ======= ВКЛАДКИ МУЛЬТИПЛЕЕРА =======
window.switchMultiTab = function(tabName) {
    const betsBtn = document.getElementById('tabBetsBtn');
    const historyBtn = document.getElementById('tabHistoryBtn');
    
    if (tabName === 'bets') {
        betsBtn.classList.add('active');
        historyBtn.classList.remove('active');
        betList.style.display = 'block';
        historyList.style.display = 'none';
    } else {
        betsBtn.classList.remove('active');
        historyBtn.classList.add('active');
        betList.style.display = 'none';
        historyList.style.display = 'block';
    }
}

// Отображение истории
function renderHistory(historyData) {
    if (!historyList) return;
    historyList.innerHTML = '';

    const list = Object.values(historyData).reverse(); // Показываем последние сверху

    if (list.length === 0) {
        historyList.innerHTML = '<div class="bet-placeholder">История побед пуста...</div>';
        return;
    }

    list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'bet-item';
        div.style.borderLeft = `4px solid #00E676`;
        div.innerHTML = `
            <div class="avatar" style="background:#00E676; color:black;">💰</div>
            <div class="bet-info">
                <strong>${item.playerName}</strong>
                <span>Выиграл: ${item.winnerPrize} ₽</span>
            </div>
            <div class="bet-chance" style="color:#00E676">${item.winnerChance}% шанс</div>
        `;
        historyList.appendChild(div);
    });
}

// ======= ИГРА 1: ВСЕГДА ГОЛУБЬ (COIN FLIP) =======

window.selectCoinChoice = function(choice) {
    if (coinIsSpinning) return;
    coinChoice = choice;
    document.getElementById('btnCoinHeads').classList.toggle('active', choice === 'heads');
    document.getElementById('btnCoinTails').classList.toggle('active', choice === 'tails');
}

window.playCoinFlip = function() {
    if (coinIsSpinning) return;

    const betInput = document.getElementById('coinBetInput');
    const message = document.getElementById('coinMessage');
    const coinEl = document.getElementById('coin3d');
    
    const bet = parseInt(betInput.value) || 0;
    const myData = players[myPlayerId] || { balance: 0 };
    const balance = myData.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств на балансе!');
        return;
    }

    coinIsSpinning = true;
    betInput.disabled = true;
    message.textContent = 'Монетка летит...';
    message.style.color = '#FFC400';

    // Списание баланса
    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return (current || 0) - bet;
    }, (error, committed) => {
        if (committed) {
            // Определяем исход (50% орел, 50% решка)
            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            
            // Расчет углов анимации (несколько полных кувырков)
            const spins = 10; 
            const targetRotation = result === 'heads' ? (spins * 360) : (spins * 360 + 180);
            
            coinEl.style.transform = `rotateY(${targetRotation}deg)`;

            setTimeout(() => {
                const won = coinChoice === result;
                if (won) {
                    const prize = Math.floor(bet * 1.5);
                    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
                        return (current || 0) + prize;
                    });
                    message.innerHTML = `🎉 Вы угадали! Монетка выпала: <strong>${result === 'heads' ? 'Орел' : 'Решка'}</strong>. Выигрыш: <span class="win-color">+${prize} ₽</span>`;
                } else {
                    message.innerHTML = `🔴 Не угадали! Монетка выпала: <strong>${result === 'heads' ? 'Орел' : 'Решка'}</strong>. <span style="color:#ff1744">-${bet} ₽</span>`;
                }
                
                coinIsSpinning = false;
                betInput.disabled = false;
            }, 3000); // Время анимации
        } else {
            coinIsSpinning = false;
            betInput.disabled = false;
            message.textContent = 'Ошибка транзакции. Попробуйте еще раз.';
        }
    });
}

// ======= ИГРА 2: ВЕЗДЕ МИНЫ (MINES) =======

function renderMinesGrid() {
    const grid = document.getElementById('minesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('button');
        cell.className = 'mine-cell';
        cell.id = `mine_cell_${i}`;
        cell.disabled = true; // Отключены до нажатия "Начать"
        cell.onclick = () => clickMineCell(i);
        grid.appendChild(cell);
    }
}

function updateMinesSummary() {
    const betInput = document.getElementById('minesBetInput');
    const cashoutVal = document.getElementById('minesCashoutValue');
    if (!betInput || !cashoutVal) return;

    const bet = parseInt(betInput.value) || 0;
    if (!minesGameActive) {
        cashoutVal.textContent = '0';
        return;
    }

    const currentMult = MINES_MULTIPLIERS[minesOpened.length];
    cashoutVal.textContent = Math.floor(minesCurrentBet * currentMult);
}

document.getElementById('minesBetInput')?.addEventListener('input', updateMinesSummary);

window.startMinesRound = function() {
    if (minesGameActive) return;

    const betInput = document.getElementById('minesBetInput');
    constmessage = document.getElementById('minesMessage');
    const startBtn = document.getElementById('minesStartBtn');
    const cashoutBtn = document.getElementById('minesCashoutBtn');

    const bet = parseInt(betInput.value) || 0;
    const myData = players[myPlayerId] || { balance: 0 };
    const balance = myData.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств на балансе!');
        return;
    }

    // Блокируем баланс
    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return (current || 0) - bet;
    }, (error, committed) => {
        if (committed) {
            minesCurrentBet = bet;
            minesGameActive = true;
            minesOpened = [];
            
            // Генерируем ровно 3 мины случайным образом
            minesMap = Array(25).fill(false);
            let placed = 0;
            while (placed < 3) {
                const idx = Math.floor(Math.random() * 25);
                if (!minesMap[idx]) {
                    minesMap[idx] = true;
                    placed++;
                }
            }

            // Настройка UI
            startBtn.disabled = true;
            betInput.disabled = true;
            cashoutBtn.disabled = false;
            message.textContent = 'Раунд начался! Выбирайте ячейки.';
            message.style.color = '#00E5FF';

            // Разблокировка ячеек
            for (let i = 0; i < 25; i++) {
                const cell = document.getElementById(`mine_cell_${i}`);
                cell.className = 'mine-cell';
                cell.textContent = '';
                cell.disabled = false;
            }

            document.getElementById('minesOpenedCount').textContent = '0/22';
            document.getElementById('minesCurrentMultiplier').textContent = '1.00x';
            updateMinesSummary();
        } else {
            alert('Сбой транзакции при запуске раунда.');
        }
    });
}

function clickMineCell(index) {
    if (!minesGameActive) return;
    const cell = document.getElementById(`mine_cell_${index}`);
    if (cell.disabled || minesOpened.includes(index)) return;

    cell.disabled = true;

    // Попал на мину
    if (minesMap[index]) {
        cell.classList.add('exploded');
        cell.textContent = '💣';
        endMinesGame(false);
    } else {
        // Безопасная клетка
        cell.classList.add('safe');
        cell.textContent = '💎';
        minesOpened.push(index);

        const newMultiplier = MINES_MULTIPLIERS[minesOpened.length];
        document.getElementById('minesOpenedCount').textContent = `${minesOpened.length}/22`;
        document.getElementById('minesCurrentMultiplier').textContent = `${newMultiplier.toFixed(2)}x`;
        updateMinesSummary();

        // Если угадал все 22 клетки
        if (minesOpened.length === 22) {
            endMinesGame(true);
        }
    }
}

window.cashoutMines = function() {
    if (!minesGameActive || minesOpened.length === 0) return;
    endMinesGame(true);
}

function endMinesGame(isWin) {
    minesGameActive = false;
    const startBtn = document.getElementById('minesStartBtn');
    const cashoutBtn = document.getElementById('minesCashoutBtn');
    const betInput = document.getElementById('minesBetInput');
    const message = document.getElementById('minesMessage');

    startBtn.disabled = false;
    betInput.disabled = false;
    cashoutBtn.disabled = true;

    // Вскрываем все ячейки
    for (let i = 0; i < 25; i++) {
        const cell = document.getElementById(`mine_cell_${i}`);
        cell.disabled = true;
        
        if (minesMap[i]) {
            if (!cell.classList.contains('exploded')) {
                cell.classList.add('revealed-mine');
                cell.textContent = '💣';
            }
        } else {
            if (!cell.classList.contains('safe')) {
                cell.textContent = '💎';
            }


}
    }

    if (isWin) {
        const mult = MINES_MULTIPLIERS[minesOpened.length];
        const winnings = Math.floor(minesCurrentBet * mult);

        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return (current || 0) + winnings;
        });

        message.innerHTML = `🎉 Победа! Вы забрали <span class="win-color">${winnings} ₽</span> (${mult.toFixed(2)}x)`;
    } else {
        message.innerHTML = `💥 Бабах! Наступили на мину. Ставка <span style="color:#ff1744">${minesCurrentBet} ₽</span> сгорела.`;
    }
}

// ======= МАТЕМАТИЧЕСКИЙ ДВИЖОК ДИАГОНАЛЕЙ («ИГРА В КАЛЬМАРА») =======

function getPlayersWithSegments() {
    const active = Object.keys(players)
        .filter(id => players[id].totalBet > 0)
        .map(id => ({ id, ...players[id] }))
        .sort((a, b) => a.id.localeCompare(b.id)); 

    const totalB = active.reduce((sum, p) => sum + p.totalBet, 0);
    if (active.length === 0 || totalB === 0) return [];

    const L = 400 * Math.SQRT2; 
    const minW = Math.min(30, L / (active.length + 1)); 
    const totalMin = active.length * minW;
    const remainingL = L - totalMin;

    let currentX = -L / 2;
    return active.map(p => {
        const width = minW + remainingL * (p.totalBet / totalB);
        const startX = currentX;
        const endX = currentX + width;
        currentX = endX;
        return { ...p, startX, endX, width };
    });
}

// ======= НЕВОЗМОЖНОЕ КОЛЕСО =======

window.selectSpPercent = function(pct) {
    if (spIsSpinning) return;
    
    spSelectedPercent = pct;
    const buttons = document.querySelectorAll('.sp-pct-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(pct + '%')) {
            btn.classList.add('active');
        }
    });

    const deg = (pct / 100) * 360;
    const wheel = document.getElementById('spWheel');
    if (wheel) {
        wheel.style.background = `conic-gradient(#00E676 0deg ${deg}deg, #ff1744 ${deg}deg 360deg)`;
    }

    const label = document.getElementById('spWheelText');
    if (label) {
        const halfAngle = deg / 2;
        label.style.transform = `translate(-50%, -50%) rotate(${halfAngle}deg) translateY(-50px) rotate(-${halfAngle}deg)`;
    }

    updateSpSummary();
};

function updateSpSummary() {
    const betInput = document.getElementById('spBetInput');
    const summaryChance = document.getElementById('summaryChance');
    const summaryWin = document.getElementById('summaryWin');

    if (!betInput || !summaryChance || !summaryWin) return;

    const bet = parseInt(betInput.value) || 0;
    const rule = SP_RULES[spSelectedPercent];
    
    summaryChance.textContent = spSelectedPercent + '%';
    
    if (rule) {
        const possiblePayout = Math.floor(bet * rule.mult);
        summaryWin.textContent = possiblePayout + ' ₽';
    }
}

document.getElementById('spBetInput')?.addEventListener('input', updateSpSummary);

window.spinSingleplayerWheel = function() {
    if (spIsSpinning) return;

    const betInput = document.getElementById('spBetInput');
    const message = document.getElementById('spMessage');
    const spinBtn = document.getElementById('spSpinBtn');
    
    const bet = parseInt(betInput.value) || 0;
    const myData = players[myPlayerId] || { balance: 0 };
    const balance = myData.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств на балансе!');
        return;
    }

    spIsSpinning = true;
    spinBtn.disabled = true;
    betInput.disabled = true;
    message.textContent = 'Колесо вращается...';
    message.style.color = '#00E5FF';

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return (current || 0) - bet;
    }, (error, committed) => {
        if (committed) {
            const randomAngle = Math.random() * 360;
            spTotalRotation += 1800 + randomAngle; 
            
            const wheel = document.getElementById('spWheel');
            wheel.style.transform = `rotate(${spTotalRotation}deg)`;

            setTimeout(() => {
                evaluateSpResult(randomAngle, bet);
            }, 4000);
        } else {
            spIsSpinning = false;
            spinBtn.disabled = false;
            betInput.disabled = false;
            message.textContent = 'Ошибка транзакции. Повторите запуск.';
        }
    });
};

function evaluateSpResult(stoppedAngle, bet) {
    const message = document.getElementById('spMessage');
    const spinBtn = document.getElementById('spSpinBtn');
    const betInput = document.getElementById('spBetInput');

    const netRotation = spTotalRotation % 360;
    const winningAngleOnWheel = (360 - netRotation) % 360;

    const playerBoundary = (spSelectedPercent / 100) * 360;
    const isPlayerWinner = winningAngleOnWheel <= playerBoundary;

    if (isPlayerWinner) {
        const rule = SP_RULES[spSelectedPercent];
        const prize = Math.floor(bet * rule.mult);

        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return (current || 0) + prize;
        });

        message.innerHTML = `🎉 ВЫ ПОБЕДИЛИ! Получено: <span style="color:#00E676">+${prize} ₽</span>`;
    } else {
        message.innerHTML = `🔴 ВЫ ПРОИГРАЛИ! <span style="color:#ff1744">-${bet} ₽</span>`;
    }

    spIsSpinning = false;
    spinBtn.disabled = false;
    betInput.disabled = false;
}

// ======= СЕТЕВАЯ ЧАСТЬ МУЛЬТИПЛЕЕРА =======

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

    const myData = players[myPlayerId] || { balance: 0 };
    const myCurrentBalance = myData.balance || 0;

    if (amount > myCurrentBalance) {
        alert(`Недостаточно средств! Баланс: ${myCurrentBalance} ₽.`);
        return;
    }

    localStorage.setItem('roulette_player_name', name);

    const newBalance = myCurrentBalance - amount;
    const currentBet = myData.totalBet || 0;
    const playerColor = DISTINCT_COLORS[Object.keys(players).length % DISTINCT_COLORS.length];

    db.ref(`players/${myPlayerId}`).update({
        name: name,
        color: myData.color || playerColor,
        totalBet: currentBet + amount,
        balance: newBalance
    });

    if (betAmountInput) betAmountInput.value = '';
}

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

function checkHostTimerLogic() {
    if (!isHost()) return;

    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    const status = gameState.status || 'betting';
    const now = getServerTime();

    if (status === 'betting' && gameState.timerEnd > 0 && now >= gameState.timerEnd) {
        triggerRoundStart();
        return;
    }

    if (status === 'betting' && activePlayers.length >= 2 && (!gameState.timerEnd || gameState.timerEnd === 0)) {
        db.ref('gameState').update({
            timerEnd: now + (BETTING_TIME * 1000)
        });
    }

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
            const borderSize = 6;
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

function determineAndPublishWinner() {
    const segments = getPlayersWithSegments();
    let winner = null;
    const totalBank = calculateTotalBank();

    const finalXCanvas = (ballX + ballY - 400) * Math.SQRT1_2;

    if (segments.length > 0) {
        winner = segments.find(p => finalXCanvas >= p.startX && finalXCanvas <= p.endX);
        if (!winner) winner = segments[segments.length - 1]; 
    }

    if (winner) {
        const defaultPrize = totalBank * 0.85; 
        let finalPrize = defaultPrize;

        if (defaultPrize < winner.totalBet) {
            const otherBets = totalBank - winner.totalBet; 
            finalPrize = winner.totalBet + (otherBets * 0.85); 
        }

        finalPrize = Math.floor(finalPrize); 

        db.ref(`players/${winner.id}/balance`).transaction((current) => {
            return (current || 0) + finalPrize;
        });

        // Расчет шанса победы в %
        const chancePct = ((winner.totalBet / totalBank) * 100).toFixed(0);

        // Публикуем победу в историю
        const historyRef = db.ref('history');
        historyRef.push({
            playerName: winner.name,
            winnerPrize: finalPrize,
            winnerChance: chancePct,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        db.ref('gameState').set({
            status: 'finished',
            winnerName: winner.name,
            winnerColor: winner.color,
            winnerPrize: finalPrize
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
                balance: players[id].balance || 0
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

// ======= CANVASES ДЛЯ ДИАГОНАЛЕЙ =======

function renderWheelSections() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 400, 400);

    const segments = getPlayersWithSegments();

    if (segments.length === 0) {
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, 400, 400);
        
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 2;
        for (let i = 0; i <= 400; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, 400);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i); ctx.lineTo(400, i);
            ctx.stroke();
        }
        return;
    }

    const L = 400 * Math.SQRT2; 

    ctx.save();
    ctx.translate(200, 200);
    ctx.rotate(Math.PI / 4); 

    segments.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.startX, -L, p.width, L * 2);

        if (p.id === myPlayerId) {
            ctx.save();
            ctx.translate(p.startX + p.width / 2, 0);
            ctx.rotate(-Math.PI / 4); 
            
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 24px Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 8;
            ctx.fillText('Вы', 0, 0);
            ctx.restore();
        }
    });
    ctx.restore();
}

// ======= ДЕПОЗИТЫ И АДМИНКА =======

window.openDepositModal = function() {
    document.getElementById('depositModal').style.display = 'block';
    document.getElementById('depositStep1').style.display = 'block';
    document.getElementById('depositStep2').style.display = 'none';
    document.getElementById('depositStep3').style.display = 'none';
}

window.closeDepositModal = function() {
    document.getElementById('depositModal').style.display = 'none';
}

window.goToDepositStep2 = function() {
    const amount = parseInt(document.getElementById('depositAmountInput').value);
    if (isNaN(amount) || amount < 10) {
        alert('Минимальная сумма пополнения — 10 ₽!');
        return;
    }
    document.getElementById('reqAmount').textContent = amount;
    document.getElementById('depositStep1').style.display = 'none';
    document.getElementById('depositStep2').style.display = 'block';
}

window.sendDepositRequest = function() {
    const amount = parseInt(document.getElementById('depositAmountInput').value);
    const name = (playerNameInput ? playerNameInput.value.trim() : "Без имени") || "Без имени";

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

function initAdminPanel() {
    db.ref('deposit_requests').on('value', (snap) => {
        const requests = snap.val() || {};
        const adminList = document.getElementById('adminRequestsList');
        if (!adminList) return;
        adminList.innerHTML = '';

        const pending = Object.values(requests).filter(r => r.status === 'pending');

        if (pending.length === 0) {
            adminList.innerHTML = '<p class="no-reqs">Нет активных заявок</p>';
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

window.approveDeposit = function(reqId, playerId, amount) {
    db.ref(`players/${playerId}/balance`).transaction((current) => {
        return (current || 0) + amount;
    });
    db.ref(`deposit_requests/${reqId}`).remove();
}

window.declineDeposit = function(reqId) {
    db.ref(`deposit_requests/${reqId}`).remove();
}

function calculateTotalBank() {
    return Object.values(players).reduce((acc, p) => acc + (p.totalBet || 0), 0);
}

function renderBets() {
    if (!betList) return;
    const active = Object.values(players).filter(p => p.totalBet > 0).sort((a, b) => b.totalBet - a.totalBet);
    const totalB = calculateTotalBank();

    betList.innerHTML = '';
    if (active.length === 0) {
        betList.innerHTML = '<div class="bet-placeholder">Пока нет ставок...</div>';
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