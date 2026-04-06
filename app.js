// app.js — основная логика: state, generateTable, checkAnswers, storage, routing
// Зависимости: ui.js (должен загружаться первым через defer), data.js
'use strict';

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// --- ПОДГОТОВКА БАЗ ИЗ data.js ---
window.task7Data = typeof task7Data !== 'undefined' ? task7Data : [];
window.task7Top100Data = typeof task7Top100Data !== 'undefined' ? task7Top100Data : window.task7Data;

window.openGlobalTopModal = function() { showToast('⏳', 'Подключение...', 'bg-blue-500', 'border-blue-700'); };
window.nextRedPencilCase = function() { haptic('light'); currentRPCaseIndex++; window.loadRPCase(currentRPCaseIndex); };

function checkAchievements() {
    if (!window.state.stats.achievements) window.state.stats.achievements = [];
    if (!window.state.stats.achievementsData) window.state.stats.achievementsData = { nightOwls: 0, earlyBirds: 0, hwDone: 0, hwPerfect: 0, maxMistakes: 0 };
    let unlockedAny = false;
    if (typeof achievementsList !== 'undefined') {
        achievementsList.forEach(ach => {
            if (!window.state.stats.achievements.includes(ach.id) && ach.check(window.state.stats)) {
                window.state.stats.achievements.push(ach.id); unlockedAny = true; showToast('🏆', `Ачивка открыта: ${ach.name}!`, 'bg-yellow-500', 'border-yellow-700');
            }
        });
    }
    if (unlockedAny) saveProgress();
}

function updateText(el, text) { if (el && el.innerText !== String(text)) el.innerText = text; }

// Возвращает ключ эпохи для факта; task5 не имеет поля c — определяем по году
function getEraFromFact(fact, task) {
    if (task === 'task5') {
        const y = parseInt(fact.year, 10) || 0;
        if (y < 1700) return 'early';
        if (y < 1800) return '18th';
        if (y < 1900) return '19th';
        return '20th';
    }
    return fact.c || null;
}

const precomputed = { task3: {}, task4: {}, task5: {}, task7: {} };
const periodsList = ['all', 'early', '18th', '19th', '20th'];

function initPrecomputed() {
    // ✅ FIX: Жёсткая проверка на случай если data.js не загрузился или упал
    window.bigData     = typeof bigData      !== 'undefined' ? bigData      : (window.bigData     || []);
    window.task3Data   = typeof task3Data    !== 'undefined' ? task3Data    : (window.task3Data   || []);
    window.task5Data   = typeof task5Data    !== 'undefined' ? task5Data    : (window.task5Data   || []);
    window.task7Data   = typeof task7Data    !== 'undefined' ? task7Data    : (window.task7Data   || []);
    window.task7Top100Data = typeof task7Top100Data !== 'undefined' ? task7Top100Data : (window.task7Top100Data || window.task7Data || []);

    const totalItems = (window.bigData?.length || 0) + (window.task3Data?.length || 0)
                     + (window.task5Data?.length || 0) + (window.task7Data?.length || 0);

    if (totalItems === 0) {
        // ✅ FIX: Показываем пользователю понятную ошибку вместо молчаливого краша
        console.error('[data.js] База данных не загружена! Проверьте подключение data.js.');
        const errBanner = document.createElement('div');
        errBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ef4444;color:white;text-align:center;padding:12px;font-weight:900;font-size:14px';
        errBanner.textContent = '⚠️ База вопросов не загружена. Обновите страницу или проверьте подключение.';
        document.body.prepend(errBanner);
    }

    const filterData = (data, p) => p === 'all' ? [...(data || [])] : (data || []).filter(d => d.c === p);
    // task5Data не имеет поля c — присваиваем его по году, чтобы работали и фильтр, и eraStats
    window.task5Data.forEach(d => {
        if (!d.c) {
            const y = parseInt(d.year, 10) || 0;
            d.c = y < 1700 ? 'early' : y < 1800 ? '18th' : y < 1900 ? '19th' : '20th';
        }
    });
    periodsList.forEach(p => { 
        precomputed.task3[p] = filterData(window.task3Data, p); 
        precomputed.task4[p] = filterData(window.bigData, p); 
        precomputed.task5[p] = filterData(window.task5Data, p); 
        precomputed.task7[p] = filterData(window.task7Data, p); 
    });
}

window.state = {
    selectedChip: null, currentTask: 'task4', pendingTask: 'task4', pendingMode: 'normal',
    stats: { streak: 0, totalSolvedEver: 0, solvedByTask: { task3: 0, task4: 0, task5: 0, task7: 0 }, flashcardsSolved: 0, eraStats: {}, factStreaks: {}, totalTimeSpent: 0, bestSpeedrunScore: 0, dailyStats: {}, hwFlashcardsToSolve: 0, hwTask3: 0, hwTask4: 0, hwTask5: 0, hwTask7: 0, achievements: [], achievementsData: { nightOwls: 0, earlyBirds: 0, hwDone: 0, hwPerfect: 0, maxMistakes: 0 } },
    mistakesPool: [], currentTargetData: [], currentMode: 'normal', timeLeft: 0, timerInterval: null, hideLearned: false, isHomeworkMode: false, hwTargetIndices: [], hwCurrentPool: [], answersRevealed: false,
    isTeacherAdmin: false, focusMode: false, studyIndex: 0, errorStreak: 0,
    duel: { active: false, matchId: null, isPlayer1: false, oppName: '', myScore: 0, myCombo: 0, oppScore: 0, oppCombo: 0, searching: false }
};

// --- БАЗА ШУТОК ---
const jokePhrases = {
    correct: [
        "Неплохо.", "Хорош!", "Идешь к успеху.", "Так держать!", "База!", 
        "Эксперт ЕГЭ.", "Исторично!", "Мозг как у Ленина!", "Ключевский тобой гордится.", "100 баллов на горизонте!", 
        "Бюджетное место уже твое!", "Гений исторической мысли!", "Артасов лично пожмет тебе руку!", "Ты вообще спишь или только историю учишь?", "Машина для уничтожения тестов!", 
        "Ты случайно не реинкарнация Нестора Летописца?", "Да ты знаешь историю лучше тех, кто ее делал!", "Приемная комиссия МГУ уже плачет от счастья!", "Кажется, составители ЕГЭ будут списывать у тебя!", "Великий Магистр Времен и Народов!", 
        "Твой мозг — это буквально Государственный Архив РФ!", "Давай честно, ты сам писал эти учебники по истории?", "Император Всероссийский и Повелитель ЕГЭ по истории!", "С таким мозгом можно предсказывать будущее, а не только знать прошлое!", "Ты преисполнился в познании настолько, что этот мир тебе абсолютно понятен!"
    ],
    error: [
        "ты тупой?", "Мда...", "Артасов плачет от твоих ответов.", "Минус баллы.", "Соберись, тряпка!", 
        "Завод уже ждет тебя!", "Армия близко, сынок.", "Платное отделение само себя не оплатит!", "Ты вообще открывал учебник?", "С такими знаниями только в ПТУ.", 
        "Рюрик в гробу перевернулся.", "Это фиаско, братан.", "Твои шансы на сотку тают на глазах.", "Ты не сдашь ЕГЭ, чел.", "Может, историю вообще не сдавать? Подумай.", 
        "Даже кот ответил бы лучше.", "Скажи маме, чтобы откладывала на коммерцию.", "Ты бьешь все рекорды по тупости.", "Твоя безграмотность войдет в легенды!", "Поздравляю, ты изобрел альтернативную историю!", 
        "Кто-то перепутал века, а кто-то — тысячелетия...", "Если бы за ошибки платили, ты бы уже купил МГУ!", "Я всего лишь код, но даже мне больно на это смотреть.", "Оставь надежду, всяк сюда входящий. ЕГЭ тебе не светит.", "Хватит тыкать наугад, иди читай теорию, гений!"
    ]
};

window.getJokePhrase = function(isCorrect) {
    if (isCorrect) {
        window.state.errorStreak = 0;
        let currentStreak = window.state.stats.streak || 0;
        let idx = Math.max(currentStreak - 1, 0);
        if (idx >= jokePhrases.correct.length) {
            idx = jokePhrases.correct.length - 1 - Math.floor(Math.random() * 5);
        }
        return jokePhrases.correct[idx];
    } else {
        window.state.errorStreak = (window.state.errorStreak || 0) + 1;
        let idx = window.state.errorStreak - 1;
        if (idx >= jokePhrases.error.length) {
            idx = jokePhrases.error.length - 1 - Math.floor(Math.random() * 5);
        }
        return jokePhrases.error[idx];
    }
};

const tg = window.Telegram ? window.Telegram.WebApp : null; window.tgApp = tg; 

// === СИСТЕМА ДУЭЛЕЙ PvP ===
window.secretClicks = 0; window.secretTimer = null;
window.handleLogoClick = function() {
    window.secretClicks++; clearTimeout(window.secretTimer);
    window.secretTimer = setTimeout(() => window.secretClicks = 0, 1000);
    if (window.secretClicks === 5) { window.secretClicks = 0; window.state.isTeacherAdmin = true; showToast('👨‍🏫', 'Кабинет учителя открыт!', 'bg-purple-600', 'border-purple-800'); if (window.loadClassProgress) window.loadClassProgress(); window.openTeacherModal(); return;}
    
    haptic('light');
    if (!$('game-container').classList.contains('hidden')) backToLobby();
    else { updateGlobalUI(); showToast('🔄', 'Лобби обновлено', 'bg-blue-500', 'border-blue-700'); }
};

