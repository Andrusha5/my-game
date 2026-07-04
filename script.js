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

// Переменные мультиплеера (Игра в кальмара)
const BETTING_TIME = 15;
const BALL_MAX_SPEED = 120; 
const BALL_DECELERATION = 0.985;
const MIN_BET = 10;
const VIRTUAL_WIDTH = 400;
const VIRTUAL_HEIGHT = 400;
const VIRTUAL_RADIUS = 10;

let timerInterval = null;
let animationFrameId = null;
let currentPath = [];
let animStartTime = 0;
let ballX = 200, ballY = 200;
let ballStartX = 200, ballStartY = 200;

// Анимация вращения стрелки в Кальмаре
let arrowSpinning = false;
let arrowHold = false;
let arrowAngle = 0;
let arrowSpinDuration = 2000; 

const DISTINCT_COLORS = [
    '#E91E63', '#9C27B0', '#3F51B5', '#00BCD4',  
    '#4CAF50', '#FFEB3B', '#FF9800', '#FF5722',  
    '#E040FB', '#00E676', '#FF1744', '#00E5FF'
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
let coinChoice = 'heads'; 
let coinIsSpinning = false;
let coinRotationY = 0; 

// Переменные «Везде мины»
let minesGameActive = false;
let minesMap = []; 
let minesOpened = []; 
let minesCurrentBet = 0;

const MINES_MULTIPLIERS = [
    1.00, 1.12, 1.27, 1.45, 1.67, 1.93, 2.25, 2.64, 3.13, 3.75, 
    4.55, 5.58, 6.98, 8.90, 11.62, 15.60, 21.65, 31.20, 47.05, 
    76.00, 134.00, 275.00, 750.00
];

// Переменные «Невозможная башня» (Башня)
let impGameActive = false;
let impCurrentRow = 0; 
let impBet = 0;
let impBoard = []; 

const impMinesData = [
    { cells: 5, mines: 1, mult: 1.2 },  
    { cells: 5, mines: 1, mult: 1.6 },  
    { cells: 5, mines: 2, mult: 2.5 },  
    { cells: 4, mines: 1, mult: 4.5 },  
    { cells: 3, mines: 1, mult: 8.0 },  
    { cells: 2, mines: 1, mult: 15.0 }  
];

// ======= ПЕРЕМЕННЫЕ ИГРЫ "ВЗЛЕТ РАКЕТЫ V3" (ДВОЙНЫЕ СТАВКИ) =======
let rocketState = { status: 'betting', timerEnd: 0 };
let rocketLoopId = null;
let rocketTimerInterval = null; 

let rocketBet1Active = false;
let rocketBet2Active = false;
let rocketBet1Amount = 0;
let rocketBet2Amount = 0;
let rocketBet1Cashed = false;
let rocketBet2Cashed = false;

let rocketAuto1Enabled = true;
let rocketAuto1Multiplier = 1.1;
let rocketAuto2Enabled = true;
let rocketAuto2Multiplier = 1.1;

// ======= ПЕРЕМЕННЫЕ НОВОЙ ИГРЫ "ГОНКА ДРОНОВ" =======
let dronesState = { status: 'betting', timerEnd: 0 };
let dronesTimerInterval = null;
let dronesLoopId = null;
let dronesSelectedColor = 'red';
let dronesMyBet = 0;
let dronesBetPlaced = false;

const DRONE_COLORS = {
    red: '#FF1744',
    blue: '#2979FF',
    green: '#00E676',
    yellow: '#FFEA00'
};

// DOM элементы
let bettingTimerDisplay, totalBankDisplay, gameCanvas, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, historyList, gameMessage;

function getServerTime() {
    return Date.now() + serverOffset;
}

function isHost() {
    if (onlinePlayers.length === 0) return false;
    return onlinePlayers[0] === myPlayerId;
}

// УНИКАЛЬНОЕ КАСТOМНОЕ УВЕДОМЛЕНИЕ О ПОБЕДЕ (5 секунд)
window.showVictoryNotification = function(winnerName, prize, color) {
    const oldNotify = document.getElementById('victoryOverlayNotification');
    if (oldNotify) oldNotify.remove();

    const notify = document.createElement('div');
    notify.id = 'victoryOverlayNotification';
    
    Object.assign(notify.style, {
        position: 'fixed',
        top: '25px',
        left: '50%',
        transform: 'translateX(-50%) translateY(-50px)',
        background: 'rgba(15, 8, 28, 0.98)',
        border: `3px solid ${color}`,
        boxShadow: `0 0 30px ${color}88`,
        borderRadius: '16px',
        padding: '20px 25px',
        color: 'white',
        zIndex: '999999',
        minWidth: '320px',
        maxWidth: '90%',
        textAlign: 'center',
        opacity: '0',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        pointerEvents: 'auto'
    });

    notify.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:0.85rem; text-transform:uppercase; letter-spacing:1.5px; color:${color}; font-weight:900;">🏆 ПОБЕДИТЕЛЬ 🏆</span>
            <button id="closeVictoryNotifyBtn" style="background:none; border:none; color:#ff1744; font-size:1.6rem; cursor:pointer; line-height:1; padding:0; margin:0;">&times;</button>
        </div>
        <div style="font-size:1.25rem; font-weight:bold; margin-bottom:6px; color:#ffffff;">
            🎉 <span style="color:${color}">${winnerName}</span> 🎉
        </div>
        <div style="font-size:1.05rem; color:#00FF88; font-weight:bold;">
            Выигрыш: +${prize} ₽
        </div>
        <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); margin-top:12px; border-radius:2px; overflow:hidden;">
            <div id="victoryTimerProgress" style="width:100%; height:100%; background:${color}; transition: width 5s linear;"></div>
        </div>
    `;

    document.body.appendChild(notify);

    setTimeout(() => {
        notify.style.opacity = '1';
        notify.style.transform = 'translateX(-50%) translateY(0)';
        const progress = document.getElementById('victoryTimerProgress');
        if (progress) progress.style.width = '0%';
    }, 50);

    const closeBtn = notify.querySelector('#closeVictoryNotifyBtn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            notify.style.opacity = '0';
            notify.style.transform = 'translateX(-50%) translateY(-50px)';
            setTimeout(() => notify.remove(), 400);
        };
    }

    setTimeout(() => {
        if (notify.parentElement) {
            notify.style.opacity = '0';
            notify.style.transform = 'translateX(-50%) translateY(-50px)';
            setTimeout(() => notify.remove(), 400);
        }
    }, 5000);
};

// Стандартные кастомные тосты
window.showToast = function(title, text, isSuccess = true) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    if (!isSuccess) {
        toast.style.borderColor = '#FF1744';
        toast.style.boxShadow = '0 0 15px rgba(255, 23, 68, 0.3)';
    }

    toast.innerHTML = `
        <div class="toast-header">
            <span class="toast-title" style="color: ${isSuccess ? '#00FF88' : '#FF1744'}">💥 ${title}</span>
            <button class="toast-close-btn" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
        <div class="toast-body">${text}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast) {
            toast.classList.add('hide');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }
    }, 3000);
};

