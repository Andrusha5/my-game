// ======= НАСТРОЙКИ FIREBASE =======
var firebaseConfig = {
  apiKey: "AIzaSyDaqDEFnRgoOoQRpoQoZ5_OZq4FywdbByM",
  authDomain: "checkers-roulette.firebaseapp.com",
  databaseURL: "https://checkers-roulette-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "checkers-roulette",
  storageBucket: "checkers-roulette.firebasestorage.app",
  messagingSenderId: "856460439104",
  appId: "1:856460439104:web:0e386cc2afca3b655af9a5"
};

firebase.initializeApp(firebaseConfig);
var db = firebase.database();

// ======= Безопасное сохранение состояния для Telegram =======
var myPlayerId = 'player_' + Math.random().toString(36).slice(2, 11);
try {
    var savedId = localStorage.getItem('roulette_player_id');
    if (savedId) {
        myPlayerId = savedId;
    } else {
        localStorage.setItem('roulette_player_id', myPlayerId);
    }
} catch (e) {
    console.warn("localStorage недоступен. Использован сессионный ID:", myPlayerId);
}

var players = {};         
var gameState = {};       
var onlinePlayers = [];   
var serverOffset = 0;     

// Параметры игры Кальмара
var BETTING_TIME = 15;
var BALL_MAX_SPEED = 120; 
var BALL_DECELERATION = 0.985;
var MIN_BET = 10;
var VIRTUAL_WIDTH = 400;
var VIRTUAL_HEIGHT = 400;
var VIRTUAL_RADIUS = 10;

var timerInterval = null;
var animationFrameId = null;
var currentPath = [];
var animStartTime = 0;
var ballX = 200, ballY = 200;
var ballStartX = 200, ballStartY = 200;

var arrowSpinning = false;
var arrowHold = false;
var arrowAngle = 0;
var arrowSpinDuration = 2000; 

var DISTINCT_COLORS = [
    '#E91E63', '#9C27B0', '#3F51B5', '#00BCD4',  
    '#4CAF50', '#FFEB3B', '#FF9800', '#FF5722',  
    '#E040FB', '#00E676', '#FF1744', '#00E5FF'
];

// Колесо
var spSelectedPercent = 50;  
var spTotalRotation = 0;     
var spIsSpinning = false;    

var SP_RULES = {
    75: { mult: 1.2, label: 'x1.2' },
    50: { mult: 1.4, label: 'x1.4' },
    33: { mult: 1.55, label: 'x1.55' },
    25: { mult: 1.8, label: 'x1.8' },
    10: { mult: 2.2, label: 'x2.2' },
    1:  { mult: 33.0, label: 'x33.0' }
};

// Монетка
var coinChoice = 'heads'; 
var coinIsSpinning = false;
var coinRotationY = 0; 

// Сапер
var minesGameActive = false;
var minesMap = []; 
var minesOpened = []; 
var minesCurrentBet = 0;

var MINES_MULTIPLIERS = [
    1.00, 1.12, 1.27, 1.45, 1.67, 1.93, 2.25, 2.64, 3.13, 3.75, 
    4.55, 5.58, 6.98, 8.90, 11.62, 15.60, 21.65, 31.20, 47.05, 
    76.00, 134.00, 275.00, 750.00
];

// Башня
var impGameActive = false;
var impCurrentRow = 0; 
var impBet = 0;
var impBoard = []; 

var impMinesData = [
    { cells: 5, mines: 1, mult: 1.2 },  
    { cells: 5, mines: 1, mult: 1.6 },  
    { cells: 5, mines: 2, mult: 2.5 },  
    { cells: 4, mines: 1, mult: 4.5 },  
    { cells: 3, mines: 1, mult: 8.0 },  
    { cells: 2, mines: 1, mult: 15.0 }  
];

// РАКЕТА V3
var rocketState = { status: 'betting', timerEnd: 0 };
var rocketLoopId = null;
var rocketTimerInterval = null; 

var rocketBet1Active = false;
var rocketBet2Active = false;
var rocketBet1Amount = 0;
var rocketBet2Amount = 0;
var rocketBet1Cashed = false;
var rocketBet2Cashed = false;

var rocketAuto1Enabled = true;
var rocketAuto1Multiplier = 1.1;
var rocketAuto2Enabled = true;
var rocketAuto2Multiplier = 1.1;

// ГОНКА ДРОНОВ
var dronesState = { status: 'betting', timerEnd: 0 };
var dronesTimerInterval = null;
var dronesLoopId = null;
var dronesSelectedColor = 'red';
var dronesMyBet = 0;
var dronesBetPlaced = false;

var DRONE_COLORS = {
    red: '#FF1744',
    blue: '#2979FF',
    green: '#00E676',
    yellow: '#FFEA00'
};

// DOM элементы
var bettingTimerDisplay, totalBankDisplay, gameCanvas, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, historyList, gameMessage;

function getServerTime() {
    return Date.now() + serverOffset;
}

function isHost() {
    if (onlinePlayers.length === 0) return false;
    return onlinePlayers[0] === myPlayerId;
}

// Уведомление о победе
window.showVictoryNotification = function(winnerName, prize, color) {
    var oldNotify = document.getElementById('victoryOverlayNotification');
    if (oldNotify) oldNotify.remove();

    var notify = document.createElement('div');
    notify.id = 'victoryOverlayNotification';
    
    Object.assign(notify.style, {
        position: 'fixed',
        top: '25px',
        left: '50%',
        transform: 'translateX(-50%) translateY(-50px)',
        background: 'rgba(15, 8, 28, 0.98)',
        border: '3px solid ' + color,
        boxShadow: '0 0 30px ' + color + '88',
        borderRadius: '16px',
        padding: '20px 25px',
        color: 'white',
        zIndex: '999999',
        width: '320px',
        maxWidth: '90%',
        textAlign: 'center',
        opacity: '0',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        pointerEvents: 'auto'
    });

    notify.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:0.85rem; text-transform:uppercase; letter-spacing:1.5px; color:${color}; font-weight:900;">🏆 ПОБЕДИТЕЛЬ РАУНДА 🏆</span>
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

    setTimeout(function() {
        notify.style.opacity = '1';
        notify.style.transform = 'translateX(-50%) translateY(0)';
        var progress = document.getElementById('victoryTimerProgress');
        if (progress) progress.style.width = '0%';
    }, 50);

    var closeBtn = notify.querySelector('#closeVictoryNotifyBtn');
    if (closeBtn) {
        closeBtn.onclick = function() {
            notify.style.opacity = '0';
            notify.style.transform = 'translateX(-50%) translateY(-50px)';
            setTimeout(function() { notify.remove(); }, 400);
        };
    }

    setTimeout(function() {
        if (notify.parentElement) {
            notify.style.opacity = '0';
            notify.style.transform = 'translateX(-50%) translateY(-50px)';
            setTimeout(function() { notify.remove(); }, 400);
        }
    }, 5000);
};

// Тосты
window.showToast = function(title, text, isSuccess) {
    if (isSuccess === undefined) isSuccess = true;
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'custom-toast';
    if (!isSuccess) {
        toast.style.borderColor = '#FF1744';
        toast.style.boxShadow = '0 0 15px rgba(255, 23, 68, 0.3)';
    }

    var textStyle = isSuccess ? '#00FF88' : '#FF1744';
    toast.innerHTML = `
        <div class="toast-header" style="display:flex; justify-content:space-between; align-items:center;">
            <span class="toast-title" style="color: ${textStyle}; font-weight:bold;">💥 ${title}</span>
            <button class="toast-close-btn" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
        <div class="toast-body" style="margin-top:6px; font-size:0.9rem;">${text}</div>
    `;

    container.appendChild(toast);

    setTimeout(function() {
        if (toast) {
            toast.remove();
        }
    }, 3000);
};