function haptic(type) { if (tg && tg.HapticFeedback) { if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(type)) tg.HapticFeedback.impactOccurred(type); else tg.HapticFeedback.notificationOccurred(type); } }
function shuffleArray(array) { let c = array.length, r; while (c !== 0) { r = Math.floor(Math.random() * c); c--; [array[c], array[r]] = [array[r], array[c]]; } return array; }
function getTodayString() { const t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().split('T')[0]; }
// FIX 3.3: Единый конфиг заданий — устраняет ~20 мест с дублированием ветвлений task3/4/5/7
const TASK_CONFIG = {
    task3: {
        prefix: 't3_',
        keyFn:      f => 't3_' + f.process + '|' + f.fact,
        matchFn:    (a, b) => a.process === b.process && a.fact === b.fact,
        dedupeKey:  f => f.process + '|' + f.fact,
        data:       () => window.task3Data || [],
    },
    task4: {
        prefix: '',
        keyFn:      f => f.event,
        matchFn:    (a, b) => a.event === b.event,
        dedupeKey:  f => f.event,
        data:       () => window.bigData || [],
    },
    task5: {
        prefix: 't5_',
        keyFn:      f => 't5_' + f.event,
        matchFn:    (a, b) => a.event === b.event,
        dedupeKey:  f => f.event,
        data:       () => window.task5Data || [],
    },
    task7: {
        prefix: 't7_',
        keyFn:      f => 't7_' + f.culture,
        matchFn:    (a, b) => a.culture === b.culture,
        dedupeKey:  f => f.culture,
        data:       () => window.task7Data || [],
    },
};
// Хелпер: SRS-ключ факта для текущего (или указанного) задания
const factKey = (f, task) => {
    const t = task || window.state.currentTask;
    return (TASK_CONFIG[t] || TASK_CONFIG.task4).keyFn(f);
};
// Хелпер: совпадение записи mistakesPool с конкретным фактом
const mistakeMatchesFact = (m, fact, task) => {
    const t = task || window.state.currentTask;
    return m.task === t && (TASK_CONFIG[t] || TASK_CONFIG.task4).matchFn(m.fact, fact);
};
window.isFactLearned = function(val) { if (typeof val === 'number') return val >= 3; if (val && val.level !== undefined) return val.level > 0; if (val && val.streak !== undefined) return val.streak >= 3; return false; };
function getYearFromFact(d) { if (!d) return 0; if (d.year) { let m = String(d.year).match(/\d+/); return m ? parseInt(m[0]) : 0; } return 0; }

// === ГЛОБАЛЬНЫЕ КОНСТАНТЫ ЭПОХ ===
const TASK_EPOCHS       = ['early', '18th', '19th', '20th'];
const TASK_EPOCH_NAMES  = { early: 'Древность и Смута', '18th': 'XVIII век', '19th': 'XIX век', '20th': 'XX век' };
const TASK_EPOCH_SHORT  = { early: 'Древность', '18th': 'XVIII в.', '19th': 'XIX в.', '20th': 'XX в.' };

// Подсчёт выученных фактов для задания (factStreaks — необязателен, по умолчанию из state)
function countLearnedForTask(taskKey, streaks) {
    let count = 0;
    const src = streaks || window.state.stats.factStreaks || {};
    const cfg = TASK_CONFIG[taskKey];
    const prefix = cfg ? (cfg.prefix || null) : null;
    Object.entries(src).forEach(([k, v]) => {
        const match = prefix ? k.startsWith(prefix) : (!k.startsWith('t5_') && !k.startsWith('t7_') && !k.startsWith('t3_'));
        if (match && v && (v.level > 0 || (v.streak !== undefined && v.streak >= 3))) count++;
    });
    return count;
}

function updateScoreAndStats(linesCount, isPerfectHw = false) {
    window.state.stats.totalSolvedEver += linesCount; 
    // Per-task totals
    const curTask = window.state.currentTask || 'task4';
    if (!window.state.stats.solvedByTask) window.state.stats.solvedByTask = { task3: 0, task4: 0, task5: 0, task7: 0 };
    window.state.stats.solvedByTask[curTask] = (window.state.stats.solvedByTask[curTask] || 0) + linesCount;
    const today = getTodayString(); 
    if (!window.state.stats.dailyStats[today]) window.state.stats.dailyStats[today] = { timeSpent: 0, solved: 0, solvedTask4: 0, solvedTask5: 0, solvedTask7: 0 }; 
    window.state.stats.dailyStats[today].solved += linesCount;
    // Per-task daily
    const dtKey = 'solved' + curTask.charAt(0).toUpperCase() + curTask.slice(1);
    window.state.stats.dailyStats[today][dtKey] = (window.state.stats.dailyStats[today][dtKey] || 0) + linesCount;
    const h = new Date().getHours();
    if (h >= 0 && h < 5) window.state.stats.achievementsData.nightOwls += linesCount;
    if (h >= 5 && h < 8) window.state.stats.achievementsData.earlyBirds += linesCount;
    if (window.state.stats.hwFlashcardsToSolve > 0) {
        window.state.stats.hwFlashcardsToSolve = Math.max(0, window.state.stats.hwFlashcardsToSolve - linesCount);
        if (window.state.stats.hwFlashcardsToSolve === 0) {
            window.state.stats.achievementsData.hwDone++; if (isPerfectHw) window.state.stats.achievementsData.hwPerfect++; setTimeout(() => showToast('🎉', 'Долг учителю выполнен!', 'bg-emerald-500', 'border-emerald-700'), 2000);
        }
    }
    saveLocal(); updateGlobalUI();
}

function updateFactSRS(fKey, isCorrect, isSure) {
    const now = Date.now(); let data = window.state.stats.factStreaks[fKey] || { points: 0, level: 0, nextReview: 0, lastUpdated: now };
    if (typeof data === 'number') data = { points: data >= 3 ? 3 : data, level: data >= 3 ? 1 : 0, nextReview: data >= 3 ? now + 12*3600000 : 0, lastUpdated: now };
    if (data.streak !== undefined) { data.points = data.streak >= 3 ? 3 : data.streak; data.level = data.streak >= 3 ? 1 : 0; data.nextReview = data.streak >= 3 ? now + 12*3600000 : 0; delete data.streak; }
    if (!isCorrect) { data.points = 0; data.level = 0; data.nextReview = 0; } else {
        if (data.level === 0) { data.points += isSure ? 1 : 0.7; if (data.points >= 3) { data.points = 3; data.level = 1; data.nextReview = now + 12 * 60 * 60 * 1000; } } 
        else { if (isSure) { if (data.level === 1) { data.level = 2; data.nextReview = now + 24 * 60 * 60 * 1000; } else if (data.level === 2) { data.level = 3; data.nextReview = now + 3 * 24 * 60 * 60 * 1000; } else if (data.level >= 3) { data.level = 4; data.nextReview = now + 7 * 24 * 60 * 60 * 1000; } } else { data.nextReview = now + 12 * 60 * 60 * 1000; } }
    }
    data.lastUpdated = now; window.state.stats.factStreaks[fKey] = data; return data;
}

window.updateZenButton = function() {
    const zenBtn = $('zen-exit-btn');
    if (!zenBtn) return;
    
    if (window.state.focusMode) {
        const smallClass = "w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-tr from-teal-500 to-emerald-400 backdrop-blur-md hover:scale-110 active:scale-90 transition-all duration-300 rounded-full cursor-pointer flex items-center justify-center shadow-[0_0_10px_rgba(20,184,166,0.8)] no-print border-2 border-white dark:border-[#1e1e1e] z-[100]";
        
        if (!$('classic-task-area').classList.contains('hidden')) {
            zenBtn.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 " + smallClass;
            zenBtn.innerHTML = '<span class="text-[12px] sm:text-[14px] drop-shadow-md relative">🧘</span>';
            const wrap = $('action-wrapper');
            if (wrap) { wrap.classList.add('relative'); wrap.appendChild(zenBtn); }
        } else {
            document.body.appendChild(zenBtn);
            zenBtn.className = "fixed bottom-4 left-1/2 transform -translate-x-1/2 " + smallClass;
            zenBtn.innerHTML = '<span class="text-[12px] sm:text-[14px] drop-shadow-md relative">🧘</span>';
        }
        zenBtn.classList.remove('hidden');
        zenBtn.classList.add('flex');
    } else {
        zenBtn.classList.add('hidden');
        zenBtn.classList.remove('flex');
    }
};

window.quickStartGame = function(task, mode) {
    haptic('medium'); window.state.currentTask = task;
    $('filter-task').value = task; $('filter-mode').value = mode;
    const sortYC = $('pg-sort-year-container'); if (sortYC) sortYC.classList.toggle('hidden', task !== 'task3');
    if (!$('filter-period').value) $('filter-period').value = 'all';
    
    let tTitle = task === 'task3' ? '🔗 Задание №3' : (task === 'task4' ? '📍 Задание №4' : (task === 'task5' ? '👤 Задание №5' : '🎨 Задание №7'));
    const titles = { 'normal': tTitle, 'speedrun': '⚡ Спидран', 'flashcards': '🃏 Флеш-карточки', 'mistakes': '🔥 Ошибки', 'study': '📖 Сюжеты', 'detective': '🕵️ Секретный архив', 'redpencil': '🖍️ Красный карандаш' };
    $('pre-game-title').innerText = titles[mode]; $('game-title-display').innerText = titles[mode];
    $('lobby-area').classList.add('hidden'); $('game-container').classList.remove('hidden'); $('game-container').classList.add('flex');
    document.body.classList.add('in-game'); $('bottom-nav').classList.add('hide-nav');
    
    toggleMode(mode);
};