window.showScreen = function(screenId) {
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('multiplayerGameScreen').style.display = 'none';
    document.getElementById('singleplayerGameScreen').style.display = 'none';
    document.getElementById('coinGameScreen').style.display = 'none';
    document.getElementById('minesGameScreen').style.display = 'none';
    document.getElementById('impMinesGameScreen').style.display = 'none';
    document.getElementById('rocketGameScreen').style.display = 'none';
    document.getElementById('dronesGameScreen').style.display = 'none';
    document.getElementById('withdrawGameScreen').style.display = 'none';
    
    document.getElementById(screenId).style.display = 'flex';

    if (screenId === 'dronesGameScreen') {
        renderDronesTrack();
    }
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    bettingTimerDisplay = document.getElementById('bettingTimer');
    totalBankDisplay = document.getElementById('totalBank');
    gameCanvas = document.getElementById('gameCanvas');
    gameAreaWrapper= document.getElementById('gameAreaWrapper');
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
                const rawBalance = me.balance || 0;
                document.getElementById('myBalance').textContent = parseFloat(rawBalance.toFixed(3));
            }
            updateSpSummary();
            updateMinesSummary();
        }
        try {
            renderBets();
            renderWheelSections();
        } catch (e) {
            console.error("Ошибка при рендеринге ставок или игрового поля:", e);
        }
        checkHostTimerLogic();
    });

    db.ref('gameState').on('value', (snapshot) => {
        const oldState = gameState;
        gameState = snapshot.val() || { status: 'betting' };

        if (gameState.status === 'finished' && oldState.status !== 'finished' && gameState.winnerName) {
            if (gameState.winnerName !== 'Никто') {
                showVictoryNotification(gameState.winnerName, gameState.winnerPrize, gameState.winnerColor || '#00FF88');
            } else {
                showToast("ИГРА В КАЛЬМАРА", "Раунд завершен! Победителей нет 🔴", false);
            }
        }
        syncGameWithDatabase();
    });

    db.ref('history').limitToLast(10).on('value', (snapshot) => {
        renderHistory(snapshot.val() || {});
    });

    // ======= СЛУШАТЕЛИ РАКЕТЫ =======
    db.ref('rocketStateV3').on('value', (snapshot) => {
        rocketState = snapshot.val() || { status: 'betting', timerEnd: 0 };
        syncRocketState();
    });

    db.ref('rocketBetsV3').on('value', (snapshot) => {
        const bets = snapshot.val() || {};
        renderRocketBets(bets);

        const myBetRecord = bets[myPlayerId];
        if (myBetRecord) {
            // Подгружаем обе ставки
            if (myBetRecord.bet1) {
                rocketBet1Active = true;
                rocketBet1Amount = myBetRecord.bet1.betAmount;
                rocketBet1Cashed = (myBetRecord.bet1.status === 'cashed');
            } else {
                rocketBet1Active = false;
                rocketBet1Amount = 0;
                rocketBet1Cashed = false;
            }

            if (myBetRecord.bet2) {
                rocketBet2Active = true;
                rocketBet2Amount = myBetRecord.bet2.betAmount;
                rocketBet2Cashed = (myBetRecord.bet2.status === 'cashed');
            } else {
                rocketBet2Active = false;
                rocketBet2Amount = 0;
                rocketBet2Cashed = false;
            }
        } else {
            rocketBet1Active = false;
            rocketBet2Active = false;
            rocketBet1Amount = 0;
            rocketBet2Amount = 0;
            rocketBet1Cashed = false;
            rocketBet2Cashed = false;
        }
        updateRocketUIElements();
    });

    db.ref('rocketHistoryV3').on('value', (snapshot) => {
        renderRocketHistory(snapshot.val() || []);
    });

    // ======= СЛУШАТЕЛИ ГОНКИ ДРОНОВ =======
    db.ref('dronesState').on('value', (snap) => {
        dronesState = snap.val() || { status: 'betting' };
        syncDronesState();
    });

    db.ref('dronesBets').on('value', (snap) => {
        const bets = snap.val() || {};
        const myBetRecord = bets[myPlayerId];
        if (myBetRecord) {
            dronesBetPlaced = true;
            dronesMyBet = myBetRecord.amount;
            dronesSelectedColor = myBetRecord.color;
        } else {
            dronesBetPlaced = false;
            dronesMyBet = 0;
        }
        renderDronesBetsList(bets);
    });

    db.ref('dronesHistory').on('value', (snap) => {
        renderDronesHistoryBar(snap.val() || []);
    });

    selectSpPercent(50);
    renderMinesGrid();
    initImpMinesUI();

    const impBetInput = document.getElementById('impBetInput');
    if (impBetInput) {
        impBetInput.addEventListener('input', updateImpMinesLabels);
    }
    
    // Инициализируем автовыводы Ракеты
    toggleRocketAuto(1);
    toggleRocketAuto(2);
});

// Вкладки мультиплеера
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

function renderHistory(historyData) {
    if (!historyList) return;
    historyList.innerHTML = '';
    const list = Object.values(historyData).reverse();
    if (list.length === 0) {
        historyList.innerHTML = '<div class="bet-placeholder">История пуста...</div>';
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
    const coinEl = document.getElementById('coin3d');
    const coinMsg = document.getElementById('coinMessage');
    
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
    coinMsg.textContent = 'Монетка летит...';
    coinMsg.style.color = '#FFC400';

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            const minSpins = 1800; 
            const currentFacing = (coinRotationY % 360) === 0 ? 'heads' : 'tails';
            let additionalRotation = 0;
            
            if (currentFacing === result) {
                additionalRotation = 360; 
            } else {
                additionalRotation = 180; 
            }
            
            coinRotationY += minSpins + additionalRotation;
            coinEl.style.transform = `rotateY(${coinRotationY}deg)`;

            setTimeout(() => {
                const won = coinChoice === result;
                if (won) {
                    const prize = Math.floor(bet * 1.5);
                    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
                        return parseFloat(((current || 0) + prize).toFixed(3));
                    });
                    coinMsg.innerHTML = `🎉 Вы выиграли! Выпало: <strong>${result === 'heads' ? 'Орел' : 'Решка'}</strong>. <span class="win-color">+${prize} ₽</span>`;
                } else {
                    coinMsg.innerHTML = `🔴 Не угадали! Выпало: <strong>${result === 'heads' ? 'Орел' : 'Решка'}</strong>. <span style="color:#ff1744">-${bet} ₽</span>`;
                }
                
                coinIsSpinning = false;
                betInput.disabled = false;
            }, 3000);
        } else {
            coinIsSpinning = false;
            betInput.disabled = false;
            coinMsg.textContent = 'Ошибка транзакции.';
        }
    });
}

// ======= ИГРА 2: ВЕЗДЕ МИНЫ =======

function renderMinesGrid() {
    const grid = document.getElementById('minesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('button');
        cell.className = 'mine-cell';
        cell.id = `mine_cell_${i}`;
        cell.disabled = true;
        cell.onclick = () => clickMineCell(i);
        grid.appendChild(cell);
    }
}

function updateMinesSummary() {
    const betInput = document.getElementById('minesBetInput');
    const cashoutVal = document.getElementById('minesCashoutValue');
    const cashoutBtn = document.getElementById('minesCashoutBtn');
    if (!betInput || !cashoutVal || !cashoutBtn) return;

    if (!minesGameActive) {
        cashoutVal.textContent ='0';
        cashoutBtn.textContent = 'Забрать 0 ₽';
        return;
    }

    const currentMult = MINES_MULTIPLIERS[minesOpened.length];
    const currentWin = Math.floor(minesCurrentBet * currentMult);
    
    cashoutVal.textContent = currentWin;
    cashoutBtn.textContent = `Забрать ${currentWin} ₽`;
}

document.getElementById('minesBetInput')?.addEventListener('input', updateMinesSummary);

window.startMinesRound = function() {
    if (minesGameActive) return;

    const betInput = document.getElementById('minesBetInput');
    const startBtn = document.getElementById('minesStartBtn');
    const cashoutBtn = document.getElementById('minesCashoutBtn');
    const minesMsg = document.getElementById('minesMessage');

    const bet = parseInt(betInput.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств!');
        return;
    }

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            minesCurrentBet = bet;
            minesGameActive = true;
            minesOpened = [];
            
            minesMap = Array(25).fill(false);
            let placed = 0;
            while (placed < 3) {
                const idx = Math.floor(Math.random() * 25);
                if (!minesMap[idx]) {
                    minesMap[idx] = true;
                    placed++;
                }
            }

            startBtn.disabled = true;
            betInput.disabled = true;
            cashoutBtn.disabled = false;
            minesMsg.textContent = 'Раунд начался! Ищите алмазы!';
            minesMsg.style.color = '#00E5FF';

            for (let i = 0; i < 25; i++) {
                const cell = document.getElementById(`mine_cell_${i}`);
                cell.className = 'mine-cell';
                cell.textContent = '';
                cell.disabled = false;
            }

            document.getElementById('minesOpenedCount').textContent = '0/22';
            document.getElementById('minesCurrentMultiplier').textContent = '1.00x';
            updateMinesSummary();
        }
    });
}