window.showScreen = function(screenId) {
    var screens = [
        'lobbyScreen', 'multiplayerGameScreen', 'singleplayerGameScreen', 
        'coinGameScreen', 'minesGameScreen', 'impMinesGameScreen', 
        'rocketGameScreen', 'dronesGameScreen', 'withdrawGameScreen'
    ];
    for (var i = 0; i < screens.length; i++) {
        var el = document.getElementById(screens[i]);
        if (el) el.style.display = 'none';
    }
    
    var target = document.getElementById(screenId);
    if (target) target.style.display = 'flex';

    if (screenId === 'dronesGameScreen') renderDronesTrack();
};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
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

    var savedName = "";
    try {
        savedName = localStorage.getItem('roulette_player_name') || "";
    } catch(e){}

    if (savedName && playerNameInput) {
        playerNameInput.value = savedName;
    }

    if (placeBetButton) placeBetButton.addEventListener('click', placeBet);

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1') {
        var adminPanel = document.getElementById('adminPanel');
        if (adminPanel) adminPanel.style.display = 'block';
        initAdminPanel();
    }

    db.ref('.info/serverTimeOffset').on('value', function(snap) {
        serverOffset = snap.val() || 0;
    });

    db.ref('.info/connected').on('value', function(snap) {
        if (snap.val() === true) {
            var presenceRef = db.ref('presence/' + myPlayerId);
            presenceRef.set(true);
            presenceRef.onDisconnect().remove();
        }
    });

    db.ref('presence').on('value', function(snap) {
        onlinePlayers = Object.keys(snap.val() || {}).sort();
    });

    db.ref('players/' + myPlayerId).once('value', function(snap) {
        if (!snap.exists()) {
            db.ref('players/' + myPlayerId).set({
                name: savedName || "Игрок",
                balance: 100, 
                totalBet: 0,
                color: DISTINCT_COLORS[Math.floor(Math.random() * DISTINCT_COLORS.length)]
            });
        }
    });

    db.ref('players').on('value', function(snapshot) {
        players = snapshot.val() || {};
        var me = players[myPlayerId];
        if (me) {
            var userWelcome = document.getElementById('userWelcome');
            if (userWelcome) userWelcome.textContent = me.name || "Игрок";
            
            var myBalance = document.getElementById('myBalance');
            if (myBalance) {
                var rawBalance = me.balance || 0;
                myBalance.textContent = parseFloat(rawBalance.toFixed(3));
            }
            updateSpSummary();
            updateMinesSummary();
        }
        try {
            renderBets();
            renderWheelSections();
        } catch (e) {
            console.error("Ошибка рендеринга:", e);
        }
    });

    db.ref('gameState').on('value', function(snapshot) {
        var oldState = gameState;
        gameState = snapshot.val() || { status: 'betting' };

        if (gameState.status === 'finished' && oldState.status !== 'finished' && gameState.winnerName) {
            if (gameState.winnerName !== 'Никто') {
                showVictoryNotification(gameState.winnerName, gameState.winnerPrize, gameState.winnerColor || '#00FF88');
            } else {
                showToast("ИГРА В КАЛЬМАРА", "Победителей нет 🔴", false);
            }
        }
        syncGameWithDatabase();
    });

    db.ref('history').limitToLast(10).on('value', function(snapshot) {
        renderHistory(snapshot.val() || {});
    });

    // ======= СЛУШАТЕЛИ РАКЕТЫ =======
    db.ref('rocketStateV3').on('value', function(snapshot) {
        rocketState = snapshot.val() || { status: 'betting', timerEnd: 0 };
        syncRocketState();
    });

    db.ref('rocketBetsV3').on('value', function(snapshot) {
        var bets = snapshot.val() || {};
        renderRocketBets(bets);

        var myBetRecord = bets[myPlayerId];
        if (myBetRecord) {
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

    db.ref('rocketHistoryV3').on('value', function(snapshot) {
        renderRocketHistory(snapshot.val() || []);
    });

    // ======= СЛУШАТЕЛИ ГОНКИ ДРОНОВ =======
    db.ref('dronesState').on('value', function(snap) {
        dronesState = snap.val() || { status: 'betting' };
        syncDronesState();
    });

    db.ref('dronesBets').on('value', function(snap) {
        var bets = snap.val() || {};
        var myBetRecord = bets[myPlayerId];
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

    db.ref('dronesHistory').on('value', function(snap) {
        renderDronesHistoryBar(snap.val() || []);
    });

    selectSpPercent(50);
    renderMinesGrid();
    initImpMinesUI();

    // Запуск фонового таймера (каждые 500мс)
    setInterval(updateOnlineGamesProgress, 500);
});

// Автономная транзакционная логика запуска (БЕЗ ЗАВИСАНИЯ ИГР)
function safeInitTimer(refPath, durationSec) {
    db.ref(refPath).transaction(function(current) {
        if (!current) {
            return { status: 'betting', timerEnd: getServerTime() + durationSec * 1000 };
        }
        if (current.status === 'betting' && (!current.timerEnd || current.timerEnd === 0)) {
            current.timerEnd = getServerTime() + durationSec * 1000;
            return current;
        }
        return;
    });
}

function updateOnlineGamesProgress() {
    var now = getServerTime();

    // Кальмар рулетка
    if (gameState.status === 'betting' && gameState.timerEnd > 0 && now >= gameState.timerEnd) {
        safeLaunchSquid();
    }
    if (gameState.status === 'betting' && (!gameState.timerEnd || gameState.timerEnd === 0)) {
        var activePlayers = Object.values(players).filter(function(p) { return p.totalBet > 0; });
        if (activePlayers.length >= 2) {
            safeInitTimer('gameState', BETTING_TIME);
        }
    }

    // Ракета
    if (rocketState.status === 'betting') {
        if (!rocketState.timerEnd || rocketState.timerEnd === 0) {
            safeInitTimer('rocketStateV3', 10);
        } else if (now >= rocketState.timerEnd) {
            safeLaunchRocket();
        }
    }
    if (rocketState.status === 'flying') {
        var elapsed = (now - rocketState.launchTime) / 1000;
        var currentMult = getRocketMult(elapsed, rocketState.crashMult);
        if (currentMult >= rocketState.crashMult) {
            safeCrashRocket();
        }
    }
    if (rocketState.status === 'crashed') {
        if (!rocketState.crashedTime || rocketState.crashedTime === 0) {
            db.ref('rocketStateV3').update({ crashedTime: now });
        } else if (now >= (rocketState.crashedTime + 4000)) {
            safeResetRocket();
        }
    }

    // Дроны
    if (dronesState.status === 'betting') {
        if (!dronesState.timerEnd || dronesState.timerEnd === 0) {
            safeInitTimer('dronesState', 12);
        } else if (now >= dronesState.timerEnd) {
            safeLaunchDrones();
        }
    }
    if (dronesState.status === 'racing') {
        var elapsed = (now - dronesState.launchTime) / 1000;
        if (elapsed >= 11.5) {
            safeFinishDrones();
        }
    }
    if (dronesState.status === 'finished') {
        if (!dronesState.crashedTime || dronesState.crashedTime === 0) {
            db.ref('dronesState').update({ crashedTime: now });
        } else if (now >= (dronesState.crashedTime + 5000)) {
            safeResetDrones();
        }
    }
}

// Транзакции Кальмара
function safeLaunchSquid() {
    db.ref('gameState').transaction(function(current) {
        if (current && current.status === 'betting') {
            current.status = 'running';
            current.launchAngle = Math.random() * Math.PI * 2;
            current.timerEnd = 0;
            return current;
        }
        return;
    });
}

// Транзакции Ракеты
function safeLaunchRocket() {
    db.ref('rocketStateV3').transaction(function(current) {
        if (current && current.status === 'betting') {
            current.status = 'flying';
            current.launchTime = getServerTime();
            current.crashMult = generateCrashMultiplier();
            current.timerEnd = 0;
            return current;
        }
        return;
    });
}

function safeCrashRocket() {
    db.ref('rocketStateV3').transaction(function(current) {
        if (current && current.status === 'flying') {
            current.status = 'crashed';
            current.crashedTime = getServerTime();
            return current;
        }
        return;
    }, function(err, committed, snap) {
        if (committed) {
            var finalMult = snap.val().crashMult;
            db.ref('rocketHistoryV3').once('value').then(function(histSnap) {
                var hList = histSnap.val() || [];
                if (!Array.isArray(hList)) hList = [];
                hList.push(finalMult);
                if (hList.length > 10) hList.shift();
                db.ref('rocketHistoryV3').set(hList);
            });
            db.ref('rocketBetsV3').once('value').then(function(betsSnap) {
                var bets = betsSnap.val() || {};
                var updates = {};
                for (var pId in bets) {
                    if (bets[pId].bet1 && bets[pId].bet1.status === 'active') {
                        updates['rocketBetsV3/' + pId + '/bet1/status'] = 'lost';
                        updates['rocketBetsV3/' + pId + '/bet1/cashoutMult'] = finalMult;
                    }
                    if (bets[pId].bet2 && bets[pId].bet2.status === 'active') {
                        updates['rocketBetsV3/' + pId + '/bet2/status'] = 'lost';
                        updates['rocketBetsV3/' + pId + '/bet2/cashoutMult'] = finalMult;
                    }
                }
                if (Object.keys(updates).length > 0) db.ref().update(updates);
            });
        }
    });
}

function safeResetRocket() {
    db.ref('rocketStateV3').transaction(function(current) {
        if (current && current.status === 'crashed') {
            current.status = 'betting';
            current.timerEnd = getServerTime() + 10000;
            current.launchTime = 0;
            current.crashMult = 0;
            current.crashedTime = 0;
            return current;
        }
        return;
    }, function(err, committed) {
        if (committed) {
            db.ref('rocketBetsV3').remove();
        }
    });
}

// Транзакции Дронов
function safeLaunchDrones() {
    db.ref('dronesState').transaction(function(current) {
        if (current && current.status === 'betting') {
            current.status = 'racing';
            current.launchTime = getServerTime();
            current.seed = Math.random() * 1000;
            current.timerEnd = 0;
            
            var seed = current.seed;
            var colors = ['red', 'blue', 'green', 'yellow'];
            var times = [];
            colors.forEach(function(col, idx) {
                var t = 0;
                while (t < 15) {
                    t += 0.05;
                    if (getDronePosition(t, seed, idx) >= 365) {
                        times.push({ color: col, time: t });
                        break;
                    }
                }
            });
            times.sort(function(a, b) { return a.time - b.time; });
            current.winnerColor = times[0].color;
            return current;
        }
        return;
    });
}

function safeFinishDrones() {
    db.ref('dronesState').transaction(function(current) {
        if (current && current.status === 'racing') {
            current.status = 'finished';
            current.crashedTime = getServerTime();
            return current;
        }
        return;
    }, function(err, committed, snap) {
        if (committed) {
            var winner = snap.val().winnerColor;
            db.ref('dronesBets').once('value').then(function(betsSnap) {
                var bets = betsSnap.val() || {};
                for (var pId in bets) {
                    if (bets[pId].color === winner) {
                        var prize = Math.floor(bets[pId].amount * 3.6);
                        db.ref('players/' + pId + '/balance').transaction(function(bal) {
                            return parseFloat(((bal || 0) + prize).toFixed(3));
                        });
                    }
                }
            });
            db.ref('dronesHistory').once('value').then(function(histSnap) {
                var hList = histSnap.val() || [];
                if (!Array.isArray(hList)) hList = [];
                hList.push(winner);
                if (hList.length > 10) hList.shift();
                db.ref('dronesHistory').set(hList);
            });
        }
    });
}

function safeResetDrones() {
    db.ref('dronesState').transaction(function(current) {
        if (current && current.status === 'finished') {
            current.status = 'betting';
            current.timerEnd = getServerTime() + 12000;
            current.launchTime = 0;
            current.seed = 0;
            current.winnerColor = '';
            current.crashedTime = 0;
            return current;
        }
        return;
    }, function(err, committed) {
        if (committed) {
            db.ref('dronesBets').remove();
        }
    });
}


// ======= Вкладки Кальмара =======
var betsTab = document.getElementById('tabBetsBtn');
var historyTab = document.getElementById('tabHistoryBtn');
window.switchMultiTab = function(tabName) {
    if (tabName === 'bets') {
        if (betsTab) betsTab.classList.add('active');
        if (historyTab) historyTab.classList.remove('active');
        if (betList) betList.style.display = 'block';
        if (historyList) historyList.style.display = 'none';
    } else {
        if (betsTab) betsTab.classList.remove('active');
        if (historyTab) historyTab.classList.add('active');
        if (betList) betList.style.display = 'none';
        if (historyList) historyList.style.display = 'block';
    }
};

function renderHistory(historyData) {
    if (!historyList) return;
    historyList.innerHTML = '';
    var list = Object.values(historyData).reverse();
    if (list.length === 0) {
        historyList.innerHTML = '<div class="bet-placeholder">История пуста...</div>';
        return;
    }
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var div = document.createElement('div');
        div.className = 'bet-item';
        div.style.borderLeft = '4px solid #00E676';
        div.innerHTML = `
            <div class="avatar" style="background:#00E676; color:black;">💰</div>
            <div class="bet-info">
                <strong>${item.playerName}</strong>
                <span>Выиграл: ${item.winnerPrize} ₽</span>
            </div>
            <div class="bet-chance" style="color:#00E676">${item.winnerChance}% шанс</div>
        `;
        historyList.appendChild(div);
    }
}

// ======= ИГРА 1: МОНЕТКА (COIN FLIP) =======
window.selectCoinChoice = function(choice) {
    if (coinIsSpinning) return;
    coinChoice = choice;
    var hc = document.getElementById('btnCoinHeads');
    var tc = document.getElementById('btnCoinTails');
    if (hc) hc.classList.toggle('active', choice === 'heads');
    if (tc) tc.classList.toggle('active', choice === 'tails');
};

window.playCoinFlip = function() {
    if (coinIsSpinning) return;

    var betInput = document.getElementById('coinBetInput');
    var coinEl = document.getElementById('coin3d');
    var coinMsg = document.getElementById('coinMessage');
    
    var bet = parseInt(betInput.value) || 0;
    var myData = players[myPlayerId] || { balance: 0 };
    var balance = myData.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств!');
        return;
    }

    coinIsSpinning = true;
    betInput.disabled = true;
    coinMsg.textContent = 'Монетка летит...';
    coinMsg.style.color = '#FFC400';

    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, function(error, committed) {
        if (committed) {
            var result = Math.random() < 0.5 ? 'heads' : 'tails';
            var minSpins = 1800; 
            var currentFacing = (coinRotationY % 360) === 0 ? 'heads' : 'tails';
            var additionalRotation = 0;
            
            if (currentFacing === result) {
                additionalRotation = 360; 
            } else {
                additionalRotation = 180; 
            }
            
            coinRotationY += minSpins + additionalRotation;
            coinEl.style.transform = 'rotateY(' + coinRotationY + 'deg)';

            setTimeout(function() {
                var won = coinChoice === result;
                var resLabel = result === 'heads' ? 'Орел' : 'Решка';
                if (won) {
                    var prize = Math.floor(bet * 1.5);
                    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
                        return parseFloat(((current || 0) + prize).toFixed(3));
                    });
                    coinMsg.innerHTML = '🎉 Вы выиграли! Выпало: <strong>' + resLabel + '</strong>. <span style="color:#00ff88">+' + prize + ' ₽</span>';
                } else {
                    coinMsg.innerHTML = '🔴 Не угадали! Выпало: <strong>' + resLabel + '</strong>. <span style="color:#ff1744">-' + bet + ' ₽</span>';
                }
                coinIsSpinning = false;
                betInput.disabled = false;
            }, 3000);
        } else {
            coinIsSpinning = false;
            betInput.disabled = false;
            coinMsg.textContent = 'Ошибка.';
        }
    });
};