// === TASK PICKER FOR MODES ===
window._pendingMode = null;
window.pickTaskForMode = function(mode) {
    haptic('light');
    // Detective and Red Pencil are standalone modes — no task selection needed
    if (mode === 'detective' || mode === 'redpencil') {
        quickStartGame(window.state.currentTask || 'task4', mode);
        return;
    }
    // Flashcards — open task picker to let user choose
    if (mode === 'flashcards') {
        window._pendingMode = mode;
        $('tp-title').innerText = '🃏 Флеш-карточки';
        updateTaskPickerProgress();
        $('task-picker-modal').classList.remove('hidden');
        $('task-picker-modal').classList.add('flex');
        setTimeout(() => { $('task-picker-modal').classList.remove('opacity-0'); $('tp-sheet').classList.remove('translate-y-full'); }, 10);
        return;
    }
    window._pendingMode = mode;
    const modeNames = { 'speedrun': '⚡ Спидран', 'mistakes': '🔥 Ошибки', 'study': '📖 Сюжеты' };
    $('tp-title').innerText = modeNames[mode] || 'Выберите задание';
    updateTaskPickerProgress();
    $('task-picker-modal').classList.remove('hidden');
    $('task-picker-modal').classList.add('flex');
    setTimeout(() => { $('task-picker-modal').classList.remove('opacity-0'); $('tp-sheet').classList.remove('translate-y-full'); }, 10);
};
window.confirmTaskPick = function(task) {
    closeTaskPicker();
    if (window._pendingMode) quickStartGame(task, window._pendingMode);
};
window.closeTaskPicker = function() {
    $('task-picker-modal').classList.add('opacity-0');
    $('tp-sheet').classList.add('translate-y-full');
    setTimeout(() => { $('task-picker-modal').classList.add('hidden'); $('task-picker-modal').classList.remove('flex'); }, 300);
};
function updateTaskPickerProgress() {
    $$('.tp-progress').forEach(el => {
        const task = el.dataset.task;
        const info = getTaskProgress(task);
        el.textContent = info.learned + '/' + info.total;
    });
}

// === PROGRESS BARS ===
function getTaskProgress(task) {
    const streaks = window.state.stats.factStreaks || {};
    let learned = 0;
    for (const [key, val] of Object.entries(streaks)) {
        if (task === 'task3' && key.startsWith('t3_')) {
            if (window.isFactLearned(val)) learned++;
        } else if (task === 'task4' && !key.startsWith('t5_') && !key.startsWith('t7_') && !key.startsWith('t3_')) {
            if (window.isFactLearned(val)) learned++;
        } else if (task === 'task5' && key.startsWith('t5_')) {
            if (window.isFactLearned(val)) learned++;
        } else if (task === 'task7' && key.startsWith('t7_')) {
            if (window.isFactLearned(val)) learned++;
        }
    }
    let total = 0;
    try {
        if (task === 'task3') total = (typeof task3Data !== 'undefined' ? task3Data.length : 0);
        else if (task === 'task4') total = (typeof bigData !== 'undefined' ? bigData.length : 0);
        else if (task === 'task5') total = (typeof task5Data !== 'undefined' ? task5Data.length : 0);
        else if (task === 'task7') total = (window.task7Data ? window.task7Data.length : 0);
    } catch(e) {}
    return { learned, total: total || 1 };
}
function updateProgressBars() {
    ['task3', 'task4', 'task5', 'task7'].forEach(task => {
        const info = getTaskProgress(task);
        const pct = Math.min(100, Math.round((info.learned / info.total) * 100));
        const bar = $('progress-bar-' + task);
        const txt = $('progress-text-' + task);
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = info.learned + ' / ' + info.total + ' выучено';
    });
}

// === ONBOARDING ===
window.backToLobby = function() {
    haptic('light'); 
    if (window.state.currentMode === 'duel') {
        if (window.cancelDuelDb) window.cancelDuelDb();
        window.state.duel.active = false;
    }
    
    $('game-container').classList.add('hidden'); $('game-container').classList.remove('flex'); $('lobby-area').classList.remove('hidden');
    if (!window.state.focusMode) { 
        document.body.classList.remove('in-game'); 
        $('bottom-nav').classList.remove('hide-nav'); 
    }
    
    $('duel-header').classList.add('hidden');
    $('duel-header').classList.remove('flex');
    $('game-header').classList.remove('hidden');
    
    clearInterval(window.state.timerInterval); $('game-timer-display').classList.add('hidden');
    $('task-table-body').innerHTML = ''; $('pool-container').innerHTML = '';
    ['classic-task-area', 'flashcard-area', 'study-area', 'redpencil-area'].forEach(id => { const el = $(id); if (el) { el.classList.add('hidden'); el.classList.remove('flex', 'lg:flex-row'); } });
    document.body.classList.remove('mode-detective');
    window.updateZenButton();
    updateProgressBars();
};

// FIX 2.5: Кэш DOM-элементов — избегаем сотен повторных getElementById
const DOM = {};
function cacheDOM() {
    [
        'filter-period', 'filter-task', 'filter-mode', 'filter-rows', 'filter-case',
        'filter-database', 'pool-container', 'task-table-body', 'table-head',
        'game-container', 'lobby-area', 'bottom-nav', 'check-buttons',
        'reveal-btn', 'next-btn', 'game-timer-display', 'pool-title',
        'toggle-hide-learned', 'pg-hide-learned', 'detective-stamp',
        'pg-sort-year-container', 'check-btn-sure', 'check-btn-doubt'
    ].forEach(id => { DOM[id] = document.getElementById(id); });
}

function initStorage() {
    cacheDOM();
    if (tg && tg.initDataUnsafe) { tg.expand(); tg.ready(); if (tg.colorScheme === 'dark') { document.documentElement.classList.add('dark'); localStorage.setItem('ege_theme', 'dark'); } }
    initPrecomputed();
    
    if (!DOM['filter-period'].value) DOM['filter-period'].value = 'all';
    if (!DOM['filter-task'].value) DOM['filter-task'].value = 'task4';
    if (!DOM['filter-mode'].value) DOM['filter-mode'].value = 'normal';
    if (!DOM['filter-rows'].value) DOM['filter-rows'].value = '4';

    DOM['task-table-body'].addEventListener('click', (e) => { const slot = e.target.closest('.dnd-slot'); if (slot) handleSlotClick(slot); });
    DOM['pool-container'].addEventListener('click', (e) => { const chip = e.target.closest('.dnd-chip'); if (chip) window.onChipClick(chip, e); });
    try {
        const saved = localStorage.getItem('ege_final_storage_v4');
        if (saved) {
            const parsed = JSON.parse(saved); Object.assign(window.state.stats, parsed);
            if (parsed.streak !== undefined) window.state.stats.streak = parsed.streak;
            if (parsed.mistakesPool) window.state.mistakesPool = parsed.mistakesPool; if (parsed.hideLearned !== undefined) window.state.hideLearned = parsed.hideLearned;
            if (!window.state.stats.dailyStats) window.state.stats.dailyStats = {}; if (window.state.stats.flashcardsSolved === undefined) window.state.stats.flashcardsSolved = 0; if (window.state.stats.hwFlashcardsToSolve === undefined) window.state.stats.hwFlashcardsToSolve = 0; if (!window.state.stats.achievements) window.state.stats.achievements = []; if (!window.state.stats.achievementsData) window.state.stats.achievementsData = { nightOwls: 0, earlyBirds: 0, hwDone: 0, hwPerfect: 0, maxMistakes: 0 };
            const now = Date.now(); for (let key in window.state.stats.factStreaks) { let data = window.state.stats.factStreaks[key]; if (typeof data === 'number') { window.state.stats.factStreaks[key] = { points: data >= 3 ? 3 : data, level: data >= 3 ? 1 : 0, nextReview: data >= 3 ? now + 12*3600000 : 0, lastUpdated: now }; } else if (data && data.streak !== undefined) { window.state.stats.factStreaks[key] = { points: data.streak >= 3 ? 3 : data.streak, level: data.streak >= 3 ? 1 : 0, nextReview: data.streak >= 3 ? now + 12*3600000 : 0, lastUpdated: data.lastUpdated || now }; } }
            // Миграция старого формата eraStats (flat) → новый (per-task)
            const eras = window.state.stats.eraStats || {};
            const oldFormat = ['early','18th','19th','20th'].some(k => eras[k] && typeof eras[k].correct === 'number');
            if (oldFormat) {
                const migrated = { task3: {}, task4: {}, task5: {}, task7: {} };
                for (const era of ['early','18th','19th','20th']) {
                    if (eras[era]) {
                        // Старые данные относим к task4 — самое частое задание
                        migrated.task4[era] = { ...eras[era] };
                        migrated.task3[era] = { correct: 0, total: 0 };
                        migrated.task5[era] = { correct: 0, total: 0 };
                        migrated.task7[era] = { correct: 0, total: 0 };
                    }
                }
                window.state.stats.eraStats = migrated;
            }
            // Гарантируем структуру для всех заданий
            for (const tk of ['task3','task4','task5','task7']) {
                if (!window.state.stats.eraStats[tk]) window.state.stats.eraStats[tk] = {};
                for (const era of ['early','18th','19th','20th']) {
                    if (!window.state.stats.eraStats[tk][era]) window.state.stats.eraStats[tk][era] = { correct: 0, total: 0 };
                }
            }
            // Гарантируем solvedByTask
            if (!window.state.stats.solvedByTask) window.state.stats.solvedByTask = { task3: 0, task4: 0, task5: 0, task7: 0 };
        }
    } catch(e) {}
    if (localStorage.getItem('ege_theme') === 'dark') document.documentElement.classList.add('dark');
    DOM['toggle-hide-learned'].checked = window.state.hideLearned; DOM['pg-hide-learned'].checked = window.state.hideLearned;
    setTimeout(() => $$('.modal-content-hidden').forEach(el => el.classList.remove('modal-content-hidden')), 500);
    updateGlobalUI(); updateProgressBars(); checkOnboarding(); checkURLForHomework();
    setInterval(() => {
        window.state.stats.totalTimeSpent = (window.state.stats.totalTimeSpent || 0) + 1;
        const today = getTodayString();
        if (!window.state.stats.dailyStats[today]) window.state.stats.dailyStats[today] = { timeSpent: 0, solved: 0 };
        window.state.stats.dailyStats[today].timeSpent++;
        // ✅ FIX: Только localStorage каждые 30 сек — облако через debounce/syncNow
        // Было: saveProgress() каждые 5 сек → ~720 облачных записей/час на игрока
        // Стало: saveLocal() каждые 30 сек → 0 облачных записей от таймера
        if (window.state.stats.totalTimeSpent % 30 === 0) saveLocal();
    }, 1000);
}