function clickMineCell(index) {
    if (!minesGameActive) return;
    const cell = document.getElementById(`mine_cell_${index}`);
    if (cell.disabled || minesOpened.includes(index)) return;

    cell.disabled = true;

    if (minesMap[index]) {
        cell.classList.add('exploded');
        cell.textContent = '💣';
        endMinesGame(false);
    } else {
        cell.classList.add('safe');
        cell.textContent = '💎';
        minesOpened.push(index);

        const newMultiplier = MINES_MULTIPLIERS[minesOpened.length];
        document.getElementById('minesOpenedCount').textContent = `${minesOpened.length}/22`;
        document.getElementById('minesCurrentMultiplier').textContent = `${newMultiplier.toFixed(2)}x`;
        updateMinesSummary();

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
    const minesMsg = document.getElementById('minesMessage');

    startBtn.disabled = false;
    betInput.disabled = false;
    cashoutBtn.disabled = true;

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
            return parseFloat(((current || 0) + winnings).toFixed(3));
        });

        minesMsg.innerHTML = `🎉 Забрали <span class="win-color">${winnings} ₽</span> (${mult.toFixed(2)}x)`;
    } else {
        minesMsg.innerHTML = `💥 Бабах! Вы проиграли <span style="color:#ff1744">${minesCurrentBet} ₽</span>`;
    }
}

// ======= ИГРА 3: НЕВОЗМОЖНАЯ БАШНЯ =======

function initImpMinesUI() {
    const container = document.getElementById('impMinesRowsContainer');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 5; i >= 0; i--) {
        const rowData = impMinesData[i];
        const rowDiv = document.createElement('div');
        rowDiv.className = 'imp-row locked';
        rowDiv.id = `imp_row_${i}`;

        const multLabel = document.createElement('div');
        multLabel.className = 'row-multiplier';
        multLabel.id = `imp_label_${i}`; 
        rowDiv.appendChild(multLabel);

        for (let j = 0; j < rowData.cells; j++) {
            const btn = document.createElement('button');
            btn.className = 'imp-cell';
            btn.id = `imp_cell_${i}_${j}`;
            btn.onclick = () => clickImpCell(i, j);
            rowDiv.appendChild(btn);
        }
        container.appendChild(rowDiv);
    }
    updateImpMinesLabels();
}

function updateImpMinesLabels() {
    const betInput = document.getElementById('impBetInput');
    if (!betInput) return;
    const bet = parseInt(betInput.value) || 0;

    for (let i = 0; i < 6; i++) {
        const label = document.getElementById(`imp_label_${i}`);
        if (label) {
            const rowData = impMinesData[i];
            const possibleWin = Math.floor(bet * rowData.mult);
            label.innerHTML = `
                <span style="color:#00E676;">x${rowData.mult} <span style="color:#ff1744;">💣${rowData.mines}</span></span>
                <span style="color:#FFC400; font-size:0.75rem;">+${possibleWin} ₽</span>
            `;
        }
    }
}

window.startImpMines = function() {
    if (impGameActive) return;

    const betInput = document.getElementById('impBetInput');
    const startBtn = document.getElementById('impStartBtn');
    const cashoutBtn = document.getElementById('impCashoutBtn');
    const impMsg = document.getElementById('impMessage');

    const bet = parseInt(betInput.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно баланса!');
        return;
    }

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            impBet = bet;
            impGameActive = true;
            impCurrentRow = 0;
            impBoard = [];

            for (let i = 0; i < 6; i++) {
                const rowConf = impMinesData[i];
                let rowMines = new Array(rowConf.cells).fill(false);
                let placed = 0;
                while (placed < rowConf.mines) {
                    let r = Math.floor(Math.random() * rowConf.cells);
                    if (!rowMines[r]) {
                        rowMines[r] = true;
                        placed++;
                    }
                }
                impBoard.push(rowMines);
            }

            startBtn.disabled = true;
            betInput.disabled = true;
            cashoutBtn.disabled = true; 
            cashoutBtn.textContent = 'Забрать 0 ₽';
            impMsg.textContent = 'Начните с первого ряда (самый нижний)!';
            impMsg.style.color = '#00E5FF';

            for (let i = 0; i < 6; i++) {
                const rDiv = document.getElementById(`imp_row_${i}`);
                rDiv.className = (i === 0) ? 'imp-row active' : 'imp-row locked';
                
                Array.from(rDiv.getElementsByClassName('imp-cell')).forEach(c => {
                    c.className = 'imp-cell'; 
                    c.textContent = '';
                });
            }
        }
    });
}

function clickImpCell(rowIdx, cellIdx) {
    if (!impGameActive || rowIdx !== impCurrentRow) return;

    const cellBtn = document.getElementById(`imp_cell_${rowIdx}_${cellIdx}`);
    const isMine = impBoard[rowIdx][cellIdx];
    const impMsg = document.getElementById('impMessage');
    const cashoutBtn = document.getElementById('impCashoutBtn');

    if (isMine) {
        cellBtn.classList.add('lose');
        cellBtn.textContent = '💣';
        endImpGame(false);
    } else {
        cellBtn.classList.add('win');
        cellBtn.textContent = '💎';
        
        const currentMult = impMinesData[rowIdx].mult;
        const currentWin = Math.floor(impBet * currentMult);
        
        cashoutBtn.disabled = false;
        cashoutBtn.textContent = `Забрать ${currentWin} ₽`;

        if (rowIdx < 5) {
            document.getElementById(`imp_row_${rowIdx}`).className = 'imp-row passed';
            impCurrentRow++;
            document.getElementById(`imp_row_${impCurrentRow}`).className = 'imp-row active';
            impMsg.textContent = `Ряд ${rowIdx + 1} пройден! Поднимайтесь выше.`;
            impMsg.style.color = '#00E676';
        } else {
            endImpGame(true);
        }
    }
}

window.cashoutImpMines = function() {
    if (!impGameActive) return;
    endImpGame(true);
}

function endImpGame(isWin) {
    impGameActive = false;
    const startBtn = document.getElementById('impStartBtn');
    const cashoutBtn = document.getElementById('impCashoutBtn');
    const betInput = document.getElementById('impBetInput');
    const impMsg = document.getElementById('impMessage');

    startBtn.disabled = false;
    betInput.disabled = false;
    cashoutBtn.disabled = true;

    let finalMult = 0;
    if (isWin) {
        const row5Cells = document.getElementById('imp_row_5') ? Array.from(document.getElementById('imp_row_5').getElementsByClassName('imp-cell')) : [];
        const finishedLastRow = row5Cells.some(c => c.classList.contains('win'));

        if (finishedLastRow) {
            finalMult = impMinesData[5].mult; 
        } else if (impCurrentRow > 0) {
            finalMult = impMinesData[impCurrentRow - 1].mult;
        }
    }

    const winnings = Math.floor(impBet * finalMult);

    if (isWin && winnings > 0) {
        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return parseFloat(((current || 0) + winnings).toFixed(3));
        });
        impMsg.innerHTML = `🎉 ПОБЕДА! Вы забрали <span class="win-color">${winnings} ₽</span>`;
    } else if (!isWin) {
        impMsg.innerHTML = `💥 ВЗРЫВ! Ваша ставка <span style="color:#ff1744">${impBet} ₽</span> сгорела.`;
    }

    for (let i = 0; i < 6; i++) {
        document.getElementById(`imp_row_${i}`).classList.remove('locked', 'active');
        impBoard[i].forEach((isMine, cellIdx) => {
            const cell = document.getElementById(`imp_cell_${i}_${cellIdx}`);
            if (isMine) {
                if (!cell.classList.contains('lose')) {
                    cell.textContent = '💣';
                }
            } else {
                if (!cell.classList.contains('win')) {
                    cell.textContent = '💎';
                }
            }
        });
    }
}