// ======= ИГРА 2: САПЕР =======
function renderMinesGrid() {
    var grid = document.getElementById('minesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 25; i++) {
        var cell = document.createElement('button');
        cell.className = 'mine-cell';
        cell.id = 'mine_cell_' + i;
        cell.disabled = true;
        (function(index){
            cell.onclick = function() { clickMineCell(index); };
        })(i);
        grid.appendChild(cell);
    }
}

function updateMinesSummary() {
    var betInput = document.getElementById('minesBetInput');
    var cashoutVal = document.getElementById('minesCashoutValue');
    var cashoutBtn = document.getElementById('minesCashoutBtn');
    if (!betInput || !cashoutVal || !cashoutBtn) return;

    if (!minesGameActive) {
        cashoutVal.textContent = '0';
        cashoutBtn.textContent = 'Забрать 0 ₽';
        return;
    }

    var currentMult = MINES_MULTIPLIERS[minesOpened.length];
    var currentWin = Math.floor(minesCurrentBet * currentMult);
    
    cashoutVal.textContent = currentWin;
    cashoutBtn.textContent = 'Забрать ' + currentWin + ' ₽';
}

window.startMinesRound = function() {
    if (minesGameActive) return;

    var betInput = document.getElementById('minesBetInput');
    var startBtn = document.getElementById('minesStartBtn');
    var cashoutBtn = document.getElementById('minesCashoutBtn');
    var minesMsg = document.getElementById('minesMessage');

    var bet = parseInt(betInput.value) || 0;
    var me = players[myPlayerId];
    var balance = me ? (me.balance || 0) : 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств!');
        return;
    }

    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, function(error, committed) {
        if (committed) {
            minesCurrentBet = bet;
            minesGameActive = true;
            minesOpened = [];
            
            minesMap = Array(25).fill(false);
            var placed = 0;
            while (placed < 3) {
                var idx = Math.floor(Math.random() * 25);
                if (!minesMap[idx]) {
                    minesMap[idx] = true;
                    placed++;
                }
            }

            startBtn.disabled = true;
            betInput.disabled = true;
            cashoutBtn.disabled = false;
            minesMsg.textContent = 'Раунд начался! Ищите кристаллы!';
            minesMsg.style.color = '#00E5FF';

            for (var i = 0; i < 25; i++) {
                var cell = document.getElementById('mine_cell_' + i);
                cell.className = 'mine-cell';
                cell.textContent = '';
                cell.disabled = false;
            }

            document.getElementById('minesOpenedCount').textContent = '0/22';
            document.getElementById('minesCurrentMultiplier').textContent = '1.00x';
            updateMinesSummary();
        }
    });
};

function clickMineCell(index) {
    if (!minesGameActive) return;
    var cell = document.getElementById('mine_cell_' + index);
    if (cell.disabled || minesOpened.indexOf(index) !== -1) return;

    cell.disabled = true;

    if (minesMap[index]) {
        cell.classList.add('exploded');
        cell.textContent = '💣';
        endMinesGame(false);
    } else {
        cell.classList.add('safe');
        cell.textContent = '💎';
        minesOpened.push(index);

        var newMultiplier = MINES_MULTIPLIERS[minesOpened.length];
        document.getElementById('minesOpenedCount').textContent = minesOpened.length + '/22';
        document.getElementById('minesCurrentMultiplier').textContent = newMultiplier.toFixed(2) + 'x';
        updateMinesSummary();

        if (minesOpened.length === 22) {
            endMinesGame(true);
        }
    }
}

window.cashoutMines = function() {
    if (!minesGameActive || minesOpened.length === 0) return;
    endMinesGame(true);
};

function endMinesGame(isWin) {
    minesGameActive = false;
    var startBtn = document.getElementById('minesStartBtn');
    var cashoutBtn = document.getElementById('minesCashoutBtn');
    var betInput = document.getElementById('minesBetInput');
    var minesMsg = document.getElementById('minesMessage');

    startBtn.disabled = false;
    betInput.disabled = false;
    cashoutBtn.disabled = true;

    for (var i = 0; i < 25; i++) {
        var cell = document.getElementById('mine_cell_' + i);
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
        var mult = MINES_MULTIPLIERS[minesOpened.length];
        var winnings = Math.floor(minesCurrentBet * mult);

        db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
            return parseFloat(((current || 0) + winnings).toFixed(3));
        });

        minesMsg.innerHTML = '🎉 Забрали <span style="color:#00ff88">' + winnings + ' ₽</span> (' + mult.toFixed(2) + 'x)';
    } else {
        minesMsg.innerHTML = '💥 Бабах! Вы проиграли <span style="color:#ff1744">' + minesCurrentBet + ' ₽</span>';
    }
}