// ─── Сохранение прогресса ────────────────────────────────────────────────
// saveLocal()  — только localStorage, вызывается при каждом действии (бесплатно, мгновенно)
// scheduleSyncToCloud() — debounced 2 мин, для фоновой синхронизации в облако
// syncNow()    — немедленная отправка в облако, только на ключевых событиях

function saveLocal() {
    localStorage.setItem('ege_final_storage_v4', JSON.stringify({
        streak: window.state.stats.streak,
        totalSolvedEver: window.state.stats.totalSolvedEver,
        solvedByTask: window.state.stats.solvedByTask,
        flashcardsSolved: window.state.stats.flashcardsSolved,
        eraStats: window.state.stats.eraStats,
        factStreaks: window.state.stats.factStreaks,
        hwFlashcardsToSolve: window.state.stats.hwFlashcardsToSolve,
        mistakesPool: window.state.mistakesPool,
        hideLearned: window.state.hideLearned,
        totalTimeSpent: window.state.stats.totalTimeSpent,
        bestSpeedrunScore: window.state.stats.bestSpeedrunScore,
        dailyStats: window.state.stats.dailyStats,
        achievements: window.state.stats.achievements,
        achievementsData: window.state.stats.achievementsData
    }));
}

let _cloudSyncTimer = null;
function scheduleSyncToCloud() {
    // ✅ Debounce: откладываем облачную синхронизацию на 2 минуты.
    // Если игрок решает карточки подряд — в облако уйдёт один запрос, а не 100.
    if (_cloudSyncTimer) clearTimeout(_cloudSyncTimer);
    _cloudSyncTimer = setTimeout(() => {
        _cloudSyncTimer = null;
        if (window.syncProgressToCloud) window.syncProgressToCloud();
    }, 2 * 60 * 1000); // 2 минуты
}

function syncNow() {
    // ✅ Немедленная синхронизация: вызывать ТОЛЬКО на ключевых событиях
    // (завершение таблицы, конец игры, конец дуэли).
    if (_cloudSyncTimer) { clearTimeout(_cloudSyncTimer); _cloudSyncTimer = null; }
    if (window.syncProgressToCloud) window.syncProgressToCloud();
}

// saveProgress() = saveLocal + поставить в очередь облачную синхронизацию.
// Заменяет старый вариант, который писал в облако при каждом вызове.
function saveProgress() {
    saveLocal();
    scheduleSyncToCloud();
}

function checkURLForHomework() {
    const p = new URLSearchParams(window.location.search);
    const hwCount = p.get('hw_count');
    const hwIds = p.get('hw');
    
    if (hwIds) {
        const tsk = p.get('task') || 'task4';
        window.state.isHomeworkMode = true; window.state.hwTargetIndices = hwIds.split(',').map(Number); window.state.hwCurrentPool = [...window.state.hwTargetIndices];
        $('filter-task').value = tsk; window.state.currentTask = tsk;
        $('lobby-area').classList.add('hidden'); $('hw-alert').classList.remove('hidden'); updateText($('hw-remaining'), window.state.hwCurrentPool.length);
        $('game-container').classList.remove('hidden'); $('game-container').classList.add('flex'); $('game-title-display').innerText = "📚 ДОМАШНЕЕ ЗАДАНИЕ";
        document.body.classList.add('in-game'); $('bottom-nav').classList.add('hide-nav'); 
        toggleMode('normal');
    } else if (hwCount) {
        window.state.stats.hwFlashcardsToSolve = parseInt(hwCount);
        if (p.get('hw_task')) { $('filter-task').value = p.get('hw_task'); window.state.currentTask = p.get('hw_task'); }
        if (p.get('hw_period')) { $('filter-period').value = p.get('hw_period'); if (p.get('hw_period') === 'custom') { $('custom-year-start').value = p.get('hw_sy') || '862'; $('custom-year-end').value = p.get('hw_ey') || '2022'; } }
        saveProgress(); window.history.replaceState({}, document.title, window.location.pathname); showToast('📝', 'Вам назначено ДЗ!', 'bg-blue-500', 'border-blue-700'); updateGlobalUI();
        setTimeout(() => { $('lobby-area').classList.add('hidden'); $('game-container').classList.remove('hidden'); $('game-container').classList.add('flex'); document.body.classList.add('in-game'); $('bottom-nav').classList.add('hide-nav'); $('game-title-display').innerText = "📚 ДОМАШНЕЕ ЗАДАНИЕ"; toggleMode('normal'); }, 500);
    }
}

window.onChipClick = function(chip, e) {
    haptic('light'); 
    const now = Date.now(); 
    const timeSinceLastClick = now - (chip._lastClickTime || 0); 
    
    if (chip.classList.contains('crossed-out')) { 
        chip.classList.remove('crossed-out', 'opacity-30', 'line-through', 'grayscale', 'scale-90'); 
        chip._lastClickTime = 0; 
    }
    else if (timeSinceLastClick < 300) { 
        chip.classList.add('crossed-out', 'opacity-30', 'line-through', 'grayscale', 'scale-90'); 
        chip.classList.remove('selected'); 
        if (window.state.selectedChip === chip) window.state.selectedChip = null; 
        updateSlotGlow(); 
        e.stopPropagation(); 
        chip._lastClickTime = now;
        return; 
    }

    chip._lastClickTime = now;
    if (chip.classList.contains('in-slot')) { e.stopPropagation(); const slot = chip.parentElement; if (slot.classList.contains('correct-slot') || slot.classList.contains('revealed-slot')) return; chip.classList.remove('in-slot', 'selected'); $('pool-container').appendChild(chip); slot.innerHTML = ''; slot.classList.remove('has-item', 'incorrect-slot'); if (window.state.selectedChip === chip) window.state.selectedChip = null; updateSlotGlow(); return; }
    
    // FIX 2.3: вместо перебора всех чипов — снимаем выделение только с предыдущего
    if (window.state.selectedChip && window.state.selectedChip !== chip) {
        window.state.selectedChip.classList.remove('selected');
    }
    if (window.state.selectedChip !== chip) { window.state.selectedChip = chip; chip.classList.add('selected'); } else { window.state.selectedChip = null; chip.classList.remove('selected'); } updateSlotGlow();
};

window.handleTaskChange = function() { window.state.currentTask = $('filter-task').value; const sortC = $('pg-sort-year-container'); if (sortC) sortC.classList.toggle('hidden', window.state.currentTask !== 'task3'); if (window.state.currentMode === 'flashcards') window.nextFlashcard(); else generateTable(); };
window.handleModeChange = function() { toggleMode($('filter-mode').value); };
window.handleSettingsChange = function() { const mode = window.state.currentMode; if (mode === 'flashcards' && window.nextFlashcard) window.nextFlashcard(); else if (mode === 'study') { window.state.studyIndex = 0; if (window.renderStudyCard) renderStudyCard(); } else if (mode === 'redpencil') { if (window.startRedPencilMode) startRedPencilMode(); } else if (window.generateTable) generateTable(); };

function getBasePool(period) {
    period = period || 'all';
    let dbType = $('filter-database') ? $('filter-database').value : 'top100';
    let baseData = [];
    
    // FIX 3.3: данные задания через TASK_CONFIG — не повторяем ветвление
    if (window.state.currentTask === 'task7') {
         baseData = dbType === 'top100' ? (window.task7Top100Data || window.task7Data || []) : (window.task7Data || []);
    } else {
         baseData = (TASK_CONFIG[window.state.currentTask] || TASK_CONFIG.task4).data();
    }
    
    if (period === 'custom') { const startY = parseInt($('custom-year-start').value) || 0; const endY = parseInt($('custom-year-end').value) || 3000; return baseData.filter(d => { const y = getYearFromFact(d); return y >= startY && y <= endY; }); }
    
    if (window.state.currentTask === 'task7' || window.state.currentTask === 'task3') {
         if (period === 'all') return [...baseData];
         return baseData.filter(d => d.c === period);
    }
    
    return precomputed[window.state.currentTask][period] || baseData;
}