// ======= ИГРА 4: НЕВОЗМОЖНОЕ КОЛЕСО =======

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
    const spinBtn = document.getElementById('spSpinBtn');
    const spMsg = document.getElementById('spMessage');
    
    const bet = parseInt(betInput.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно баланса!');
        return;
    }

    spIsSpinning = true;
    spinBtn.disabled = true;
    betInput.disabled = true;
    spMsg.textContent = 'Колесо раскручивается...';
    spMsg.style.color = '#00E5FF';

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
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
            spMsg.textContent = 'Ошибка.';
        }
    });
};

function evaluateSpResult(stoppedAngle, bet) {
    const spinBtn = document.getElementById('spSpinBtn');
    const betInput = document.getElementById('spBetInput');
    const spMsg = document.getElementById('spMessage');

    const netRotation = spTotalRotation % 360;
    const winningAngleOnWheel = (360 - netRotation) % 360;

    const playerBoundary = (spSelectedPercent / 100) * 360;
    const isPlayerWinner = winningAngleOnWheel <= playerBoundary;

    if (isPlayerWinner) {
        const rule = SP_RULES[spSelectedPercent];
        const prize = Math.floor(bet * rule.mult);

        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return parseFloat(((current || 0) + prize).toFixed(3));
        });

        spMsg.innerHTML = `🎉 ВЫ ПОБЕДИЛИ! Получено: <span style="color:#00E676">+${prize} ₽</span>`;
    } else {
        spMsg.innerHTML = `🔴 ВЫ ПРОИГРАЛИ! <span style="color:#ff1744">-${bet} ₽</span>`;
    }

    spIsSpinning = false;
    spinBtn.disabled = false;
    betInput.disabled = false;
}

// ======= ИГРА 5: МУЛЬТИПЛЕЕР (КАЛЬМАР) [СЛУЧАЙНЫЙ СПАВН + ЗАДЕРЖКА СТРЕЛКИ] =======

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

    const newBalance = parseFloat((myCurrentBalance - amount).toFixed(3));
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
        arrowSpinning = false;
        arrowHold = false;

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
        renderWheelSections();
    } 
    else if (status === 'running') {
        stopLocalTimer();
        if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
        if (gameMessage) {
            gameMessage.textContent = 'Определение траектории...';
            gameMessage.style.color = '#FFEB3B';
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
        renderWheelSections();
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
    checkHostRocketLogic();
    checkHostDronesLogic();

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

function generateDeterministicPath(angle, sx, sy) {
    let x = sx;
    let y = sy;
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

// Запуск стрелки направления по часовой стрелке с задержкой на спавне
function startLocalRound(launchAngle) {
    // 1. Детерминировано рассчитываем случайную точку спавна шарика на всех клиентах
    let seedX = Math.sin(launchAngle) * 10000;
    let randX = seedX - Math.floor(seedX);
    let seedY = Math.cos(launchAngle) * 20000;
    let randY = seedY - Math.floor(seedY);

    // Допустимые границы спавна внутри Canvas [60, 340]
    ballStartX = 60 + Math.floor(randX * 280);
    ballStartY = 60 + Math.floor(randY * 280);

    if (ball) {
        ball.style.display = 'block';
        ballX = ballStartX; 
        ballY = ballStartY;
        updateBallDOMPosition();
    }
    currentPath = generateDeterministicPath(launchAngle, ballStartX, ballStartY);
    
    arrowSpinning = true;
    arrowHold = false;
    arrowAngle = 0;
    animStartTime = Date.now();
    
    animationFrameId = requestAnimationFrame(animateDeterministicBall);
}

function updateBallDOMPosition() {
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
}

function animateDeterministicBall() {
    try {
        const elapsed = Date.now() - animStartTime;

        // ФАЗА 1: Крутится стрелка по часовой стрелке вокруг спавна (2 секунды)
        if (arrowSpinning) {
            arrowAngle = (elapsed / arrowSpinDuration) * Math.PI * 6; 
            
            renderWheelSections();
            
            if (elapsed >= arrowSpinDuration) {
                arrowSpinning = false;
                arrowHold = true; // Переходим в фазу удержания
                animStartTime = Date.now(); 
            }
            animationFrameId = requestAnimationFrame(animateDeterministicBall);
            return;
        }

        // ФАЗА 2: Стрелка замерла и показывает направление 1 секунду
        if (arrowHold) {
            arrowAngle = gameState.launchAngle; // Строго указывает направление полета
            renderWheelSections();

            if (elapsed >= 1000) { // Ровно 1 секунда задержки
                arrowHold = false;
                animStartTime = Date.now();
                if (gameMessage) {
                    gameMessage.textContent = 'Шарик запущен!';
                    gameMessage.style.color = '#00FF88';
                }
            }
            animationFrameId = requestAnimationFrame(animateDeterministicBall);
            return;
        }

        // ФАЗА 3: Сам полет шарика
        const targetFps = 60;
        const frameIndex = Math.floor((elapsed / 1000) * targetFps);

        if (frameIndex < currentPath.length) {
            const coord = currentPath[frameIndex];
            ballX = coord.x;
            ballY = coord.y;

            updateBallDOMPosition();
            renderWheelSections(); 
            animationFrameId = requestAnimationFrame(animateDeterministicBall);
        } else {
            const finalCoord = currentPath[currentPath.length - 1];
            ballX = finalCoord.x;
            ballY = finalCoord.y;

            animationFrameId = null;
            renderWheelSections(); 

            if (isHost()) {
                determineAndPublishWinner();
            }
        }
    } catch (e) {
        console.error("Ошибка в анимации шарика:", e);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
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
            return parseFloat(((current || 0) + finalPrize).toFixed(3));
        });

        const chancePct = ((winner.totalBet / totalBank) * 100).toFixed(0);

        db.ref('history').push({
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

function getPlayerAtCoords(bx, by, segments) {
    const finalX = (bx + by - 400) * Math.SQRT1_2;
    return segments.find(p => finalX >= p.startX && finalX <= p.endX);
}

// РЕНДЕРИНГ БЕЗ ЧЕРНОГО КРУГА ПО ЦЕНТРУ
function renderWheelSections() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return; 

    try {
        ctx.clearRect(0, 0, 400, 400);

        const segments = getPlayersWithSegments();

        if (segments.length === 0) {
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, 400, 400);
            
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 2;
            for (let i = 0; i <= 400; i += 40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 400); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(400, i); ctx.stroke();
            }
            return;
        }

        const L = 400 * Math.SQRT2; 

        // 1. Отрисовка цветных полос
        ctx.save();
        ctx.translate(200, 200);
        ctx.rotate(Math.PI / 4); 

        segments.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.startX, -L, p.width, L * 2);

            // Подсветка при победе
            if (gameState.status === 'finished' && gameState.winnerName === p.name) {
                const glow = Math.sin(Date.now() * 0.015) * 0.2 + 0.4;
                ctx.fillStyle = `rgba(255, 255, 255, ${glow})`;
                ctx.fillRect(p.startX, -L, p.width, L * 2);
            }
        });
        ctx.restore();

        // 2. Отрисовка аватарок
        segments.forEach((p, idx) => {
            const u = p.startX + p.width / 2;
            const v = (idx % 2 === 0) ? 80 : -80; 
            
            const rx = 200 + (u * Math.cos(Math.PI/4) - v * Math.sin(Math.PI/4));
            const ry = 200 + (u * Math.sin(Math.PI/4) + v * Math.cos(Math.PI/4));

            ctx.beginPath();
            ctx.arc(rx, ry, 16, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#121212';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#121212';
            ctx.font = 'bold 13px Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.name[0].toUpperCase(), rx, ry);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 11px Segoe UI, sans-serif';
            ctx.fillText(p.name, rx, ry + 24);
        });

        // 3. Рисуем стрелку вокруг спавна (черный круг вырезан полностью!)
        if (arrowSpinning || arrowHold) {
            ctx.save();
            ctx.translate(ballStartX, ballStartY);
            ctx.rotate(arrowAngle);
            
            ctx.beginPath();
            ctx.moveTo(30, 0);
            ctx.lineTo(12, -10);
            ctx.lineTo(12, -4);
            ctx.lineTo(-5, -4);
            ctx.lineTo(-5, 4);
            ctx.lineTo(12, 4);
            ctx.lineTo(12, 10);
            ctx.closePath();
            
            ctx.fillStyle = '#00FF88'; 
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            ctx.restore();
        }

        // 4. Текст над летящим шариком
        if (!arrowSpinning && !arrowHold && gameState.status === 'running') {
            const activePlayer = getPlayerAtCoords(ballX, ballY, segments);
            if (activePlayer) {
                ctx.font = 'bold 11px Segoe UI, sans-serif';
                const text = activePlayer.name;
                const textMetrics = ctx.measureText(text);
                const textW = textMetrics.width;
                const tagW = textW + 12;
                const tagH = 18;
                const tx = ballX;
                const ty = ballY - VIRTUAL_RADIUS - tagH/2 - 4;

                ctx.fillStyle = 'rgba(18, 18, 18, 0.85)';
                ctx.strokeStyle = activePlayer.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.rect(tx - tagW/2, ty - tagH/2, tagW, tagH);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, tx, ty);
            }
        }
    } catch (e) {
        console.error("Ошибка при отрисовке Canvas:", e);
    }
}