// ======= ИГРА 3: БАШНЯ СТРАХА =======
function initImpMinesUI() {
    var container = document.getElementById('impMinesRowsContainer');
    if (!container) return;
    container.innerHTML = '';

    for (var i = 5; i >= 0; i--) {
        var rowData = impMinesData[i];
        var rowDiv = document.createElement('div');
        rowDiv.className = 'imp-row locked';
        rowDiv.id = 'imp_row_' + i;

        var multLabel = document.createElement('div');
        multLabel.className = 'row-multiplier';
        multLabel.id = 'imp_label_' + i; 
        rowDiv.appendChild(multLabel);

        for (var j = 0; j < rowData.cells; j++) {
            var btn = document.createElement('button');
            btn.className = 'imp-cell';
            btn.id = 'imp_cell_' + i + '_' + j;
            (function(row, col) {
                btn.onclick = function() { clickImpCell(row, col); };
            })(i, j);
            rowDiv.appendChild(btn);
        }
        container.appendChild(rowDiv);
    }
    updateImpMinesLabels();
}

function updateImpMinesLabels() {
    var betInput = document.getElementById('impBetInput');
    if (!betInput) return;
    var bet = parseInt(betInput.value) || 0;

    for (var i = 0; i < 6; i++) {
        var label = document.getElementById('imp_label_' + i);
        if (label) {
            var rowData = impMinesData[i];
            var possibleWin = Math.floor(bet * rowData.mult);
            label.innerHTML = '<span style="color:#00E676;">x' + rowData.mult + ' <span style="color:#ff1744;">💣' + rowData.mines + '</span></span><span style="color:#FFC400; font-size:0.75rem;">+' + possibleWin + ' ₽</span>';
        }
    }
}

window.startImpMines = function() {
    if (impGameActive) return;

    var betInput = document.getElementById('impBetInput');
    var startBtn = document.getElementById('impStartBtn');
    var cashoutBtn = document.getElementById('impCashoutBtn');
    var impMsg = document.getElementById('impMessage');

    var bet = parseInt(betInput.value) || 0;
    var me = players[myPlayerId];
    var balance = me ? (me.balance || 0) : 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно баланса!');
        return;
    }

    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, function(error, committed) {
        if (committed) {
            impBet = bet;
            impGameActive = true;
            impCurrentRow = 0;
            impBoard = [];

            for (var i = 0; i < 6; i++) {
                var rowConf = impMinesData[i];
                var rowMines = new Array(rowConf.cells).fill(false);
                var placed = 0;
                while (placed < rowConf.mines) {
                    var r = Math.floor(Math.random() * rowConf.cells);
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
            impMsg.textContent = 'Начните с самого нижнего ряда!';
            impMsg.style.color = '#00E5FF';

            for (var k = 0; k < 6; k++) {
                var rDiv = document.getElementById('imp_row_' + k);
                rDiv.className = (k === 0) ? 'imp-row active' : 'imp-row locked';
                
                var cells = rDiv.getElementsByClassName('imp-cell');
                for (var c = 0; c < cells.length; c++) {
                    cells[c].className = 'imp-cell';
                    cells[c].textContent = '';
                }
            }
        }
    });
};

function clickImpCell(rowIdx, cellIdx) {
    if (!impGameActive || rowIdx !== impCurrentRow) return;

    var cellBtn = document.getElementById('imp_cell_' + rowIdx + '_' + cellIdx);
    var isMine = impBoard[rowIdx][cellIdx];
    var impMsg = document.getElementById('impMessage');
    var cashoutBtn = document.getElementById('impCashoutBtn');

    if (isMine) {
        cellBtn.classList.add('lose');
        cellBtn.textContent = '💣';
        endImpGame(false);
    } else {
        cellBtn.classList.add('win');
        cellBtn.textContent = '💎';
        
        var currentMult = impMinesData[rowIdx].mult;
        var currentWin = Math.floor(impBet * currentMult);
        
        cashoutBtn.disabled = false;
        cashoutBtn.textContent = 'Забрать ' + currentWin + ' ₽';

        if (rowIdx < 5) {
            document.getElementById('imp_row_' + rowIdx).className = 'imp-row passed';
            impCurrentRow++;
            document.getElementById('imp_row_' + impCurrentRow).className = 'imp-row active';
            impMsg.textContent = 'Ряд ' + (rowIdx + 1) + ' пройден! Поднимайтесь выше.';
            impMsg.style.color = '#00E676';
        } else {
            endImpGame(true);
        }
    }
}

window.cashoutImpMines = function() {
    if (!impGameActive) return;
    endImpGame(true);
};

function endImpGame(isWin) {
    impGameActive = false;
    var startBtn = document.getElementById('impStartBtn');
    var cashoutBtn = document.getElementById('impCashoutBtn');
    var betInput = document.getElementById('impBetInput');
    var impMsg = document.getElementById('impMessage');

    startBtn.disabled = false;
    betInput.disabled = false;
    cashoutBtn.disabled = true;

    var finalMult = 0;
    if (isWin) {
        var row5 = document.getElementById('imp_row_5');
        var row5Cells = row5 ? Array.from(row5.getElementsByClassName('imp-cell')) : [];
        var finishedLastRow = row5Cells.some(function(c) { return c.classList.contains('win'); });

        if (finishedLastRow) {
            finalMult = impMinesData[5].mult; 
        } else if (impCurrentRow > 0) {
            finalMult = impMinesData[impCurrentRow - 1].mult;
        }
    }

    var winnings = Math.floor(impBet * finalMult);

    if (isWin && winnings > 0) {
        db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
            return parseFloat(((current || 0) + winnings).toFixed(3));
        });
        impMsg.innerHTML = '🎉 ПОБЕДА! Вы забрали <span style="color:#00ff88">' + winnings + ' ₽</span>';
    } else if (!isWin) {
        impMsg.innerHTML = '💥 ВЗРЫВ! Ваша ставка <span style="color:#ff1744">' + impBet + ' ₽</span> сгорела.';
    }

    for (var i = 0; i < 6; i++) {
        var row = document.getElementById('imp_row_' + i);
        if (row) row.classList.remove('locked', 'active');
        for (var j = 0; j < impBoard[i].length; j++) {
            var cell = document.getElementById('imp_cell_' + i + '_' + j);
            if (cell) {
                var isMine = impBoard[i][j];
                if (isMine) {
                    if (!cell.classList.contains('lose')) cell.textContent = '💣';
                } else {
                    if (!cell.classList.contains('win')) cell.textContent = '💎';
                }
            }
        }
    }
}

// ======= ИГРА 4: КОЛЕСО УДАЧИ (С ПОДДЕРЖКОЙ CANVAS ДЛЯ ТГ) =======
window.selectSpPercent = function(pct) {
    if (spIsSpinning) return;
    
    spSelectedPercent = pct;
    var buttons = document.querySelectorAll('.sp-pct-btn');
    buttons.forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.textContent.indexOf(pct + '%') !== -1) {
            btn.classList.add('active');
        }
    });

    drawSpWheel(0);
    updateSpSummary();
};

function drawSpWheel(offsetAngle) {
    var canvas = document.getElementById('spWheelCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 240, 240);

    var winPct = spSelectedPercent;
    var winAngle = (winPct / 100) * Math.PI * 2;

    ctx.save();
    ctx.translate(120, 120);
    ctx.rotate(offsetAngle - Math.PI / 2); // Смещение начала вверх

    // Сектор Победы (Зеленый)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 110, 0, winAngle);
    ctx.fillStyle = '#00E676';
    ctx.fill();

    // Сектор Проигрыша (Красный)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 110, winAngle, Math.PI * 2);
    ctx.fillStyle = '#FF1744';
    ctx.fill();

    ctx.restore();

    // Центр колеса
    ctx.beginPath();
    ctx.arc(120, 120, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#110e1a';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WIN', 120, 120);
}

function updateSpSummary() {
    var betInput = document.getElementById('spBetInput');
    var summaryChance = document.getElementById('summaryChance');
    var summaryWin = document.getElementById('summaryWin');

    if (!betInput || !summaryChance || !summaryWin) return;

    var bet = parseInt(betInput.value) || 0;
    var rule = SP_RULES[spSelectedPercent];
    
    summaryChance.textContent = spSelectedPercent + '%';
    if (rule) {
        var possiblePayout = Math.floor(bet * rule.mult);
        summaryWin.textContent = possiblePayout + ' ₽';
    }
}

window.spinSingleplayerWheel = function() {
    if (spIsSpinning) return;

    var betInput = document.getElementById('spBetInput');
    var spinBtn = document.getElementById('spSpinBtn');
    var spMsg = document.getElementById('spMessage');
    
    var bet = parseInt(betInput.value) || 0;
    var me = players[myPlayerId];
    var balance = me ? (me.balance || 0) : 0;

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

    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, function(error, committed) {
        if (committed) {
            var start = Date.now();
            var duration = 4000;
            var targetRotation = Math.PI * 10 + Math.random() * Math.PI * 2;

            function animate() {
                var now = Date.now();
                var elapsed = now - start;
                if (elapsed < duration) {
                    var progress = elapsed / duration;
                    // Ease out cubic
                    var ease = 1 - Math.pow(1 - progress, 3);
                    var currentAngle = targetRotation * ease;
                    drawSpWheel(currentAngle);
                    requestAnimationFrame(animate);
                } else {
                    drawSpWheel(targetRotation);
                    evaluateSpResult(targetRotation, bet);
                }
            }
            requestAnimationFrame(animate);
        } else {
            spIsSpinning = false;
            spinBtn.disabled = false;
            betInput.disabled = false;
            spMsg.textContent = 'Ошибка.';
        }
    });
};

function evaluateSpResult(finalAngle, bet) {
    var spinBtn = document.getElementById('spSpinBtn');
    var betInput = document.getElementById('spBetInput');
    var spMsg = document.getElementById('spMessage');

    // Направление на маркер (верхняя точка = -PI/2)
    var netRotation = finalAngle % (Math.PI * 2);
    var markerAngle = (Math.PI * 2.5 - netRotation) % (Math.PI * 2);

    var playerBoundary = (spSelectedPercent / 100) * Math.PI * 2;
    var isPlayerWinner = markerAngle <= playerBoundary;

    if (isPlayerWinner) {
        var rule = SP_RULES[spSelectedPercent];
        var prize = Math.floor(bet * rule.mult);

        db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
            return parseFloat(((current || 0) + prize).toFixed(3));
        });

        spMsg.innerHTML = '🎉 ВЫ ПОБЕДИЛИ! Получено: <span style="color:#00E676">+' + prize + ' ₽</span>';
    } else {
        spMsg.innerHTML = '🔴 ВЫ ПРОИГРАЛИ! <span style="color:#ff1744">-' + bet + ' ₽</span>';
    }

    spIsSpinning = false;
    spinBtn.disabled = false;
    betInput.disabled = false;
}