function getFilteredPool(period, limit = 0) {
    const now = Date.now(); let pool = getBasePool(period);
    if (window.state.currentMode === 'mistakes') {
        let mistakes = window.state.mistakesPool.filter(m => m.task === window.state.currentTask).map(m => m.fact);
        let expired = pool.filter(f => { let d = window.state.stats.factStreaks[factKey(f)]; return d && d.level > 0 && d.nextReview <= now; });
        pool = [...mistakes, ...expired]; let uniqueEvents = new Set(); let uniquePool = [];
        for (let f of pool) { 
            let k = (TASK_CONFIG[window.state.currentTask] || TASK_CONFIG.task4).dedupeKey(f);
            if (!uniqueEvents.has(k)) { uniqueEvents.add(k); uniquePool.push(f); } 
        } pool = uniquePool;
        if (pool.length === 0) { showToast('🎉', 'Ошибок и забытых фактов нет! Возврат в Обучение.', 'bg-emerald-500', 'border-emerald-700'); setTimeout(() => backToLobby(), 1500); return null; }
    } else if (window.state.hideLearned) {
        pool = pool.filter(f => { let d = window.state.stats.factStreaks[factKey(f)]; return !(d && d.level > 0 && d.nextReview > now); });
        if (pool.length < (limit || 1)) { showToast('ℹ️', 'В этом фильтре всё свежо в памяти! Фильтр скрыт.', 'bg-blue-600', 'border-blue-800'); $('toggle-hide-learned').checked = false; window.state.hideLearned = false; return getFilteredPool(period, limit); }
    }
    return pool;
}

function toggleMode(mode) {
    if (window.state.currentMode !== mode) { window.state.currentMode = mode; window.state.stats.streak = 0; updateGlobalUI(); }
    const timerContainer = $('game-timer-display'); timerContainer.classList.add('hidden'); clearInterval(window.state.timerInterval);
    const isFc = mode === 'flashcards', isSpd = mode === 'speedrun', isSt = mode === 'study', isDet = mode === 'detective', isRP = mode === 'redpencil', isDuel = mode === 'duel';
    document.body.classList.toggle('mode-detective', isDet);
    
    ['classic-task-area', 'flashcard-area', 'study-area', 'redpencil-area'].forEach(id => { const el = $(id); if (el) { el.classList.add('hidden'); if (id === 'classic-task-area') el.classList.remove('flex', 'lg:flex-row'); if (id === 'flashcard-area' || id === 'study-area' || id === 'redpencil-area') el.classList.remove('flex'); } });
    if (isRP) { const rpa = $('redpencil-area'); if (rpa) { rpa.classList.remove('hidden'); rpa.classList.add('flex'); } if (window.startRedPencilMode) window.startRedPencilMode(); } 
    else if (isFc) { const fa = $('flashcard-area'); if (fa) { fa.classList.remove('hidden'); fa.classList.add('flex'); } if (window.nextFlashcard) window.nextFlashcard(); } 
    else if (isSt) { const sa = $('study-area'); if (sa) { sa.classList.remove('hidden'); sa.classList.add('flex'); } window.state.studyIndex = 0; if (window.renderStudyCard) window.renderStudyCard(); } 
    else {
        const ca = $('classic-task-area'); if (ca) { ca.classList.remove('hidden'); ca.classList.add('flex', 'lg:flex-row'); }
        if(isSpd) { window.state.timeLeft = 180; if(timerContainer) timerContainer.classList.remove('hidden'); window.state.timerInterval = setInterval(() => { window.state.timeLeft--; const min = Math.floor(window.state.timeLeft/60); const sec = window.state.timeLeft%60; updateText(timerContainer, `${min}:${sec < 10 ? '0' : ''}${sec}`); if(window.state.timeLeft <= 0) endGame(); }, 1000); }
        if (window.generateTable && !isDuel) generateTable();
    }
    setTimeout(() => window.updateZenButton(), 50);
}