// ======= ИГРА 6: ВЗЛЕТ РАКЕТЫ V3 (ДВОЙНЫЕ СТАВКИ И ДВОЙНОЙ АВТОВЫВОД) =======

function generateCrashMultiplier() {
    const rand = Math.random();
    if (rand < 0.05) return 1.00;
    else if (rand < 0.40) return parseFloat((1.01 + Math.random() * 0.38).toFixed(2));
    else if (rand < 0.85) return parseFloat((1.40 + Math.random() * 2.60).toFixed(2));
    else if (rand < 0.95) return parseFloat((4.01 + Math.random() * 10.99).toFixed(2));
    else if (rand < 0.99) return parseFloat((15.01 + Math.random() * 34.99).toFixed(2));
    else return parseFloat((50.01 + Math.random() * 282.99).toFixed(2));
}

function getRocketMult(elapsed, crashMult) {
    const t_10 = Math.log(10) / 0.07;
    if (crashMult >= 20 && elapsed > t_10) {
        return 10 * Math.exp(0.22 * (elapsed - t_10));
    }
    return Math.exp(elapsed * 0.07);
}

// Управление автовыводами
window.toggleRocketAuto = function(panelIdx) {
    const toggle = document.getElementById(`rocketAutoToggle${panelIdx}`);
    const controls = document.getElementById(`rocketAutoControls${panelIdx}`);
    if (!toggle || !controls) return;

    if (panelIdx === 1) rocketAuto1Enabled = toggle.checked;
    else rocketAuto2Enabled = toggle.checked;
    
    if (toggle.checked) {
        controls.style.opacity = '1';
        controls.style.pointerEvents = 'auto';
    } else {
        controls.style.opacity = '0.35';
        controls.style.pointerEvents = 'none';
    }
};

window.changeRocketAutoMult = function(panelIdx, amount) {
    let currentVal = (panelIdx === 1) ? rocketAuto1Multiplier : rocketAuto2Multiplier;
    let newVal = parseFloat((currentVal + amount).toFixed(1));
    
    if (newVal < 1.1) newVal = 1.1; // Блокируем спуск ниже 1.1x
    
    if (panelIdx === 1) {
        rocketAuto1Multiplier = newVal;
        document.getElementById('rocketAutoValue1').textContent = `${rocketAuto1Multiplier.toFixed(1)}x`;
        document.getElementById('rocketAutoMinus1').disabled = (rocketAuto1Multiplier <= 1.1);
    } else {
        rocketAuto2Multiplier = newVal;
        document.getElementById('rocketAutoValue2').textContent = `${rocketAuto2Multiplier.toFixed(1)}x`;
        document.getElementById('rocketAutoMinus2').disabled = (rocketAuto2Multiplier <= 1.1);
    }
};

// Обновление кнопок ставок в зависимости от состояния
function updateRocketUIElements() {
    const status = rocketState ? (rocketState.status || 'betting') : 'betting';
    const btn1 = document.getElementById('rocketBet1Btn');
    const btn2 = document.getElementById('rocketBet2Btn');

    if (status === 'betting') {
        if (btn1) {
            btn1.disabled = rocketBet1Active;
            btn1.textContent = rocketBet1Active ? 'Ставка принята' : 'Поставить ставку 1';
            btn1.className = 'rocket-pnl-btn btn-bet';
        }
        if (btn2) {
            btn2.disabled = rocketBet2Active;
            btn2.textContent = rocketBet2Active ? 'Ставка принята' : 'Поставить ставку 2';
            btn2.className = 'rocket-pnl-btn btn-bet';
        }
    } else if (status === 'flying') {
        if (btn1) {
            if (rocketBet1Active && !rocketBet1Cashed) {
                btn1.disabled = false;
                btn1.textContent = 'Забрать 1';
                btn1.className = 'rocket-pnl-btn btn-cash';
            } else {
                btn1.disabled = true;
                btn1.textContent = rocketBet1Cashed ? 'Забрано!' : 'Не участвует';
            }
        }
        if (btn2) {
            if (rocketBet2Active && !rocketBet2Cashed) {
                btn2.disabled = false;
                btn2.textContent = 'Забрать 2';
                btn2.className = 'rocket-pnl-btn btn-cash';
            } else {
                btn2.disabled = true;
                btn2.textContent = rocketBet2Cashed ? 'Забрано!' : 'Не участвует';
            }
        }
    } else {
        if (btn1) { btn1.disabled = true; btn1.textContent = 'Взрыв'; }
        if (btn2) { btn2.disabled = true; btn2.textContent = 'Взрыв'; }
    }
}

// Действие ставки
window.actionRocketBet = function(panelIdx) {
    const status = rocketState ? (rocketState.status || 'betting') : 'betting';
    
    if (status === 'betting') {
        // РЕЖИМ СТАВКИ
        const betInput = document.getElementById(`rocketBetInput${panelIdx}`);
        const amount = parseInt(betInput.value) || 0;
        const balance = players[myPlayerId]?.balance || 0;

        if (isNaN(amount) || amount < 5) {
            alert('Минимальная ставка — 5 ₽!');
            return;
        }
        if (amount > balance) {
            alert('Недостаточно средств!');
            return;
        }

        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return parseFloat(((current || 0) - amount).toFixed(3));
        }, (error, committed) => {
            if (committed) {
                const myData = players[myPlayerId] || { name: 'Игрок', color: '#BA68C8' };
                const updates = {};
                
                updates[`rocketBetsV3/${myPlayerId}/name`] = myData.name || "Игрок";
                updates[`rocketBetsV3/${myPlayerId}/color`] = myData.color || '#BA68C8';
                updates[`rocketBetsV3/${myPlayerId}/bet${panelIdx}`] = {
                    betAmount: amount,
                    status: 'active',
                    cashoutMult: 0
                };

                db.ref().update(updates);
                showToast("Ставка сделана", `Ставка ${panelIdx} на сумму ${amount} ₽ успешно принята!`);
            }
        });
    } else if (status === 'flying') {
        // РЕЖИМ КЭШАУТА ВРУЧНУЮ
        cashoutRocketBet(panelIdx);
    }
};

function cashoutRocketBet(panelIdx, forcedMult) {
    const isCashed = (panelIdx === 1) ? rocketBet1Cashed : rocketBet2Cashed;
    const isActive = (panelIdx === 1) ? rocketBet1Active : rocketBet2Active;
    const betAmt = (panelIdx === 1) ? rocketBet1Amount : rocketBet2Amount;

    if (!isActive || isCashed || rocketState.status !== 'flying') return;

    const now = getServerTime();
    const elapsed = (now - rocketState.launchTime) / 1000;
    const liveMult = parseFloat(getRocketMult(elapsed, rocketState.crashMult).toFixed(2));

    let currentMult = forcedMult ? parseFloat(forcedMult.toFixed(1)) : liveMult;

    if (liveMult >= rocketState.crashMult) {
        if (forcedMult && rocketState.crashMult >= forcedMult) {
            // Ок
        } else {
            return; // Опоздали
        }
    }

    if (panelIdx === 1) rocketBet1Cashed = true;
    else rocketBet2Cashed = true;

    const winnings = parseFloat((betAmt * currentMult).toFixed(2));

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) + winnings).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            db.ref(`rocketBetsV3/${myPlayerId}/bet${panelIdx}`).update({
                status: 'cashed',
                cashoutMult: currentMult
            });
            showToast("Выигрыш!", `Ставка ${panelIdx} успешно обналичена на x${currentMult}! +${winnings} ₽`);
        }
    });
}