// ======= ИГРА 5: МУЛЬТИПЛЕЕР (КАЛЬМАР) =======
function placeBet() {
    var status = gameState.status || 'betting';
    if (status !== 'betting') {
        alert('Ставки закрыты!');
        return;
    }

    var name = playerNameInput ? playerNameInput.value.trim() : '';
    var amount = betAmountInput ? parseInt(betAmountInput.value) : NaN;

    if (!name) {
        alert('Введите имя!');
        return;
    }
    if (isNaN(amount) || amount < MIN_BET) {
        alert('Минимальная ставка — ' + MIN_BET + ' ₽!');
        return;
    }

    var myData = players[myPlayerId] || { balance: 0 };
    var myCurrentBalance = myData.balance || 0;

    if (amount > myCurrentBalance) {
        alert('Недостаточно средств!');
        return;
    }

    try {
        localStorage.setItem('roulette_player_name', name);
    } catch(e){}

    var newBalance = parseFloat((myCurrentBalance - amount).toFixed(3));
    var currentBet = myData.totalBet || 0;
    var playerColor = DISTINCT_COLORS[Object.keys(players).length % DISTINCT_COLORS.length];

    db.ref('players/' + myPlayerId).update({
        name: name,
        color: myData.color || playerColor,
        totalBet: currentBet + amount,
        balance: newBalance
    });

    if (betAmountInput) betAmountInput.value = '';
}

function syncGameWithDatabase() {
    var status = gameState.status || 'betting';
    var totalBank = calculateTotalBank();

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
                gameMessage.textContent = 'Время ставок началось!';
                gameMessage.style.color = '#61dafb';
            }
            startLocalTimer(gameState.timerEnd);
        } else {
            if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
            if (gameMessage) {
                gameMessage.textContent = 'Ждем ставки...';
                gameMessage.style.color = 'white';
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
        }
        if (!animationFrameId) {
            startLocalRound(gameState.launchAngle);
        }
    } 
    else if (status === 'finished') {
        stopLocalTimer();
        if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
        
        if (gameMessage) {
            gameMessage.style.color = 'black';
            gameMessage.style.backgroundColor = gameState.winnerColor || '#61dafb';
            gameMessage.textContent = 'Победил: ' + gameState.winnerName + ' (+' + gameState.winnerPrize + ' ₽)';
        }
        renderWheelSections();
    }
}

function startLocalTimer(timerEnd) {
    stopLocalTimer();
    timerInterval = setInterval(function() {
        var timeLeft = Math.max(0, Math.ceil((timerEnd - getServerTime()) / 1000));
        if (bettingTimerDisplay) bettingTimerDisplay.textContent = timeLeft;
    }, 200);
}

function stopLocalTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function generateDeterministicPath(angle, sx, sy) {
    var x = sx;
    var y = sy;
    var vx = Math.cos(angle) * BALL_MAX_SPEED;
    var vy = Math.sin(angle) * BALL_MAX_SPEED;
    
    var path = [];
    var iterations = 0;

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
    var seedX = Math.sin(launchAngle) * 10000;
    var randX = seedX - Math.floor(seedX);
    var seedY = Math.cos(launchAngle) * 20000;
    var randY = seedY - Math.floor(seedY);

    ballStartX = 80 + Math.floor(randX * 240); 
    ballStartY = 80 + Math.floor(randY * 240);

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
        var rect = gameAreaWrapper.getBoundingClientRect();
        var borderSize = 3;
        var actualSize = rect.width - (borderSize * 2);
        var scale = actualSize / VIRTUAL_WIDTH;

        var screenX = ballX * scale;
        var screenY = ballY * scale;
        var screenRadius = VIRTUAL_RADIUS * scale;

        ball.style.width = (screenRadius * 2) + 'px';
        ball.style.height = (screenRadius * 2) + 'px';
        ball.style.left = (screenX - screenRadius) + 'px';
        ball.style.top = (screenY - screenRadius) + 'px';
    }
}