function generateTable() {
    if (window.state.currentMode === 'mistakes') {
        let mPool = window.state.mistakesPool || [];
        let availableTasks = [];
        ['task3', 'task4', 'task5', 'task7'].forEach(t => {
            let hasM = mPool.some(m => m.task === t);
            let p = t === 'task7' ? (window.task7Data||[]) : (t === 'task5' ? (typeof task5Data !== 'undefined' ? task5Data : []) : (t === 'task3' ? (typeof task3Data !== 'undefined' ? task3Data : []) : (typeof bigData !== 'undefined' ? bigData : [])));
            let now = Date.now();
            let hasE = p.some(f => {
                let k = t === 'task7' ? 't7_'+f.culture : (t === 'task5' ? 't5_'+f.event : (t === 'task3' ? 't3_'+f.process+'|'+f.fact : f.event));
                let d = window.state.stats.factStreaks[k];
                return d && d.level > 0 && d.nextReview <= now;
            });
            if (hasM || hasE) availableTasks.push(t);
        });
        
        if (availableTasks.length > 0) {
            const randomTask = availableTasks[Math.floor(Math.random() * availableTasks.length)];
            window.state.currentTask = randomTask;
            $('filter-task').value = randomTask;
        }
    }

    if (window.state.currentMode === 'detective') return generateDetectiveTable();
    if (window.state.currentTask === 'task3') return generateTask3Table();
    if (window.state.currentTask === 'task5') return generateTask5Table();
    if (window.state.currentTask === 'task7') return generateTask7Table();
    
    window.state.tableHasMistake = false; window.state.answersRevealed = false; 
    
    const isForced4 = window.state.currentMode === 'speedrun' || window.state.currentMode === 'duel';
    const rowsCount = isForced4 ? 4 : (parseInt(DOM['filter-rows'] ? DOM['filter-rows'].value : $('filter-rows').value) || 4);
    const actualPeriod = isForced4 ? 'all' : ((DOM['filter-period'] ? DOM['filter-period'].value : $('filter-period').value) || 'all');
    
    if (DOM['pool-title']) DOM['pool-title'].innerHTML = `<span>🧩</span> ВАРИАНТЫ`; if (DOM['detective-stamp']) DOM['detective-stamp'].classList.add('hidden');
    if (DOM['check-buttons']) { DOM['check-buttons'].classList.remove('hidden'); DOM['check-buttons'].classList.add('flex'); }
    if (DOM['check-btn-sure']) DOM['check-btn-sure'].innerHTML = '✅ Уверен';
    if (DOM['check-btn-doubt']) DOM['check-btn-doubt'].innerHTML = '🤔 Сомневаюсь';
    if (DOM['reveal-btn']) { DOM['reveal-btn'].className = "hidden text-gray-500 hover:text-orange-500 dark:text-gray-400 font-bold py-2 active:scale-95 text-[11px] sm:text-xs w-full transition-colors underline uppercase tracking-wider mt-2"; DOM['reveal-btn'].innerHTML = '👀 Сдаюсь, покажи ответы'; }
    if (DOM['next-btn']) DOM['next-btn'].classList.add('hidden');
    if (DOM['task-table-body']) DOM['task-table-body'].innerHTML = '';
    if (DOM['pool-container']) DOM['pool-container'].innerHTML = '';
    // FIX 2.6: Не пересоздаём заголовок если задание не изменилось
    if (generateTable._lastHeadTask !== window.state.currentTask) {
        if (DOM['table-head']) DOM['table-head'].innerHTML = `<tr><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[27.5%] text-center">🗺️ Объект</th><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[45%] border-l border-gray-200 dark:border-[#2c2c2c] text-center">📜 Событие</th><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[27.5%] border-l border-gray-200 dark:border-[#2c2c2c] text-center">⏳ Дата</th></tr>`;
        generateTable._lastHeadTask = window.state.currentTask;
    }
    
    let target = [];
    if (window.state.isHomeworkMode && window.state.hwTargetIndices && window.state.hwTargetIndices.length > 0) { 
        let count = Math.min(rowsCount, window.state.hwCurrentPool.length); window.state.hwCurrentPool.slice(0, count).forEach(i => target.push((typeof bigData !== 'undefined' ? bigData : [])[i])); 
    } else { 
        let allowed = getFilteredPool(actualPeriod, rowsCount); if (!allowed || allowed.length === 0) { $('task-table-body').innerHTML = `<tr><td colspan="3" class="p-10 text-center font-bold text-rose-500 bg-white dark:bg-[#1e1e1e]">⚠️ Нет событий!</td></tr>`; return; }
        // === АЛГОРИТМ ЕГЭ №4: разнообразие эпох (25% шанс на 2×XX век) ===
        const canUseEpochAlgo4 = actualPeriod === 'all' && rowsCount === 4;
        let algoSuccess4 = false;
        if (canUseEpochAlgo4) {
            const ep4 = {};
            ['early','18th','19th','20th'].forEach(ep => { ep4[ep] = shuffleArray(allowed.filter(f => f.c === ep)); });
            const pick1e4 = (pool, usedEv) => { for (let f of pool) { if (!usedEv.has(f.event)) { usedEv.add(f.event); return f; } } return null; };
            const usedEv4 = new Set();
            const use20twice = Math.random() < 0.25;
            let picked4 = [];
            if (use20twice && ep4['20th'].length >= 2) {
                // 25%: 2 из XX, 1 из early, 1 из XVIII или XIX
                const p20a = pick1e4(ep4['20th'], usedEv4);
                const p20b = pick1e4(ep4['20th'], usedEv4);
                const pEa  = pick1e4(ep4['early'], usedEv4);
                const midEp = Math.random() < 0.5 ? '18th' : '19th';
                const pMid = pick1e4(ep4[midEp], usedEv4) || pick1e4(ep4[midEp === '18th' ? '19th' : '18th'], usedEv4);
                picked4 = [p20a, p20b, pEa, pMid].filter(Boolean);
            } else {
                // 75%: по одному из каждой эпохи
                ['early','18th','19th','20th'].forEach(ep => { const f = pick1e4(ep4[ep], usedEv4); if(f) picked4.push(f); });
            }
            if (picked4.length === 4) { target = shuffleArray(picked4); algoSuccess4 = true; }
        }
        if (!algoSuccess4) { target = shuffleArray([...allowed]).slice(0, Math.min(rowsCount, allowed.length)); }
    }
    
    window.state.currentTargetData = target; let missing = [], hiddenRowsData = [], blanksPerRow = [], availableTypes = [];
    
    const actualRows = target.length;
    blanksPerRow = Array(actualRows).fill(1); 
    let rem = Math.floor(actualRows * 1.5) - actualRows; 
    while(rem > 0) { 
        let r = Math.floor(Math.random() * actualRows); 
        if (blanksPerRow[r] < 2) { blanksPerRow[r]++; rem--; } 
    } 
    
    let totalBlanks = blanksPerRow.reduce((a,b)=>a+b,0), types = ['geo', 'event', 'year']; 
    for(let i=0; i<totalBlanks; i++) availableTypes.push(types[i % 3]); 
    
    const fakesPerType = Math.ceil(actualRows / 4), requiredFakes = { geo: fakesPerType, event: fakesPerType, year: fakesPerType };
    
    let lIdx = 0; const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М', 'Н', 'О', 'П']; 
    function popType(av, excl) { let valIds = av.map((t, i) => excl.includes(t) ? -1 : i).filter(i => i !== -1); if (valIds.length === 0) { let fallb = Math.floor(Math.random() * av.length); return av.splice(fallb, 1)[0]; } return av.splice(valIds[Math.floor(Math.random() * valIds.length)], 1)[0]; }
    
    const trFrag = document.createDocumentFragment();
    target.forEach((row, idx) => {
        const tr = document.createElement('tr'); tr.className = "border-b border-gray-100 dark:border-[#2c2c2c] bg-white dark:bg-[#1e1e1e] transition-colors hover:bg-gray-50 dark:hover:bg-[#25282a]"; tr.dataset.index = idx;
        let needed = blanksPerRow[idx], chosen = []; for(let i=0; i<needed; i++) chosen.push(popType(availableTypes, chosen)); hiddenRowsData.push({ row, types: chosen });
        ['geo', 'event', 'year'].forEach(key => {
            const td = document.createElement('td'); td.className = "p-1 sm:p-3 py-1.5 align-middle text-center overflow-hidden border-l border-gray-100 dark:border-[#2c2c2c] first:border-l-0";
            if (chosen.includes(key)) { missing.push(row[key]); td.innerHTML = `<div class="dnd-slot relative" data-expected="${String(row[key]).replace(/"/g, '&quot;')}" data-letter="${letters[lIdx] || '?'}"></div>`; lIdx++; } 
            else { const style = key === 'year' ? "font-bold text-blue-800 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"; let cH = `<span class="text-[11px] sm:text-[14px] ${style} leading-relaxed block">${row[key]}</span>`; if (key === 'geo' && typeof geoDict !== 'undefined' && geoDict[row[key]]) cH = `<span onclick="openMapModal('${row[key]}')" title="На карте" class="text-[11px] sm:text-[14px] font-bold text-blue-600 dark:text-blue-400 underline decoration-dashed cursor-pointer block">${row[key]}</span>`; td.innerHTML = cH; }
            tr.appendChild(td);
        }); trFrag.appendChild(tr);
    }); $('task-table-body').appendChild(trFrag);
    
    if (typeof bigData === 'undefined') return;
    const targetPeriodSet = new Set(target.map(t => t.c));
    let poolItems = [...missing]; const pFacts = bigData.filter(d => targetPeriodSet.has(d.c));
    
    /* --- SMART DISTRACTORS для Task4 --- */
    function autoYearTraps(yearStr) {
        const y = parseInt(yearStr, 10); if (!y) return [];
        const seen = new Set(), candidates = [];
        bigData.forEach(d => {
            const dy = parseInt(d.year, 10);
            if (dy && dy !== y && !seen.has(d.year) && Math.abs(dy - y) <= 50) { seen.add(d.year); candidates.push({ val: d.year, dist: Math.abs(dy - y) }); }
        });
        return candidates.sort((a,b) => a.dist - b.dist).slice(0, 5).map(c => c.val);
    }
    function autoGeoTraps(geoStr, period) {
        const targetGeos = new Set(target.map(t => t.geo));
        const seen = new Set(), result = [];
        shuffleArray(bigData.filter(d => d.c === period && !targetGeos.has(d.geo) && d.geo !== geoStr)).forEach(d => {
            if (!seen.has(d.geo)) { seen.add(d.geo); result.push(d.geo); }
        });
        return result.slice(0, 5);
    }
    
    ['geo', 'event', 'year'].forEach(type => {
        for(let i=0; i<requiredFakes[type]; i++) { 
            let fnd = false, att = 0, relHid = hiddenRowsData.find(h => h.types.includes(type)), trap = null; 
            // 1) Пробуем trapDict (ручные ловушки) — 60% шанс
            if (typeof trapDict !== 'undefined' && relHid && Math.random() < 0.6) { let pT = trapDict[relHid.row[type]]; if (pT && pT.length > 0) trap = pT[Math.floor(Math.random() * pT.length)]; } 
            if (trap && !poolItems.includes(trap)) { poolItems.push(trap); continue; }
            // 2) Авто-ловушки для годов (близкие даты)
            if (type === 'year' && relHid) {
                let autoTraps = autoYearTraps(relHid.row.year);
                let picked = autoTraps.find(t => !poolItems.includes(t));
                if (picked) { poolItems.push(picked); continue; }
            }
            // 3) Авто-ловушки для гео (тот же период)
            if (type === 'geo' && relHid) {
                let autoTraps = autoGeoTraps(relHid.row.geo, relHid.row.c);
                let picked = autoTraps.find(t => !poolItems.includes(t));
                if (picked) { poolItems.push(picked); continue; }
            }
            // 4) Fallback: случайный из того же периода
            while(!fnd && att < 50) { 
                let rF = pFacts[Math.floor(Math.random()*pFacts.length)], val = rF[type]; 
                if (!poolItems.includes(val)) { poolItems.push(val); fnd = true; } 
                att++; 
            } 
        }
    });
    const pFrag = document.createDocumentFragment(); shuffleArray(poolItems).forEach(txt => { const c = document.createElement('div'); c.className = "dnd-chip"; c.innerText = txt; c.dataset.pureText = txt; pFrag.appendChild(c); }); $('pool-container').appendChild(pFrag);
}

function handleSlotClick(slot) {
    if (slot.classList.contains('correct-slot') || slot.classList.contains('revealed-slot')) return; haptic('light');
    if (window.state.selectedChip) { if (slot.classList.contains('has-item')) { const oldC = slot.querySelector('.dnd-chip'); if (oldC) { oldC.classList.remove('in-slot', 'selected'); $('pool-container').appendChild(oldC); } } const newC = window.state.selectedChip; newC.classList.remove('selected'); newC.classList.add('in-slot'); slot.innerHTML = ''; slot.appendChild(newC); slot.classList.add('has-item'); slot.classList.remove('incorrect-slot'); window.state.selectedChip = null; updateSlotGlow(); } 
    else { if (slot.classList.contains('has-item')) { const oldC = slot.querySelector('.dnd-chip'); if (oldC) { oldC.classList.remove('in-slot', 'selected'); $('pool-container').appendChild(oldC); slot.innerHTML = ''; slot.classList.remove('has-item', 'incorrect-slot'); } } }
}

function updateSlotGlow() { $$('.dnd-slot').forEach(s => s.classList.toggle('slot-ready', !!window.state.selectedChip && !s.classList.contains('has-item'))); }