function syncRocketState() {
    const status = rocketState ? (rocketState.status || 'betting') : 'betting';
    const timerOverlay = document.getElementById('rocketTimerOverlay');
    const rocketActor = document.getElementById('rocketActor');
    const multDisp = document.getElementById('rocketMultiplierDisplay');
    const explosion = document.getElementById('rocketExplosion');
    const msg = document.getElementById('rocketMessage');
    const stars = document.querySelector('.stars-container');

    if (status === 'betting') {
        if (rocketLoopId) { cancelAnimationFrame(rocketLoopId); rocketLoopId = null; }
        if (explosion) explosion.style.display = 'none';
        if (rocketActor) { rocketActor.style.display = 'flex'; rocketActor.style.bottom = '20px'; }
        if (multDisp) multDisp.style.display = 'none';
        if (timerOverlay) timerOverlay.style.display = 'block';
        if (stars) stars.style.animationDuration = '3.5s';

        if (rocketState.timerEnd && rocketState.timerEnd > 0) {
            startRocketBettingTimer(rocketState.timerEnd);
        } else {
            if (timerOverlay) timerOverlay.textContent = '10';
            if (msg) msg.textContent = 'Ожидание игроков...';
        }
    } 
    else if (status === 'flying') {
        if (timerOverlay) timerOverlay.style.display = 'none';
        if (explosion) explosion.style.display = 'none';
        if (rocketActor) rocketActor.style.display = 'flex';

        if (rocketTimerInterval) { clearInterval(rocketTimerInterval); rocketTimerInterval = null; }
        startRocketFlightAnimation(rocketState.launchTime);
    } 
    else if (status === 'crashed') {
        if (rocketLoopId) { cancelAnimationFrame(rocketLoopId); rocketLoopId = null; }
        if (rocketTimerInterval) { clearInterval(rocketTimerInterval); rocketTimerInterval = null; }

        if (timerOverlay) timerOverlay.style.display = 'none';
        if (rocketActor) rocketActor.style.display = 'none';
        if (explosion) explosion.style.display = 'block';

        if (multDisp) {
            multDisp.style.display = 'block';
            multDisp.textContent = `${rocketState.crashMult ? rocketState.crashMult.toFixed(2) : '1.00'}x`;
            multDisp.style.color = '#ff1744';
        }

        if (msg) {
            const finalMult = rocketState.crashMult ? rocketState.crashMult.toFixed(2) : '1.00';
            msg.innerHTML = `💥 Ракета взорвалась на <span style="color:#ff1744; font-weight:bold;">${finalMult}x</span>`;
        }

        // Клиентский автовывод при краше
        if (rocketBet1Active && !rocketBet1Cashed && rocketAuto1Enabled && rocketState.crashMult >= rocketAuto1Multiplier) {
            cashoutRocketBet(1, rocketAuto1Multiplier);
        }
        if (rocketBet2Active && !rocketBet2Cashed && rocketAuto2Enabled && rocketState.crashMult >= rocketAuto2Multiplier) {
            cashoutRocketBet(2, rocketAuto2Multiplier);
        }

        rocketBet1Active = false;
        rocketBet2Active = false;
        rocketBet1Cashed = false;
        rocketBet2Cashed = false;
    }
    updateRocketUIElements();
}

function startRocketBettingTimer(timerEnd) {
    if (rocketTimerInterval) clearInterval(rocketTimerInterval);
    const timerOverlay = document.getElementById('rocketTimerOverlay');
    const msg = document.getElementById('rocketMessage');

    rocketTimerInterval = setInterval(() => {
        const now = getServerTime();
        const timeLeft = Math.max(0, (timerEnd - now) / 1000);
        
        if (timerOverlay) timerOverlay.textContent = Math.ceil(timeLeft);

        if (rocketState.status !== 'betting') {
            clearInterval(rocketTimerInterval);
            rocketTimerInterval = null;
            return;
        }

        if (msg) {
            msg.textContent = `Успейте поставить! До старта: ${timeLeft.toFixed(1)}с`;
            msg.style.color = '#D500F9';
        }

        if (timeLeft <= 0) {
            clearInterval(rocketTimerInterval);
            rocketTimerInterval = null;
            if (isHost() && rocketState.status === 'betting') {
                launchRocket();
            }
        }
    }, 100);
}

function startRocketFlightAnimation(launchTime) {
    const rocketActor = document.getElementById('rocketActor');
    const multDisp = document.getElementById('rocketMultiplierDisplay');

    if (multDisp) multDisp.style.display = 'block';

    function tick() {
        const now = getServerTime();
        const elapsed = (now - launchTime) / 1000;
        
        if (elapsed < 0) {
            rocketLoopId = requestAnimationFrame(tick);
            return;
        }

        const currentMult = getRocketMult(elapsed, rocketState.crashMult);

        if (multDisp && rocketState.status === 'flying') {
            multDisp.textContent = `${currentMult.toFixed(2)}x`;
            multDisp.style.color = '#00FF88';
        }

        if (rocketActor) {
            const verticalPos = Math.min(130, 20 + elapsed * 10);
            rocketActor.style.bottom = `${verticalPos}px`;
        }

        // Автовыводы в реальном времени
        if (rocketState.status === 'flying') {
            if (rocketBet1Active && !rocketBet1Cashed && rocketAuto1Enabled && currentMult >= rocketAuto1Multiplier) {
                cashoutRocketBet(1, rocketAuto1Multiplier);
            }
            if (rocketBet2Active && !rocketBet2Cashed && rocketAuto2Enabled && currentMult >= rocketAuto2Multiplier) {
                cashoutRocketBet(2, rocketAuto2Multiplier);
            }
            rocketLoopId = requestAnimationFrame(tick);
        }
    }
    rocketLoopId = requestAnimationFrame(tick);
}