function animateDeterministicBall() {
    try {
        var elapsed = Date.now() - animStartTime;

        if (arrowSpinning) {
            arrowAngle = (elapsed / arrowSpinDuration) * Math.PI * 6; 
            renderWheelSections();
            if (elapsed >= arrowSpinDuration) {
                arrowSpinning = false;
                arrowHold = true; 
                animStartTime = Date.now(); 
            }
            animationFrameId = requestAnimationFrame(animateDeterministicBall);
            return;
        }

        if (arrowHold) {
            arrowAngle = gameState.launchAngle; 
            renderWheelSections();
            if (elapsed >= 1000) { 
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

        var targetFps = 60;
        var frameIndex = Math.floor((elapsed / 1000) * targetFps);

        if (frameIndex < currentPath.length) {
            var coord = currentPath[frameIndex];
            ballX = coord.x;
            ballY = coord.y;

            updateBallDOMPosition();
            renderWheelSections(); 
            animationFrameId = requestAnimationFrame(animateDeterministicBall);
        } else {
            var finalCoord = currentPath[currentPath.length - 1];
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
    var segments = getPlayersWithSegments();
    var winner = null;
    var totalBank = calculateTotalBank();

    var finalXCanvas = (ballX + ballY - 400) * Math.SQRT1_2;

    if (segments.length > 0) {
        for (var i = 0; i < segments.length; i++) {
            var p = segments[i];
            if (finalXCanvas >= p.startX && finalXCanvas <= p.endX) {
                winner = p;
                break;
            }
        }
        if (!winner) winner = segments[segments.length - 1]; 
    }

    if (winner) {
        var defaultPrize = totalBank * 0.85; 
        var finalPrize = defaultPrize;

        if (defaultPrize < winner.totalBet) {
            var otherBets = totalBank - winner.totalBet; 
            finalPrize = winner.totalBet + (otherBets * 0.85); 
        }

        finalPrize = Math.floor(finalPrize); 

        db.ref('players/' + winner.id + '/balance').transaction(function(current) {
            return parseFloat(((current || 0) + finalPrize).toFixed(3));
        });

        var chancePct = ((winner.totalBet / totalBank) * 100).toFixed(0);

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

    setTimeout(function() {
        if (isHost()) {
            resetRoomForNextRound();
        }
    }, 6000);
}

function resetRoomForNextRound() {
    var updatedPlayers = {};
    var shuffledColors = DISTINCT_COLORS.slice().sort(function() { return Math.random() - 0.5; });

    var colorIndex = 0;
    for (var id in players) {
        if (onlinePlayers.indexOf(id) !== -1) {
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
    var activeKeys = Object.keys(players).filter(function(id) { return players[id].totalBet > 0; });
    var active = [];
    for (var i = 0; i < activeKeys.length; i++) {
        var id = activeKeys[i];
        var p = players[id];
        active.push({
            id: id,
            name: p.name,
            color: p.color,
            totalBet: p.totalBet,
            balance: p.balance
        });
    }
    active.sort(function(a, b) { return a.id.localeCompare(b.id); });

    var totalB = active.reduce(function(sum, p) { return sum + p.totalBet; }, 0);
    if (active.length === 0 || totalB === 0) return [];

    var L = 400 * Math.SQRT2; 
    var minW = Math.min(30, L / (active.length + 1)); 
    var totalMin = active.length * minW;
    var remainingL = L - totalMin;

    var currentX = -L / 2;
    return active.map(function(p) {
        var width = minW + remainingL * (p.totalBet / totalB);
        var startX = currentX;
        var endX = currentX + width;
        currentX = endX;
        return Object.assign({}, p, { startX: startX, endX: endX, width: width });
    });
}

function getPlayerAtCoords(bx, by, segments) {
    var finalX = (bx + by - 400) * Math.SQRT1_2;
    for (var i = 0; i < segments.length; i++) {
        var p = segments[i];
        if (finalX >= p.startX && finalX <= p.endX) {
            return p;
        }
    }
    return null;
}

function renderWheelSections() {
    var canvas = document.getElementById('gameCanvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return; 

    try {
        ctx.clearRect(0, 0, 400, 400);
        var segments = getPlayersWithSegments();

        if (segments.length === 0) {
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, 400, 400);
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 2;
            for (var i = 0; i <= 400; i += 40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 400); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(400, i); ctx.stroke();
            }
            return;
        }

        var L = 400 * Math.SQRT2; 

        ctx.save();
        ctx.translate(200, 200);
        ctx.rotate(Math.PI / 4); 

        segments.forEach(function(p) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.startX, -L, p.width, L * 2);

            // КРАСИВАЯ ПОДСВЕТКА И ЖИРНАЯ ЗОЛОТАЯ ОБВОДКА ПОБЕДИТЕЛЯ
            if (gameState.status === 'finished' && gameState.winnerName === p.name) {
                var glow = Math.sin(Date.now() * 0.015) * 0.25 + 0.5;
                ctx.fillStyle = 'rgba(255, 255, 255, ' + glow + ')';
                ctx.fillRect(p.startX, -L, p.width, L * 2);

                // Ограничительная обводка сектора
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 10;
                ctx.strokeRect(p.startX, -L, p.width, L * 2);

                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 3;
                ctx.strokeRect(p.startX, -L, p.width, L * 2);
            }
        });
        ctx.restore();

        segments.forEach(function(p, idx) {
            var u = p.startX + p.width / 2;
            var v = (idx % 2 === 0) ? 80 : -80; 
            
            var rx = 200 + (u * Math.cos(Math.PI/4) - v * Math.sin(Math.PI/4));
            var ry = 200 + (u * Math.sin(Math.PI/4) + v * Math.cos(Math.PI/4));

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

        if (!arrowSpinning && !arrowHold && gameState.status === 'running') {
            var activePlayer = getPlayerAtCoords(ballX, ballY, segments);
            if (activePlayer) {
                ctx.font = 'bold 11px Segoe UI, sans-serif';
                var text = activePlayer.name;
                var textMetrics = ctx.measureText(text);
                var textW = textMetrics.width;
                var tagW = textW + 12;
                var tagH = 18;
                var tx = ballX;
                var ty = ballY - VIRTUAL_RADIUS - tagH/2 - 4;

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
        console.error("Ошибка Canvas:", e);
    }
}


// ======= ИГРА 6: ВЗЛЕТ РАКЕТЫ V3 =======
function generateCrashMultiplier() {
    var rand = Math.random();
    if (rand < 0.05) return 1.00;
    else if (rand < 0.40) return parseFloat((1.01 + Math.random() * 0.38).toFixed(2));
    else if (rand < 0.85) return parseFloat((1.40 + Math.random() * 2.60).toFixed(2));
    else if (rand < 0.95) return parseFloat((4.01 + Math.random() * 10.99).toFixed(2));
    else if (rand < 0.99) return parseFloat((15.01 + Math.random() * 34.99).toFixed(2));
    else return parseFloat((50.01 + Math.random() * 282.99).toFixed(2));
}

function getRocketMult(elapsed, crashMult) {
    if (elapsed <= 0) return 1.0;
    var t_10 = Math.log(10) / 0.07;
    if (crashMult >= 20 && elapsed > t_10) {
        return 10 * Math.exp(0.22 * (elapsed - t_10));
    }
    return Math.exp(elapsed * 0.07);
}

window.toggleRocketAuto = function(panelIdx) {
    var suffix = panelIdx === 2 ? '2' : '';
    var toggle = document.getElementById('rocketAutoToggle' + suffix);
    var controls = document.getElementById('rocketAutoControls' + suffix);
    if (!toggle || !controls) return;

    if (panelIdx === 2) rocketAuto2Enabled = toggle.checked;
    else rocketAuto1Enabled = toggle.checked;
    
    if (toggle.checked) {
        controls.style.opacity = '1';
        controls.style.pointerEvents = 'auto';
    } else {
        controls.style.opacity = '0.35';
        controls.style.pointerEvents = 'none';
    }
};

window.changeRocketAutoMult = function(panelIdx, amount) {
    var currentVal = (panelIdx === 2) ? rocketAuto2Multiplier : rocketAuto1Multiplier;
    var newVal = parseFloat((currentVal + amount).toFixed(1));
    
    if (newVal < 1.1) newVal = 1.1; 
    
    if (panelIdx === 2) {
        rocketAuto2Multiplier = newVal;
        var valEl = document.getElementById('rocketAutoValue2');
        if (valEl) valEl.textContent = rocketAuto2Multiplier.toFixed(1) + 'x';
        var minusEl = document.getElementById('rocketAutoMinus2');
        if (minusEl) minusEl.disabled = (rocketAuto2Multiplier <= 1.1);
    } else {
        rocketAuto1Multiplier = newVal;
        var valEl = document.getElementById('rocketAutoValue');
        if (valEl) valEl.textContent = rocketAuto1Multiplier.toFixed(1) + 'x';
        var minusEl = document.getElementById('rocketAutoMinus');
        if (minusEl) minusEl.disabled = (rocketAuto1Multiplier <= 1.1);
    }
};

function updateRocketUIElements() {
    var status = rocketState ? (rocketState.status || 'betting') : 'betting';
    var btn1 = document.getElementById('rocketBetBtn');
    var btn2 = document.getElementById('rocketBet2Btn');
    var input1 = document.getElementById('rocketBetInput');
    var input2 = document.getElementById('rocketBetInput2');

    if (status === 'betting') {
        if (input1) input1.disabled = false;
        if (input2) input2.disabled = false;

        if (btn1) {
            btn1.disabled = rocketBet1Active;
            btn1.textContent = rocketBet1Active ? 'Принята 1' : 'Поставить 1';
            btn1.className = 'rocket-pnl-btn btn-bet';
        }
        if (btn2) {
            btn2.disabled = rocketBet2Active;
            btn2.textContent = rocketBet2Active ? 'Принята 2' : 'Поставить 2';
            btn2.className = 'rocket-pnl-btn btn-bet';
        }
    } else if (status === 'flying') {
        if (input1) input1.disabled = true;
        if (input2) input2.disabled = true;

        if (btn1) {
            if (rocketBet1Active && !rocketBet1Cashed) {
                btn1.disabled = false;
                btn1.textContent = 'Забрать 1';
                btn1.className = 'rocket-pnl-btn btn-cash';
            } else {
                btn1.disabled = true;
                btn1.textContent = rocketBet1Cashed ? 'Забрано!' : 'Пропуск';
            }
        }
        if (btn2) {
            if (rocketBet2Active && !rocketBet2Cashed) {
                btn2.disabled = false;
                btn2.textContent = 'Забрать 2';
                btn2.className = 'rocket-pnl-btn btn-cash';
            } else {
                btn2.disabled = true;
                btn2.textContent = rocketBet2Cashed ? 'Забрано!' : 'Пропуск';
            }
        }
    } else {
        if (input1) input1.disabled = true;
        if (input2) input2.disabled = true;
        if (btn1) { btn1.disabled = true; btn1.textContent = 'Взрыв!'; }
        if (btn2) { btn2.disabled = true; btn2.textContent = 'Взрыв!'; }
    }
}

window.actionRocketBet = function(panelIdx) {
    var status = rocketState ? (rocketState.status || 'betting') : 'betting';
    
    if (status === 'betting') {
        var idx = panelIdx === 2 ? '2' : '';
        var betInput = document.getElementById('rocketBetInput' + idx);
        if (!betInput) return;
        var amount = parseInt(betInput.value) || 0;
        var me = players[myPlayerId];
        var balance = me ? (me.balance || 0) : 0;

        if (isNaN(amount) || amount < 5) {
            alert('Минимальная ставка — 5 ₽!');
            return;
        }
        if (amount > balance) {
            alert('Недостаточно средств!');
            return;
        }

        db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
            return parseFloat(((current || 0) - amount).toFixed(3));
        }, function(error, committed) {
            if (committed) {
                if (panelIdx === 1) {
                    rocketBet1Active = true;
                    rocketBet1Amount = amount;
                    rocketBet1Cashed = false;
                } else {
                    rocketBet2Active = true;
                    rocketBet2Amount = amount;
                    rocketBet2Cashed = false;
                }

                var myData = players[myPlayerId] || { name: 'Игрок', color: '#BA68C8' };
                var updates = {};
                updates['rocketBetsV3/' + myPlayerId + '/name'] = myData.name || "Игрок";
                updates['rocketBetsV3/' + myPlayerId + '/color'] = myData.color || '#BA68C8';
                updates['rocketBetsV3/' + myPlayerId + '/bet' + panelIdx] = {
                    betAmount: amount,
                    status: 'active',
                    cashoutMult: 0
                };

                db.ref().update(updates);
                showToast("Ставка " + panelIdx + " принята", amount + " ₽ добавлены в раунд.");
            }
        });
    } else if (status === 'flying') {
        cashoutRocketBet(panelIdx);
    }
};

function cashoutRocketBet(panelIdx, forcedMult) {
    var isActive = (panelIdx === 1) ? rocketBet1Active : rocketBet2Active;
    var isCashed = (panelIdx === 1) ? rocketBet1Cashed : rocketBet2Cashed;
    var betAmt = (panelIdx === 1) ? rocketBet1Amount : rocketBet2Amount;

    if (!isActive || isCashed || rocketState.status !== 'flying') return;

    var now = getServerTime();
    var elapsed = (now - rocketState.launchTime) / 1000;
    var liveMult = parseFloat(getRocketMult(elapsed, rocketState.crashMult).toFixed(2));

    var currentMult = forcedMult ? parseFloat(forcedMult.toFixed(1)) : liveMult;

    if (liveMult >= rocketState.crashMult) {
        if (forcedMult && rocketState.crashMult >= forcedMult) {
            // Успешный автовывод
        } else {
            return; 
        }
    }

    if (panelIdx === 1) rocketBet1Cashed = true;
    else rocketBet2Cashed = true;

    var winnings = parseFloat((betAmt * currentMult).toFixed(2));

    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) + winnings).toFixed(3));
    }, function(error, committed) {
        if (committed) {
            db.ref('rocketBetsV3/' + myPlayerId + '/bet' + panelIdx).update({
                status: 'cashed',
                cashoutMult: currentMult
            });
            showToast("Успешно!", "Забрали ставку " + panelIdx + " на x" + currentMult + " (+" + winnings + " ₽)");
        }
    });
}

function syncRocketState() {
    var timerOverlay = document.getElementById('rocketTimerOverlay');
    var rocketActor = document.getElementById('rocketActor');
    var multDisp = document.getElementById('rocketMultiplierDisplay');
    var explosion = document.getElementById('rocketExplosion');
    var msg = document.getElementById('rocketMessage');
    var stars = document.querySelector('.stars-container');
    var status = rocketState ? (rocketState.status || 'betting') : 'betting';

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
            multDisp.textContent = (rocketState.crashMult ? rocketState.crashMult.toFixed(2) : '1.00') + 'x';
            multDisp.style.color = '#ff1744';
        }

        if (msg) {
            var finalMult = rocketState.crashMult ? rocketState.crashMult.toFixed(2) : '1.00';
            msg.innerHTML = '💥 Взрыв на <span style="color:#ff1744; font-weight:bold;">' + finalMult + 'x</span>';
        }
    }
    updateRocketUIElements();
}