function checkAnswers(isSure = true) {
    const rows = $$('#task-table-body tr'); let allCorrect = true, filled = 0, total = $$('.dnd-slot').length, newlyCorrect = 0;
    rows.forEach(tr => tr.querySelectorAll('.dnd-slot').forEach(slot => { if (slot.classList.contains('has-item') && !slot.classList.contains('revealed-slot')) filled++; }));
    if (filled === 0) return showToast('⚠️', 'Заполните ячейки', 'bg-gray-800', 'border-black');

    rows.forEach((tr, idx) => {
        const fact = window.state.currentTargetData[idx]; const slots = tr.querySelectorAll('.dnd-slot'); let rowAllCor = true, rowFilled = 0;
        slots.forEach(slot => {
            if (slot.classList.contains('has-item') && !slot.classList.contains('revealed-slot')) rowFilled++;
            const chip = slot.querySelector('.dnd-chip');
            const valToCheck = chip ? (chip.dataset.pureText || chip.innerText) : null;
            if(valToCheck === slot.dataset.expected && !slot.classList.contains('revealed-slot')) { slot.classList.add('correct-slot'); slot.classList.remove('incorrect-slot'); } 
            else if (!slot.classList.contains('revealed-slot')) { rowAllCor = false; if(chip) { slot.classList.add('incorrect-slot'); slot.classList.remove('correct-slot'); } }
        });
        if (!rowAllCor || rowFilled !== slots.length) allCorrect = false;
        
        if (rowFilled > 0 && !window.state.answersRevealed) {
            if (window.state.currentMode !== 'detective') {
                let fKey = factKey(fact); let mIdx = window.state.mistakesPool.findIndex(m => mistakeMatchesFact(m, fact));
                if (!tr.dataset.scored) {
                    const tk = window.state.currentMode === 'duel' ? 'task4' : window.state.currentTask;
                    const eraKey = getEraFromFact(fact, tk);
                    if (!window.state.stats.eraStats[tk]) window.state.stats.eraStats[tk] = {};
                    if (eraKey && !window.state.stats.eraStats[tk][eraKey]) window.state.stats.eraStats[tk][eraKey] = { correct: 0, total: 0 };
                    if (eraKey) window.state.stats.eraStats[tk][eraKey].total++;
                    if (rowAllCor && rowFilled === slots.length) { if (eraKey) window.state.stats.eraStats[tk][eraKey].correct++; updateFactSRS(fKey, true, isSure); if(mIdx !== -1) window.state.mistakesPool.splice(mIdx, 1); tr.dataset.scored = "correct"; newlyCorrect++; } 
                    else { updateFactSRS(fKey, false, false); if (mIdx === -1) window.state.mistakesPool.push({ fact: fact, task: window.state.currentTask }); tr.dataset.scored = "incorrect"; }
                } else if (tr.dataset.scored === "incorrect" && rowAllCor && rowFilled === slots.length) { tr.dataset.scored = "fixed"; if(mIdx !== -1) window.state.mistakesPool.splice(mIdx, 1); }
            } else {
                if (!tr.dataset.scored) { if (rowAllCor && rowFilled === slots.length) { tr.dataset.scored = "correct"; newlyCorrect++; } else { tr.dataset.scored = "incorrect"; } } else if (tr.dataset.scored === "incorrect" && rowAllCor && rowFilled === slots.length) { tr.dataset.scored = "fixed"; }
            }
        }
    });

    // DUEL MODE INTERCEPT
    if (window.state.currentMode === 'duel') {
        // Award points for each newly correct row immediately
        if (newlyCorrect > 0) {
            if (!window.state.tableHasMistake && allCorrect && filled === total) {
                // Perfect completion — award with combo bonus
                let prevCombo = window.state.duel.myCombo || 0;
                let newCombo = prevCombo + newlyCorrect;
                let bonus = 0;
                for (let i = prevCombo + 1; i <= newCombo; i++) {
                    if (i % 5 === 0) bonus += (i / 5);
                }
                window.state.duel.myCombo = newCombo;
                window.state.duel.myScore += newlyCorrect + bonus;
                if (bonus > 0) showToast('🔥', `КОМБО x${newCombo}! Бонус +${bonus}`, 'bg-purple-600', 'border-purple-800');
                else showToast('✅', `+${newlyCorrect} строк!`, 'bg-emerald-500', 'border-emerald-700');
            } else {
                // Partial correct or had mistakes — still award per row but no combo
                window.state.duel.myScore += newlyCorrect;
                haptic('success');
                showToast('✅', `+${newlyCorrect} строк!`, 'bg-emerald-500', 'border-emerald-700');
            }
            updateScoreAndStats(newlyCorrect);
        }
        if (!allCorrect) {
            window.state.duel.myCombo = 0;
            haptic('error'); window.state.tableHasMistake = true;
            showToast('❌', 'Есть ошибки! Комбо сброшено.', 'bg-rose-500', 'border-rose-700');
            $('reveal-btn').classList.remove('hidden');
        } else if (allCorrect && filled === total) {
            haptic('success');
            $('check-buttons').classList.add('hidden'); $('reveal-btn').classList.add('hidden');
            setTimeout(() => window.generateTable(), 300);
        }
        window.updateDuelUI();
        if (window.updateDuelScoreDb) window.updateDuelScoreDb(window.state.duel.myScore, window.state.duel.myCombo);
        updateGlobalUI();
        return; // Выходим из функции, стандартная логика не нужна
    }

    let linesToRwd = newlyCorrect;
    if (linesToRwd > 0) updateScoreAndStats(linesToRwd, !window.state.tableHasMistake && allCorrect);
    window.state.stats.achievementsData.maxMistakes = Math.max(window.state.stats.achievementsData.maxMistakes || 0, window.state.mistakesPool.length);

    if (allCorrect && filled === total) {
        haptic('success'); 
        if (!window.state.tableHasMistake) { 
            window.state.stats.streak++; 
            if (window.state.stats.streak % 5 === 0 && window.state.stats.streak > 0 && !window.state.isHomeworkMode) { 
                setTimeout(() => showToast('🔥', 'Отличный стрик!', 'bg-purple-600', 'border-purple-800'), 2500); 
            } 
        }
        if (window.state.currentMode === 'speedrun') { 
            if (!window.state.tableHasMistake) { window.state.timeLeft += 25; showToast('⚡', '+25 секунд!', 'bg-purple-600', 'border-purple-800'); } 
            else showToast('✅', 'Ошибки исправлены!', 'bg-blue-500', 'border-blue-700'); 
        } 
        else if (window.state.currentMode === 'detective') {
            showToast('🕵️', 'Дело успешно закрыто!', 'bg-emerald-600', 'border-emerald-800'); 
        }
        else { 
            if (!window.state.tableHasMistake) showToast(isSure ? '✅' : '🤔', window.getJokePhrase(true), isSure ? 'bg-emerald-500' : 'bg-indigo-500', isSure ? 'border-emerald-700' : 'border-indigo-700'); 
            else showToast('✅', 'Ошибки исправлены!', 'bg-blue-500', 'border-blue-700'); 
        }
        
        $('check-buttons').classList.add('hidden'); $('check-buttons').classList.remove('flex'); $('reveal-btn').classList.add('hidden'); $('next-btn').classList.remove('hidden');
        $('next-btn').innerHTML = window.state.currentMode === 'detective' ? '📂 Следующее дело' : '➡️ Дальше';
        if (window.state.isHomeworkMode && window.state.hwTargetIndices && window.state.hwTargetIndices.length > 0) { window.state.hwCurrentPool.splice(0, rows.length); if (window.state.hwCurrentPool.length === 0) endGame(); } else { saveLocal(); syncNow(); } checkAchievements();
    } else { 
        haptic('error'); 
        window.state.stats.streak = 0; 
        window.state.tableHasMistake = true; 
        showToast('❌', window.state.currentMode === 'detective' ? 'Улики не сходятся!' : window.getJokePhrase(false), 'bg-rose-500', 'border-rose-700'); 
        $('reveal-btn').classList.remove('hidden'); 
    }
    updateGlobalUI(); window.updateZenButton();
}

function toggleAnswers() {
    window.state.answersRevealed = !window.state.answersRevealed; const btn = $('reveal-btn'); const rows = $$('#task-table-body tr'); const isDet = window.state.currentMode === 'detective';
    if (window.state.answersRevealed) {
        window.state.tableHasMistake = true; window.state.stats.streak = 0; btn.innerHTML = isDet ? '🙈 Скрыть улики' : '🙈 Скрыть ответы';
        rows.forEach((tr, idx) => {
            const fact = window.state.currentTargetData[idx]; 
            if (!window.state.isHomeworkMode && !tr.dataset.scored) { 
                tr.dataset.scored = "incorrect"; 
                if (!isDet) { 
                    updateFactSRS(factKey(fact), false, false); 
                    if (!window.state.mistakesPool.some(m => mistakeMatchesFact(m, fact))) {
                        window.state.mistakesPool.push({ fact: fact, task: window.state.currentTask }); 
                    }
                } 
            }
            tr.querySelectorAll('.dnd-slot').forEach(slot => { if (!slot.classList.contains('correct-slot')) { slot._userChildren = Array.from(slot.childNodes); slot.innerHTML = `<div class="dnd-chip in-slot revealed-chip">${slot.dataset.expected}</div>`; slot.classList.remove('incorrect-slot'); slot.classList.add('revealed-slot', 'has-item'); } });
        });
        window.state.stats.achievementsData.maxMistakes = Math.max(window.state.stats.achievementsData.maxMistakes || 0, window.state.mistakesPool.length);
        $('check-buttons').classList.add('hidden'); $('check-buttons').classList.remove('flex'); $('next-btn').classList.remove('hidden'); $('next-btn').innerHTML = isDet ? '📂 Следующее дело' : '➡️ Дальше'; updateGlobalUI(); saveLocal();
    } else {
        btn.innerHTML = isDet ? '👀 Запросить подсказку штаба' : '👀 Сдаюсь, покажи ответы';
        rows.forEach(tr => tr.querySelectorAll('.dnd-slot').forEach(slot => { if (slot.classList.contains('revealed-slot')) { slot.classList.remove('revealed-slot'); slot.innerHTML = ''; if (slot._userChildren && slot._userChildren.length > 0) { slot._userChildren.forEach(c => slot.appendChild(c)); slot.classList.add('has-item', 'incorrect-slot'); } else slot.classList.remove('has-item', 'incorrect-slot'); } }));
        $('check-buttons').classList.remove('hidden'); $('check-buttons').classList.add('flex'); $('next-btn').classList.add('hidden');
    }
    window.updateZenButton();
}