function renderRocketBets(betsData) {
    const listContainer = document.getElementById('rocketBetsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const list = Object.entries(betsData);
    if (list.length === 0) {
        listContainer.innerHTML = '<div class="bet-placeholder">Ставок еще нет...</div>';
        return;
    }

    list.forEach(([pId, record]) => {
        const div1 = document.createElement('div');
        div1.className = 'bet-item';
        div1.style.borderLeft = `4px solid ${record.color}`;

        if (record.bet1) {
            let status = record.bet1.status === 'active' ? 'В полете...' : `Забрал x${record.bet1.cashoutMult} (+${Math.floor(record.bet1.betAmount * record.bet1.cashoutMult)} ₽)`;
            div1.innerHTML = `
                <div class="avatar" style="background:${record.color}">${record.name[0]}</div>
                <div class="bet-info"><strong>${record.name} (Ставка 1)</strong><span>Ставка: ${record.bet1.betAmount} ₽</span></div>
                <div class="bet-chance">${status}</div>
            `;
            listContainer.appendChild(div1);
        }

        if (record.bet2) {
            const div2 = document.createElement('div');
            div2.className = 'bet-item';
            div2.style.borderLeft = `4px solid ${record.color}`;
            let status = record.bet2.status === 'active' ? 'В полете...' : `Забрал x${record.bet2.cashoutMult} (+${Math.floor(record.bet2.betAmount * record.bet2.cashoutMult)} ₽)`;
            div2.innerHTML = `
                <div class="avatar" style="background:${record.color}">${record.name[0]}</div>
                <div class="bet-info"><strong>${record.name} (Ставка 2)</strong><span>Ставка: ${record.bet2.betAmount} ₽</span></div>
                <div class="bet-chance">${status}</div>
            `;
            listContainer.appendChild(div2);
        }
    });
}

function renderRocketHistory(historyList) {
    const bar = document.getElementById('rocketHistory');
    if (!bar) return;
    bar.innerHTML = '';
    const reversed = [...historyList].reverse();
    reversed.forEach(val => {
        const span = document.createElement('span');
        span.className = 'rocket-hist-item';
        if (val < 1.5) span.className += ' mult-grey';
        else if (val < 5.0) span.className += ' mult-green';
        else if (val < 20.0) span.className += ' mult-gold';
        else span.className += ' mult-cyan';
        span.textContent = `${val.toFixed(2)}x`;
        bar.appendChild(span);
    });
}

function checkHostRocketLogic() {
    if (!isHost()) return;
    const now = getServerTime();
    const stateRef = db.ref('rocketStateV3');
    const current = rocketState || { status: 'betting', timerEnd: 0 };

    const lastActiveTime = current.crashedTime || current.launchTime || current.timerEnd || 0;
    if (lastActiveTime > 0 && (now - lastActiveTime > 25000)) {
        // Цикл Ракеты продолжается даже при отсутствии игроков!
        db.ref('rocketHistoryV3').once('value').then((histSnap) => {
            let hList = histSnap.val() || [];
            if (!Array.isArray(hList)) hList = [];
            hList.push(generateCrashMultiplier());
            if (hList.length > 10) hList.shift();
            db.ref('rocketHistoryV3').set(hList);
        });

        db.ref('rocketBetsV3').remove();
        stateRef.set({
            status: 'betting',
            timerEnd: now + 10000,
            launchTime: 0,
            crashMult: 0,
            crashedTime: 0
        });
        return;
    }

    if (current.status === 'betting') {
        if (!current.timerEnd || current.timerEnd === 0) {
            stateRef.update({ status: 'betting', timerEnd: now + 10000 });
        } else if (now >= current.timerEnd) {
            stateRef.set({
                status: 'flying',
                launchTime: now,
                crashMult: generateCrashMultiplier(),
                timerEnd: 0
            });
        }
    } 
    else if (current.status === 'flying') {
        const elapsed = (now - current.launchTime) / 1000;
        const currentMult = getRocketMult(elapsed, current.crashMult);

        if (currentMult >= current.crashMult) {
            stateRef.update({ status: 'crashed', crashedTime: now });

            db.ref('rocketHistoryV3').once('value').then((histSnap) => {
                let hList = histSnap.val() || [];
                if (!Array.isArray(hList)) hList = [];
                hList.push(current.crashMult);
                if (hList.length > 10) hList.shift();
                db.ref('rocketHistoryV3').set(hList);
            });

            db.ref('rocketBetsV3').once('value').then((betsSnap) => {
                const bets = betsSnap.val() || {};
                const updates = {};
                for (let pId in bets) {
                    if (bets[pId].bet1 && bets[pId].bet1.status === 'active') {
                        updates[`rocketBetsV3/${pId}/bet1/status`] = 'lost';
                    }
                    if (bets[pId].bet2 && bets[pId].bet2.status === 'active') {
                        updates[`rocketBetsV3/${pId}/bet2/status`] = 'lost';
                    }
                }
                if (Object.keys(updates).length > 0) db.ref().update(updates);
            });
        }
    } 
    else if (current.status === 'crashed') {
        if (current.crashedTime && now >= (current.crashedTime + 4000)) {
            db.ref('rocketBetsV3').remove(); 
            stateRef.set({
                status: 'betting',
                timerEnd: now + 10000,
                launchTime: 0,
                crashMult: 0,
                crashedTime: 0
            });
        }
    }
}

function launchRocket() {
    db.ref('rocketStateV3').update({
        status: 'flying',
        launchTime: getServerTime(),
        crashMult: generateCrashMultiplier(),
        timerEnd: 0
    });
}


// ======= АБСОЛЮТНО НОВАЯ МУЛЬТИПЛЕЕРНАЯ ОНЛАЙН-ИГРА: "ГОНКА ДРОНОВ" =======

window.selectDronesColor = function(color) {
    dronesSelectedColor = color;
    document.querySelectorAll('.drone-choice-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`btnDrone_${color}`);
    if (activeBtn) activeBtn.classList.add('active');
}

window.placeDronesBet = function() {
    if (dronesState.status !== 'betting') {
        alert('Ставки закрыты!');
        return;
    }
    if (dronesBetPlaced) {
        alert('Вы уже сделали ставку!');
        return;
    }

    const input = document.getElementById('dronesBetInput');
    const amount = parseInt(input.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (amount < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (amount > balance) {
        alert('Недостаточно баланса!');
        return;
    }

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - amount).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            db.ref(`dronesBets/${myPlayerId}`).set({
                name: players[myPlayerId]?.name || 'Игрок',
                amount: amount,
                color: dronesSelectedColor
            });
            showToast("Гонка Дронов", "Ставка на дрон успешно зарегистрирована!");
        }
    });
}

function syncDronesState() {
    const status = dronesState.status || 'betting';
    const msg = document.getElementById('dronesMessage');
    const betBtn = document.getElementById('dronesBetBtn');

    if (status === 'betting') {
        if (dronesLoopId) { cancelAnimationFrame(dronesLoopId); dronesLoopId = null; }
        if (betBtn) betBtn.disabled = dronesBetPlaced;
        
        if (dronesState.timerEnd && dronesState.timerEnd > 0) {
            startDronesBettingTimer(dronesState.timerEnd);
        } else {
            if (msg) msg.textContent = 'Ожидание гонщиков...';
        }
        renderDronesTrack();
    } 
    else if (status === 'racing') {
        if (betBtn) betBtn.disabled = true;
        if (msg) msg.textContent = 'Гонка дронов в самом разгаре!';
        if (dronesTimerInterval) { clearInterval(dronesTimerInterval); dronesTimerInterval = null; }
        
        startDronesAnimation(dronesState.launchTime, dronesState.seed);
    } 
    else if (status === 'finished') {
        if (betBtn) betBtn.disabled = true;
        if (dronesLoopId) { cancelAnimationFrame(dronesLoopId); dronesLoopId = null; }
        
        renderDronesTrack(true); // Финальный рендер с победителем

        const colorRu = { red: 'Красный', blue: 'Синий', green: 'Зеленый', yellow: 'Желтый' };
        if (msg) {
            msg.innerHTML = `🏁 Победил <span style="color:${DRONE_COLORS[dronesState.winnerColor]}">${colorRu[dronesState.winnerColor]} дрон</span>!`;
        }

        if (dronesBetPlaced && dronesSelectedColor === dronesState.winnerColor) {
            const winnings = Math.floor(dronesMyBet * 3.6);
            showVictoryNotification(`Дрон ${colorRu[dronesState.winnerColor]}`, winnings, DRONE_COLORS[dronesState.winnerColor]);
        }
    }
}

function startDronesBettingTimer(timerEnd) {
    if (dronesTimerInterval) clearInterval(dronesTimerInterval);
    const msg = document.getElementById('dronesMessage');

    dronesTimerInterval = setInterval(() => {
        const now = getServerTime();
        const timeLeft = Math.max(0, (timerEnd - now) / 1000);
        
        if (msg) {
            msg.textContent = `Ставки принимаются! До гонки: ${Math.ceil(timeLeft)}с`;
            msg.style.color = '#00FF88';
        }

        if (timeLeft <= 0) {
            clearInterval(dronesTimerInterval);
            dronesTimerInterval = null;
            if (isHost() && dronesState.status === 'betting') {
                launchDronesRace();
            }
        }
    }, 200);
}

// Детерминированный расчет положения дронов по времени (без сетевой рассинхронизации)
function getDronePosition(elapsed, seedValue, index) {
    let speed = 25; 
    let baseOffset = speed * elapsed;
    
    // Псевдослучайные микроускорения на основе синусоид
    let microBoost = Math.sin(elapsed * 2.3 + index * 4.5 + seedValue) * 18;
    let microBoost2 = Math.cos(elapsed * 4.1 + index * 1.5 - seedValue) * 8;

    let x = 30 + baseOffset + microBoost + microBoost2;
    return Math.min(365, x);
}