function startRocketBettingTimer(timerEnd) {
    if (rocketTimerInterval) clearInterval(rocketTimerInterval);
    var timerOverlay = document.getElementById('rocketTimerOverlay');
    var msg = document.getElementById('rocketMessage');

    rocketTimerInterval = setInterval(function() {
        var now = getServerTime();
        var timeLeft = Math.max(0, (timerEnd - now) / 1000);
        
        if (timerOverlay) timerOverlay.textContent = Math.ceil(timeLeft);

        if (msg) {
            msg.textContent = 'Запуск ракеты через: ' + timeLeft.toFixed(1) + 'с';
            msg.style.color = '#D500F9';
        }
    }, 100);
}

function startRocketFlightAnimation(launchTime) {
    var rocketActor = document.getElementById('rocketActor');
    var multDisp = document.getElementById('rocketMultiplierDisplay');

    if (multDisp) multDisp.style.display = 'block';

    function tick() {
        var now = getServerTime();
        var elapsed = (now - launchTime) / 1000;
        
        if (elapsed < 0) {
            rocketLoopId = requestAnimationFrame(tick);
            return;
        }

        var currentMult = getRocketMult(elapsed, rocketState.crashMult);

        if (multDisp && rocketState.status === 'flying') {
            multDisp.textContent = currentMult.toFixed(2) + 'x';
            multDisp.style.color = '#00FF88';
        }

        if (rocketActor) {
            var verticalPos = Math.min(130, 20 + elapsed * 10);
            rocketActor.style.bottom = verticalPos + 'px';
        }

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
    var listContainer = document.getElementById('rocketBetsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    var list = Object.entries(betsData);
    if (list.length === 0) {
        listContainer.innerHTML = '<div class="bet-placeholder">Ставок еще нет...</div>';
        return;
    }

    list.forEach(function(item) {
        var pId = item[0];
        var record = item[1];
        if (record.bet1) {
            var div1 = document.createElement('div');
            div1.className = 'bet-item';
            div1.style.borderLeft = '4px solid ' + record.color;
            var statusText = record.bet1.status === 'active' ? '<span style="color:#aaa">В полете...</span>' : '<span style="color:#00E676; font-weight:bold;">Забрал x' + record.bet1.cashoutMult.toFixed(2) + '</span>';
            div1.innerHTML = `
                <div class="avatar" style="background:${record.color}">${record.name[0].toUpperCase()}</div>
                <div class="bet-info"><strong>${record.name} (Ставка 1)</strong><span>Ставка: ${record.bet1.betAmount} ₽</span></div>
                <div class="bet-chance">${statusText}</div>
            `;
            listContainer.appendChild(div1);
        }

        if (record.bet2) {
            var div2 = document.createElement('div');
            div2.className = 'bet-item';
            div2.style.borderLeft = '4px solid ' + record.color;
            var statusText = record.bet2.status === 'active' ? '<span style="color:#aaa">В полете...</span>' : '<span style="color:#00E676; font-weight:bold;">Забрал x' + record.bet2.cashoutMult.toFixed(2) + '</span>';
            div2.innerHTML = `
                <div class="avatar" style="background:${record.color}">${record.name[0].toUpperCase()}</div>
                <div class="bet-info"><strong>${record.name} (Ставка 2)</strong><span>Ставка: ${record.bet2.betAmount} ₽</span></div>
                <div class="bet-chance">${statusText}</div>
            `;
            listContainer.appendChild(div2);
        }
    });
}

function renderRocketHistory(historyList) {
    var bar = document.getElementById('rocketHistory');
    if (!bar) return;
    bar.innerHTML = '';
    var reversed = historyList.slice().reverse();
    reversed.forEach(function(val) {
        var span = document.createElement('span');
        span.className = 'rocket-hist-item';
        if (val < 1.5) span.className += ' mult-grey';
        else if (val < 5.0) span.className += ' mult-green';
        else if (val < 20.0) span.className += ' mult-gold';
        else span.className += ' mult-cyan';
        span.textContent = val.toFixed(2) + 'x';
        bar.appendChild(span);
    });
}


// ======= ИГРА 7: ГОНКА ДРОНОВ =======
window.selectDronesColor = function(color) {
    dronesSelectedColor = color;
    document.querySelectorAll('#dronesGameScreen .drone-choice-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    var activeBtn = document.getElementById('btnDrone_' + color);
    if (activeBtn) activeBtn.classList.add('active');
};

window.placeDronesBet = function() {
    if (dronesState.status !== 'betting') {
        alert('Ставки закрыты!');
        return;
    }
    if (dronesBetPlaced) {
        alert('Вы уже поставили в этом раунде!');
        return;
    }

    var input = document.getElementById('dronesBetInput');
    var amount = parseInt(input.value) || 0;
    var me = players[myPlayerId];
    var balance = me ? (me.balance || 0) : 0;

    if (amount < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (amount > balance) {
        alert('Недостаточно баланса!');
        return;
    }

    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) - amount).toFixed(3));
    }, function(error, committed) {
        if (committed) {
            db.ref('dronesBets/' + myPlayerId).set({
                name: players[myPlayerId].name || 'Игрок',
                amount: amount,
                color: dronesSelectedColor
            });
            showToast("Гонка Дронов", "Ставка зарегистрирована.");
        }
    });
};

function syncDronesState() {
    var status = dronesState.status || 'betting';
    var msg = document.getElementById('dronesMessage');
    var betBtn = document.getElementById('dronesBetBtn');

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
        if (msg) msg.textContent = 'Дроны взлетели!';
        if (dronesTimerInterval) { clearInterval(dronesTimerInterval); dronesTimerInterval = null; }
        startDronesAnimation(dronesState.launchTime, dronesState.seed);
    } 
    else if (status === 'finished') {
        if (betBtn) betBtn.disabled = true;
        if (dronesLoopId) { cancelAnimationFrame(dronesLoopId); dronesLoopId = null; }
        
        renderDronesTrack(true); 

        var colorRu = { red: 'Красный', blue: 'Синий', green: 'Зеленый', yellow: 'Желтый' };
        if (msg) {
            msg.innerHTML = '🏁 Победил <span style="color:' + DRONE_COLORS[dronesState.winnerColor] + '">' + colorRu[dronesState.winnerColor] + ' дрон</span>!';
        }

        if (dronesBetPlaced && dronesSelectedColor === dronesState.winnerColor) {
            var winnings = Math.floor(dronesMyBet * 3.6);
            showVictoryNotification('Дрон ' + colorRu[dronesState.winnerColor], winnings, DRONE_COLORS[dronesState.winnerColor]);
        }
    }
}

function startDronesBettingTimer(timerEnd) {
    if (dronesTimerInterval) clearInterval(dronesTimerInterval);
    var msg = document.getElementById('dronesMessage');

    dronesTimerInterval = setInterval(function() {
        var now = getServerTime();
        var timeLeft = Math.max(0, (timerEnd - now) / 1000);
        
        if (msg) {
            msg.textContent = 'До вылета: ' + Math.ceil(timeLeft) + 'с';
            msg.style.color = '#00FF88';
        }
    }, 200);
}