// ═══════════════════════════════════════════════════════════
//  ПРОГНОЗ БАЛЛА ЕГЭ
// ═══════════════════════════════════════════════════════════
function estimateEGEScore(stats) {
    const streaks = stats.factStreaks || {};
    const es      = stats.eraStats   || {};
    const ERAS    = ['early','18th','19th','20th'];
    const W       = { early:.30, '18th':.15, '19th':.25, '20th':.30 };

    // 1. Выученные факты по заданиям — ГЛАВНЫЙ сигнал (до +65 очков)
    // task4 — главное задание, наибольший вес
    let d4=0, d5=0, d3=0, d7=0;
    Object.entries(streaks).forEach(([k,v]) => {
        if (!v || typeof v !== 'object') return;
        const learned = v.level >= 1 || (v.level === 0 && (v.streak||0) >= 3);
        if (!learned) return;
        if (k.startsWith('t5_'))      d5++;
        else if (k.startsWith('t7_')) d7++;
        else if (k.startsWith('t3_')) d3++;
        else                          d4++;
    });
    // Нормировка: кол-во фактов на «100%» вклад по каждому заданию
    // task4 на ~20% выше task3, на ~25% выше task5; task7 — наименьший
    const s4 = 20 * Math.min(d4 / 500, 1);  // task4: max +20 (главное задание)
    const s3 = 17 * Math.min(d3 / 150, 1);  // task3: max +17 (20% ниже task4)
    const s5 = 16 * Math.min(d5 / 250, 1);  // task5: max +16 (25% ниже task4)
    const s7 = 12 * Math.min(d7 / 180, 1);  // task7: max +12 (наименьший)
    const factBase = s4 + s5 + s3 + s7;     // 0–65

    // 2. Баланс эпох — штраф если эпоха недорешена (до −25 очков)
    const isNew = !!(es.task4 || es.task3);
    const eTot = {}; let sumT = 0;
    ERAS.forEach(era => {
        let t = 0;
        (isNew ? ['task3','task4','task5','task7'] : [null]).forEach(tk => {
            const e = tk ? (es[tk]||{})[era] : es[era];
            if (e) t += e.total || 0;
        });
        eTot[era] = t; sumT += t;
    });
    let pen = 0, minR = 1, weakEra = null;
    if (sumT >= 40) {
        ERAS.forEach(era => {
            const a = eTot[era] / sumT, ex = W[era];
            const r = a / ex;
            if (r < minR) { minR = r; weakEra = era; }
            if (a < ex * 0.5) {
                const def = (ex * 0.5 - a) / (ex * 0.5);
                pen += def * W[era] * 25;
            }
        });
    }
    pen = Math.min(pen, 25);

    // 3. Точность — мягкая поправка ±5 (норма 85–94%)
    let tc = 0, tt = 0;
    (isNew ? ['task3','task4','task5','task7'] : [null]).forEach(tk => {
        ERAS.forEach(era => {
            const e = tk ? (es[tk]||{})[era] : es[era];
            if (e) { tc += e.correct||0; tt += e.total||0; }
        });
    });
    const accAdj = tt >= 30 ? Math.max(-15, Math.min(15, (tc/tt - 0.87) * 200)) : 0;

    // 4. Потолок от слабейшей эпохи + итог
    const ceil = sumT >= 40 ? Math.round(55 + 45 * Math.min(minR, 1)) : 100;
    const raw  = 20 + factBase - pen + accAdj;
    const score = Math.max(20, Math.min(100, Math.min(ceil, Math.round(raw))));

    const ERA_NAMES = { early:'До XVIII в.', '18th':'XVIII в.', '19th':'XIX в.', '20th':'XX в.' };
    return { score, ceiling: ceil, factBase: Math.round(factBase), pen: Math.round(pen),
             accAdj: Math.round(accAdj), d4, d5, d3, d7, s4, s5, s3, s7,
             weakEra: weakEra ? ERA_NAMES[weakEra] : null,
             accuracy: tt >= 30 ? Math.round(tc/tt*100) : null };
}

window.loadProgressFromCloud = async function() {}; window.syncProgressToCloud = async function() {}; window.loadClassProgress = function() {};

// FIX 3.2: Централизованное делегирование событий через data-action.
// Заменяет десятки inline onclick="func()" → один обработчик на document.
// HTML кнопки используют: data-action="actionName" и опционально data-arg / data-arg2.
document.addEventListener('click', function(e) {
    // Backdrop-клик: только если пользователь кликнул точно по оверлею, а не по его содержимому
    if (e.target.dataset.backdrop && e.target === e.target.closest('[data-backdrop]')) {
        const fn = window[e.target.dataset.backdrop];
        if (typeof fn === 'function') fn();
        return;
    }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const arg  = el.dataset.arg  || null;
    const arg2 = el.dataset.arg2 || null;

    const handlers = {
        // Лобби
        handleLogoClick:        () => window.handleLogoClick && window.handleLogoClick(),
        openGlobalSettings:     () => window.openGlobalSettings && window.openGlobalSettings(),
        openStatsModal:         () => window.openStatsModal && window.openStatsModal(),
        openGlobalTopModal:     () => window.openGlobalTopModal && window.openGlobalTopModal(),
        openEGEModal:           () => window.openEGEModal && window.openEGEModal(),
        toggleFocusMode:        () => window.toggleFocusMode && window.toggleFocusMode(),
        toggleTheme:            () => window.toggleTheme && window.toggleTheme(),
        startDuelSearch:        () => window.startDuelSearch && window.startDuelSearch(),
        cancelDuelSearch:       () => window.cancelDuelSearch && window.cancelDuelSearch(),
        startHwFromBanner:      () => window.startHwFromBanner && window.startHwFromBanner(),
        backToLobby:            () => window.backToLobby && window.backToLobby(),
        // Карточки заданий лобби: data-arg="task4" data-arg2="normal"
        quickStartGame:         () => window.quickStartGame && window.quickStartGame(arg, arg2 || 'normal'),
        pickTaskForMode:        () => window.pickTaskForMode && window.pickTaskForMode(arg),
        confirmTaskPick:        () => window.confirmTaskPick && window.confirmTaskPick(arg),
        closeTaskPicker:        () => window.closeTaskPicker && window.closeTaskPicker(),
        // Игровые кнопки
        checkAnswersTrue:       () => window.checkAnswers && window.checkAnswers(true),
        checkAnswersFalse:      () => window.checkAnswers && window.checkAnswers(false),
        generateTable:          () => window.generateTable && window.generateTable(),
        toggleAnswers:          () => window.toggleAnswers && window.toggleAnswers(),
        // Красный карандаш
        giveUpRedPencil:        () => window.giveUpRedPencil && window.giveUpRedPencil(),
        nextRedPencilCase:      () => window.nextRedPencilCase && window.nextRedPencilCase(),
        // Настройки
        applyGlobalSettings:    () => window.applyGlobalSettings && window.applyGlobalSettings(),
        closePreGameModal:      () => window.closePreGameModal && window.closePreGameModal(),
        checkCustomPeriod:      () => window.checkCustomPeriod && window.checkCustomPeriod(),
        setPgRows:              () => window.setPgRows && window.setPgRows(Number(arg)),
        // Онбординг
        nextOnbStep:            () => window.nextOnbStep && window.nextOnbStep(Number(arg)),
        finishOnboarding:       () => window.finishOnboarding && window.finishOnboarding(),
        // Модалки
        hideModal:              () => window.hideModal && window.hideModal(arg),
        openProfileModal:       () => window.openProfileModal && window.openProfileModal(),
        openAchievementsModal:  () => window.openAchievementsModal && window.openAchievementsModal(),
        openMistakesListModal:  () => window.openMistakesListModal && window.openMistakesListModal(),
        copyTextReport:         () => window.copyTextReport && window.copyTextReport(),
        shareTelegram:          () => window.shareTelegram && window.shareTelegram(),
        closeGameOverModal:     () => window.closeGameOverModal && window.closeGameOverModal(),
        signInWithGoogle:       () => window.signInWithGoogle && window.signInWithGoogle(),
        saveProfileName:        () => window.saveProfileName && window.saveProfileName(),
        saveTeacherClassCode:   () => window.saveTeacherClassCode && window.saveTeacherClassCode(),
        switchTeacherTab:       () => window.switchTeacherTab && window.switchTeacherTab(arg),
        // Домашнее задание
        selectHwTask:           () => window.selectHwTask && window.selectHwTask(arg),
        setHwRows:              () => window.setHwRows && window.setHwRows(Number(arg)),
        setHwDeadline:          () => window.setHwDeadline && window.setHwDeadline(Number(arg)),
        submitAssignHw:         () => window.submitAssignHw && window.submitAssignHw(),
        nextStudyCard:          () => window.nextStudyCard && window.nextStudyCard(),
        openMapModal:           () => window.openMapModal && window.openMapModal(arg),
    };

    if (handlers[action]) {
        e.stopPropagation();
        handlers[action]();
    }
}, true); // capture: true — срабатывает раньше любых других onClick

document.addEventListener('DOMContentLoaded', initStorage);