function startDronesAnimation(launchTime, seed) {
    const canvas = document.getElementById('dronesCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return;

    function tick() {
        const now = getServerTime();
        const elapsed = (now - launchTime) / 1000;

        ctx.clearRect(0, 0, 400, 250);

        // Сетка трассы
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        for (let i = 0; i < 400; i += 40) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 250); ctx.stroke();
        }

        // Финишная линия
        ctx.strokeStyle = '#FFEA00';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(370, 0); ctx.lineTo(370, 250); ctx.stroke();

        const colors = ['red', 'blue', 'green', 'yellow'];
        
        colors.forEach((col, idx) => {
            const y = 35 + idx * 55;
            const x = getDronePosition(elapsed, seed, idx);

            // Траектория
            ctx.strokeStyle = DRONE_COLORS[col] + '44';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(x, y); ctx.stroke();

            // Дрон
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.fillStyle = DRONE_COLORS[col];
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(col[0].toUpperCase(), x, y + 3);
        });

        if (dronesState.status === 'racing') {
            dronesLoopId = requestAnimationFrame(tick);
        }
    }
    dronesLoopId = requestAnimationFrame(tick);
}

function renderDronesTrack(finished = false) {
    const canvas = document.getElementById('dronesCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return;

    ctx.clearRect(0, 0, 400, 250);

    // Отрисовка статической трассы
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let i = 0; i < 400; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 250); ctx.stroke();
    }

    ctx.strokeStyle = '#FFEA00';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(370, 0); ctx.lineTo(370, 250); ctx.stroke();

    const colors = ['red', 'blue', 'green', 'yellow'];
    colors.forEach((col, idx) => {
        const y = 35 + idx * 55;
        const x = finished && dronesState.winnerColor === col ? 370 : 30;

        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = DRONE_COLORS[col];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

function renderDronesBetsList(bets) {
    const bar = document.getElementById('dronesBetsList');
    if (!bar) return;
    bar.innerHTML = '';
    const list = Object.values(bets);
    if (list.length === 0) {
        bar.innerHTML = '<div class="bet-placeholder">Ставок нет</div>';
        return;
    }
    list.forEach(b => {
        const div = document.createElement('div');
        div.className = 'bet-item';
        div.style.borderLeft = `4px solid ${DRONE_COLORS[b.color]}`;
        div.innerHTML = `
            <div class="avatar" style="background:${DRONE_COLORS[b.color]}">🛸</div>
            <div class="bet-info"><strong>${b.name}</strong><span>Ставка: ${b.amount} ₽</span></div>
            <div class="bet-chance" style="color:${DRONE_COLORS[b.color]}">${b.color.toUpperCase()}</div>
        `;
        bar.appendChild(div);
    });
}

function renderDronesHistoryBar(hist) {
    const bar = document.getElementById('dronesHistory');
    if (!bar) return;
    bar.innerHTML = '';
    const reversed = [...hist].reverse().slice(0, 10);
    reversed.forEach(val => {
        const span = document.createElement('span');
        span.className = 'rocket-hist-item';
        span.style.background = DRONE_COLORS[val];
        span.style.color = '#000';
        span.textContent = val.toUpperCase();
        bar.appendChild(span);
    });
}

function checkHostDronesLogic() {
    if (!isHost()) return;
    const now = getServerTime();
    const stateRef = db.ref('dronesState');
    const current = dronesState || { status: 'betting' };

    const lastActiveTime = current.crashedTime || current.launchTime || current.timerEnd || 0;
    if (lastActiveTime > 0 && (now - lastActiveTime > 30000)) {
        // Очищаем и перезапускаем
        db.ref('dronesBets').remove();
        stateRef.set({
            status: 'betting',
            timerEnd: now + 12000,
            launchTime: 0,
            seed: 0,
            winnerColor: ''
        });
        return;
    }

    if (current.status === 'betting') {
        if (!current.timerEnd || current.timerEnd === 0) {
            stateRef.update({ status: 'betting', timerEnd: now + 12000 });
        } else if (now >= current.timerEnd) {
            // Рассчитываем победителя по семени гонки
            const seed = Math.random() * 1000;
            const times = [];
            const colors = ['red', 'blue', 'green', 'yellow'];
            
            // Финиш на X = 340. Рассчитываем время финиша каждого дрона
            colors.forEach((col, idx) => {
                let finished = false;
                let t = 0;
                while (!finished && t < 15) {
                    t += 0.05;
                    if (getDronePosition(t, seed, idx) >= 365) {
                        times.push({ color: col, time: t });
                        finished = true;
                    }
                }
            });

            times.sort((a, b) => a.time - b.time);
            const winner = times[0].color;

            stateRef.set({
                status: 'racing',
                launchTime: now,
                seed: seed,
                winnerColor: winner,
                timerEnd: 0
            });
        }
    } 
    else if (current.status === 'racing') {
        const elapsed = (now - current.launchTime) / 1000;
        // Длина трека финиширует примерно за 11-12 секунд максимум
        if (elapsed >= 11.5) {
            stateRef.update({
                status: 'finished',
                crashedTime: now
            });

            // Начисление выплат за победивший дрон
            db.ref('dronesBets').once('value').then((snap) => {
                const bets = snap.val() || {};
                for (let pId in bets) {
                    if (bets[pId].color === current.winnerColor) {
                        const prize = Math.floor(bets[pId].amount * 3.6);
                        db.ref(`players/${pId}/balance`).transaction((bal) => {
                            return parseFloat(((bal || 0) + prize).toFixed(3));
                        });
                    }
                }
            });

            // Пишем в историю
            db.ref('dronesHistory').once('value').then((snap) => {
                let hList = snap.val() || [];
                if (!Array.isArray(hList)) hList = [];
                hList.push(current.winnerColor);
                if (hList.length > 10) hList.shift();
                db.ref('dronesHistory').set(hList);
            });
        }
    } 
    else if (current.status === 'finished') {
        if (current.crashedTime && now >= (current.crashedTime + 5000)) {
            db.ref('dronesBets').remove();
            stateRef.set({
                status: 'betting',
                timerEnd: now + 12000,
                launchTime: 0,
                seed: 0,
                winnerColor: ''
            });
        }
    }
}

function launchDronesRace() {
    const seed = Math.random() * 1000;
    const colors = ['red', 'blue', 'green', 'yellow'];
    const times = [];
    colors.forEach((col, idx) => {
        let t = 0;
        while (t < 15) {
            t += 0.05;
            if (getDronePosition(t, seed, idx) >= 365) {
                times.push({ color: col, time: t });
                break;
            }
        }
    });
    times.sort((a, b) => a.time - b.time);
    const winner = times[0].color;

    db.ref('dronesState').set({
        status: 'racing',
        launchTime: getServerTime(),
        seed: seed,
        winnerColor: winner,
        timerEnd: 0
    });
}


// ======= ШУТОЧНЫЙ ВЫВОД СРЕДСТВ =======

window.requestWithdraw = function() {
    const card = document.getElementById('withdrawCardInput').value.trim();
    const bank = document.getElementById('withdrawBankInput').value.trim();
    const amountInput = document.getElementById('withdrawAmountInput');
    const amount = parseFloat(amountInput.value) || 0;
    
    const balance = players[myPlayerId]?.balance || 0;

    if (!card || !bank) {
        alert('Пожалуйста, заполните все поля!');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert('Введите корректную сумму для вывода средств!');
        return;
    }
    if (amount > balance) {
        alert(`Недостаточно средств! Ваш текущий баланс: ${parseFloat(balance.toFixed(3))} ₽`);
        return;
    }

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - amount).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            alert(
                "Ваша выплата оформлена. Ждите поступление средств в течении 365 дней. " +
                "В случае, если средства не поступят, напишите в поддержку. Поддержка вам не ответит :)\n\n" +
                "Всего вам доброго!"
            );
            
            document.getElementById('withdrawCardInput').value = '';
            document.getElementById('withdrawBankInput').value = '';
            amountInput.value = '';

            showScreen('lobbyScreen');
        } else {
            alert('Ошибка выполнения транзакции вывода. Попробуйте еще раз.');
        }
    });
}


// ======= DEPOSITS AND ADMIN PANEL =======

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
        return parseFloat(((current || 0) + amount).toFixed(3));
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