function getDronePosition(elapsed, seedValue, index) {
    var speed = 25; 
    var baseOffset = speed * elapsed;
    var microBoost = Math.sin(elapsed * 2.3 + index * 4.5 + seedValue) * 18;
    var microBoost2 = Math.cos(elapsed * 4.1 + index * 1.5 - seedValue) * 8;
    return Math.min(365, 30 + baseOffset + microBoost + microBoost2);
}

function drawDrone(ctx, x, y, color, elapsed) {
    ctx.save();
    
    // Световой шлейф
    var gradient = ctx.createLinearGradient(x - 40, y, x, y);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, color + '55');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(Math.max(30, x - 40), y);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Корпус
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
}

function startDronesAnimation(launchTime, seed) {
    var canvas = document.getElementById('dronesCanvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return;

    function tick() {
        var now = getServerTime();
        var elapsed = (now - launchTime) / 1000;

        ctx.clearRect(0, 0, 400, 200);

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (var i = 1; i < 4; i++) {
            var laneY = i * 50;
            ctx.beginPath();
            ctx.setLineDash([5, 10]);
            ctx.moveTo(0, laneY);
            ctx.lineTo(400, laneY);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Финишная шахматка
        ctx.fillStyle = '#fff';
        ctx.fillRect(365, 0, 10, 200);
        ctx.fillStyle = '#000';
        for (var y = 0; y < 200; y += 10) {
            ctx.fillRect(365, y + (y % 20 === 0 ? 0 : 10), 5, 10);
            ctx.fillRect(370, y + (y % 20 === 0 ? 10 : 0), 5, 10);
        }

        var colors = ['red', 'blue', 'green', 'yellow'];
        colors.forEach(function(col, idx) {
            var y = 25 + idx * 50;
            var x = getDronePosition(elapsed, seed, idx);
            drawDrone(ctx, x, y, DRONE_COLORS[col], elapsed);
        });

        if (dronesState.status === 'racing') {
            dronesLoopId = requestAnimationFrame(tick);
        }
    }
    dronesLoopId = requestAnimationFrame(tick);
}

function renderDronesTrack(finished) {
    if (finished === undefined) finished = false;
    var canvas = document.getElementById('dronesCanvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return;

    ctx.clearRect(0, 0, 400, 200);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (var i = 1; i < 4; i++) {
        var laneY = i * 50;
        ctx.beginPath();
        ctx.setLineDash([5, 10]);
        ctx.moveTo(0, laneY);
        ctx.lineTo(400, laneY);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Финиш
    ctx.fillStyle = '#fff';
    ctx.fillRect(365, 0, 10, 200);
    ctx.fillStyle = '#000';
    for (var y = 0; y < 200; y += 10) {
        ctx.fillRect(365, y + (y % 20 === 0 ? 0 : 10), 5, 10);
        ctx.fillRect(370, y + (y % 20 === 0 ? 10 : 0), 5, 10);
    }

    var colors = ['red', 'blue', 'green', 'yellow'];
    colors.forEach(function(col, idx) {
        var y = 25 + idx * 50;
        var x = (finished && dronesState.winnerColor === col) ? 365 : 30;
        drawDrone(ctx, x, y, DRONE_COLORS[col], 0);
    });
}

function renderDronesBetsList(bets) {
    var bar = document.getElementById('dronesBetsList');
    if (!bar) return;
    bar.innerHTML = '';
    var list = Object.values(bets);
    if (list.length === 0) {
        bar.innerHTML = '<div class="bet-placeholder">Ставок нет</div>';
        return;
    }
    list.forEach(function(b) {
        var div = document.createElement('div');
        div.className = 'bet-item';
        div.style.borderLeft = '4px solid ' + DRONE_COLORS[b.color];
        div.innerHTML = `
            <div class="avatar" style="background:${DRONE_COLORS[b.color]}">🛸</div>
            <div class="bet-info"><strong>${b.name}</strong><span>Ставка: ${b.amount} ₽</span></div>
            <div class="bet-chance" style="color:${DRONE_COLORS[b.color]}">${b.color.toUpperCase()}</div>
        `;
        bar.appendChild(div);
    });
}

function renderDronesHistoryBar(hist) {
    var bar = document.getElementById('dronesHistory');
    if (!bar) return;
    bar.innerHTML = '';
    var reversed = hist.slice().reverse().slice(0, 10);
    reversed.forEach(function(val) {
        var span = document.createElement('span');
        span.className = 'rocket-hist-item';
        span.style.background = DRONE_COLORS[val];
        span.style.color = '#000';
        span.textContent = val.toUpperCase();
        bar.appendChild(span);
    });
}


// ======= ШУТОЧНЫЙ ВЫВОД СРЕДСТВ =======
window.requestWithdraw = function() {
    var card = document.getElementById('withdrawCardInput').value.trim();
    var bank = document.getElementById('withdrawBankInput').value.trim();
    var amountInput = document.getElementById('withdrawAmountInput');
    var amount = parseFloat(amountInput.value) || 0;
    
    var me = players[myPlayerId];
    var balance = me ? (me.balance || 0) : 0;

    if (!card || !bank) {
        alert('Пожалуйста, заполните все поля!');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert('Введите корректную сумму для вывода средств!');
        return;
    }
    if (amount > balance) {
        alert('Недостаточно средств!');
        return;
    }

    db.ref('players/' + myPlayerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) - amount).toFixed(3));
    }, function(error, committed) {
        if (committed) {
            alert(
                "Ваша выплата оформлена. Ожидайте зачисления по СБП на указанные реквизиты.\n\n" +
                "Срок обработки транзакции: до 24 часов."
            );
            
            document.getElementById('withdrawCardInput').value = '';
            document.getElementById('withdrawBankInput').value = '';
            amountInput.value = '';

            showScreen('lobbyScreen');
        } else {
            alert('Ошибка выполнения транзакции.');
        }
    });
};

// ======= СИСТЕМА ДЕПОЗИТОВ И АДМИН-ПАНЕЛЬ =======
window.openDepositModal = function() {
    var modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'block';
    var step1 = document.getElementById('depositStep1');
    if (step1) step1.style.display = 'block';
    var step2 = document.getElementById('depositStep2');
    if (step2) step2.style.display = 'none';
    var step3 = document.getElementById('depositStep3');
    if (step3) step3.style.display = 'none';
};

window.closeDepositModal = function() {
    var modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'none';
};

window.goToDepositStep2 = function() {
    var amount = parseInt(document.getElementById('depositAmountInput').value);
    if (isNaN(amount) || amount < 10) {
        alert('Минимальная сумма пополнения — 10 ₽!');
        return;
    }
    document.getElementById('reqAmount').textContent = amount;
    document.getElementById('depositStep1').style.display = 'none';
    document.getElementById('depositStep2').style.display = 'block';
};

window.sendDepositRequest = function() {
    var amount = parseInt(document.getElementById('depositAmountInput').value);
    var name = (playerNameInput ? playerNameInput.value.trim() : "Игрок") || "Игрок";

    var reqRef = db.ref('deposit_requests').push();
    reqRef.set({
        id: reqRef.key,
        playerId: myPlayerId,
        playerName: name,
        amount: amount,
        status: 'pending'
    });

    document.getElementById('depositStep2').style.display = 'none';
    document.getElementById('depositStep3').style.display = 'block';
};

function initAdminPanel() {
    db.ref('deposit_requests').on('value', function(snap) {
        var requests = snap.val() || {};
        var adminList = document.getElementById('adminRequestsList');
        if (!adminList) return;
        adminList.innerHTML = '';

        var pending = Object.values(requests).filter(function(r) { return r.status === 'pending'; });

        if (pending.length === 0) {
            adminList.innerHTML = '<p class="no-reqs">Нет активных заявок</p>';
            return;
        }

        pending.forEach(function(req) {
            var item = document.createElement('div');
            item.className = 'admin-req-item';
            item.innerHTML = `
                <p>👤 <strong>${req.playerName}</strong> просит пополнить <strong>${req.amount} ₽</strong></p>
                <div class="admin-btns" style="display:flex; gap: 8px; margin-top:8px;">
                    <button class="admin-approve-btn" style="background:#059669; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;" onclick="approveDeposit('${req.id}', '${req.playerId}', ${req.amount})">Принять</button>
                    <button class="admin-decline-btn" style="background:#dc2626; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;" onclick="declineDeposit('${req.id}')">Отклонить</button>
                </div>
            `;
            adminList.appendChild(item);
        });
    });
}

window.approveDeposit = function(reqId, playerId, amount) {
    db.ref('players/' + playerId + '/balance').transaction(function(current) {
        return parseFloat(((current || 0) + amount).toFixed(3));
    });
    db.ref('deposit_requests/' + reqId).remove();
};

window.declineDeposit = function(reqId) {
    db.ref('deposit_requests/' + reqId).remove();
};

function calculateTotalBank() {
    return Object.values(players).reduce(function(acc, p) { return acc + (p.totalBet || 0); }, 0);
}

function renderBets() {
    if (!betList) return;
    var active = Object.values(players).filter(function(p) { return p.totalBet > 0; }).sort(function(a, b) { return b.totalBet - a.totalBet; });
    var totalB = calculateTotalBank();

    betList.innerHTML = '';
    if (active.length === 0) {
        betList.innerHTML = '<div class="bet-placeholder">Пока нет ставок...</div>';
        return;
    }

    active.forEach(function(p) {
        var percentage = ((p.totalBet / totalB) * 100).toFixed(1);

        var item = document.createElement('div');
        item.className = 'bet-item';
        item.style.borderLeft = '4px solid ' + p.color;
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
