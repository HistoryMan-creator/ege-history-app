// state.js — управление состоянием, сохранение, SRS, пулы данных, ачивки
'use strict';

// --- Инициализация глобальных данных из data.js ---
window.task7Data = typeof task7Data !== 'undefined' ? task7Data : [];
window.task7Top100Data = typeof task7Top100Data !== 'undefined' ? task7Top100Data : window.task7Data;

// --- Глобальное состояние ---
window.state = {
    selectedChip: null,
    currentTask: 'task4',
    pendingTask: 'task4',
    pendingMode: 'normal',
    stats: {
        streak: 0,
        totalSolvedEver: 0,
        solvedByTask: { task3: 0, task4: 0, task5: 0, task7: 0 },
        flashcardsSolved: 0,
        eraStats: {},
        factStreaks: {},
        totalTimeSpent: 0,
        bestSpeedrunScore: 0,
        dailyStats: {},
        hwFlashcardsToSolve: 0,
        hwTask3: 0, hwTask4: 0, hwTask5: 0, hwTask7: 0,
        achievements: [],
        achievementsData: { nightOwls: 0, earlyBirds: 0, hwDone: 0, hwPerfect: 0, maxMistakes: 0 }
    },
    mistakesPool: [],
    currentTargetData: [],
    currentMode: 'normal',
    timeLeft: 0,
    timerInterval: null,
    hideLearned: false,
    isHomeworkMode: false,
    hwTargetIndices: [],
    hwCurrentPool: [],
    answersRevealed: false,
    isTeacherAdmin: false,
    focusMode: false,
    studyIndex: 0,
    errorStreak: 0,
    duel: {
        active: false, matchId: null, isPlayer1: false,
        oppName: '', myScore: 0, myCombo: 0, oppScore: 0, oppCombo: 0, searching: false
    }
};

// --- Прекомпилированные пулы ---
const precomputed = { task3: {}, task4: {}, task5: {}, task7: {} };
const periodsList = ['all', 'early', '18th', '19th', '20th'];

function initPrecomputed() {
    window.bigData   = typeof bigData   !== 'undefined' ? bigData   : (window.bigData   || []);
    window.task3Data = typeof task3Data !== 'undefined' ? task3Data : (window.task3Data || []);
    window.task5Data = typeof task5Data !== 'undefined' ? task5Data : (window.task5Data || []);
    window.task7Data = typeof task7Data !== 'undefined' ? task7Data : (window.task7Data || []);
    window.task7Top100Data = typeof task7Top100Data !== 'undefined' ? task7Top100Data : (window.task7Top100Data || window.task7Data || []);

    const totalItems = (window.bigData?.length || 0) + (window.task3Data?.length || 0) +
                       (window.task5Data?.length || 0) + (window.task7Data?.length || 0);
    if (totalItems === 0) {
        console.error('[data.js] База данных не загружена!');
        const errBanner = document.createElement('div');
        errBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ef4444;color:white;text-align:center;padding:12px;font-weight:900;font-size:14px';
        errBanner.textContent = '⚠️ База вопросов не загружена. Обновите страницу.';
        document.body.prepend(errBanner);
    }

    // task5Data: присваиваем поле c по году
    window.task5Data.forEach(d => {
        if (!d.c) {
            const y = parseInt(d.year, 10) || 0;
            d.c = y < 1700 ? 'early' : y < 1800 ? '18th' : y < 1900 ? '19th' : '20th';
        }
    });

    const filterData = (data, p) => p === 'all' ? [...(data || [])] : (data || []).filter(d => d.c === p);
    periodsList.forEach(p => {
        precomputed.task3[p] = filterData(window.task3Data, p);
        precomputed.task4[p] = filterData(window.bigData, p);
        precomputed.task5[p] = filterData(window.task5Data, p);
        precomputed.task7[p] = filterData(window.task7Data, p);
    });
}

// --- Пулы данных ---
function getBasePool(period) {
    period = period || 'all';
    const task = window.state.currentTask;
    let dbType = $('filter-database') ? $('filter-database').value : 'top100';

    if (task === 'task7') {
        const baseData = dbType === 'top100'
            ? (window.task7Top100Data || window.task7Data || [])
            : (window.task7Data || []);
        if (period === 'custom') {
            const startY = parseInt($('custom-year-start').value) || 0;
            const endY = parseInt($('custom-year-end').value) || 3000;
            return baseData.filter(d => { const y = getYearFromFact(d); return y >= startY && y <= endY; });
        }
        return period === 'all' ? [...baseData] : baseData.filter(d => d.c === period);
    }

    const baseData = (TASK_CONFIG[task] || TASK_CONFIG.task4).data();
    if (period === 'custom') {
        const startY = parseInt($('custom-year-start').value) || 0;
        const endY = parseInt($('custom-year-end').value) || 3000;
        return baseData.filter(d => { const y = getYearFromFact(d); return y >= startY && y <= endY; });
    }
    if (task === 'task3') {
        return period === 'all' ? [...baseData] : baseData.filter(d => d.c === period);
    }
    return precomputed[task][period] || baseData;
}

function getFilteredPool(period, limit) {
    limit = limit || 0;
    const now = Date.now();
    let pool = getBasePool(period);

    if (window.state.currentMode === 'mistakes') {
        let mistakes = window.state.mistakesPool
            .filter(m => m.task === window.state.currentTask)
            .map(m => m.fact);
        let expired = pool.filter(f => {
            const d = window.state.stats.factStreaks[factKey(f)];
            return d && d.level > 0 && d.nextReview <= now;
        });
        pool = [...mistakes, ...expired];
        const cfg = TASK_CONFIG[window.state.currentTask] || TASK_CONFIG.task4;
        const uniqueEvents = new Set();
        const uniquePool = [];
        for (const f of pool) {
            const k = cfg.dedupeKey(f);
            if (!uniqueEvents.has(k)) { uniqueEvents.add(k); uniquePool.push(f); }
        }
        pool = uniquePool;
        if (pool.length === 0) {
            showToast('🎉', 'Ошибок и забытых фактов нет! Возврат в Обучение.', 'bg-emerald-500', 'border-emerald-700');
            setTimeout(() => backToLobby(), 1500);
            return null;
        }
    } else if (window.state.hideLearned) {
        pool = pool.filter(f => {
            const d = window.state.stats.factStreaks[factKey(f)];
            return !(d && d.level > 0 && d.nextReview > now);
        });
        if (pool.length < (limit || 1)) {
            showToast('ℹ️', 'В этом фильтре всё свежо в памяти!', 'bg-blue-600', 'border-blue-800');
            $('toggle-hide-learned').checked = false;
            window.state.hideLearned = false;
            return getFilteredPool(period, limit);
        }
    }
    return pool;
}

// --- SRS (Spaced Repetition System) ---
function updateFactSRS(fKey, isCorrect, isSure) {
    const now = Date.now();
    let data = window.state.stats.factStreaks[fKey] ||
        { points: 0, level: 0, nextReview: 0, lastUpdated: now };

    // Миграция старых форматов
    if (typeof data === 'number') {
        data = { points: data >= 3 ? 3 : data, level: data >= 3 ? 1 : 0,
                 nextReview: data >= 3 ? now + 12*3600000 : 0, lastUpdated: now };
    }
    if (data.streak !== undefined) {
        data = { points: data.streak >= 3 ? 3 : data.streak, level: data.streak >= 3 ? 1 : 0,
                 nextReview: data.streak >= 3 ? now + 12*3600000 : 0, lastUpdated: now };
    }

    if (!isCorrect) {
        data.points = 0; data.level = 0; data.nextReview = 0;
    } else if (data.level === 0) {
        data.points += isSure ? 1 : 0.7;
        if (data.points >= 3) {
            data.points = 3; data.level = 1;
            data.nextReview = now + 12 * 3600000;
        }
    } else {
        if (isSure) {
            const intervals = { 1: 24*3600000, 2: 3*24*3600000, 3: 7*24*3600000 };
            const nextLevel = Math.min(data.level + 1, 4);
            data.level = nextLevel;
            data.nextReview = now + (intervals[data.level - 1] || 7*24*3600000);
        } else {
            data.nextReview = now + 12 * 3600000;
        }
    }
    data.lastUpdated = now;
    window.state.stats.factStreaks[fKey] = data;
    return data;
}

// --- Сохранение ---
const STORAGE_KEY = 'ege_final_storage_v4';
const SAVE_FIELDS = [
    'streak', 'totalSolvedEver', 'solvedByTask', 'flashcardsSolved',
    'eraStats', 'factStreaks', 'hwFlashcardsToSolve', 'totalTimeSpent',
    'bestSpeedrunScore', 'dailyStats', 'achievements', 'achievementsData'
];

function buildSavePayload() {
    const s = window.state.stats;
    const payload = {};
    SAVE_FIELDS.forEach(k => { payload[k] = s[k]; });
    payload.mistakesPool = window.state.mistakesPool;
    payload.hideLearned = window.state.hideLearned;
    return payload;
}

function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSavePayload()));
}

let _cloudSyncTimer = null;
function scheduleSyncToCloud() {
    if (_cloudSyncTimer) clearTimeout(_cloudSyncTimer);
    _cloudSyncTimer = setTimeout(() => {
        _cloudSyncTimer = null;
        if (window.syncProgressToCloud) window.syncProgressToCloud();
    }, 2 * 60 * 1000);
}

function syncNow() {
    if (_cloudSyncTimer) { clearTimeout(_cloudSyncTimer); _cloudSyncTimer = null; }
    if (window.syncProgressToCloud) window.syncProgressToCloud();
}

function saveProgress() {
    saveLocal();
    scheduleSyncToCloud();
}

// --- Статистика ---
function updateScoreAndStats(linesCount, isPerfectHw) {
    isPerfectHw = isPerfectHw || false;
    const s = window.state.stats;
    const curTask = window.state.currentTask || 'task4';
    s.totalSolvedEver += linesCount;
    if (!s.solvedByTask) s.solvedByTask = { task3: 0, task4: 0, task5: 0, task7: 0 };
    s.solvedByTask[curTask] = (s.solvedByTask[curTask] || 0) + linesCount;

    const today = getTodayString();
    if (!s.dailyStats[today]) s.dailyStats[today] = { timeSpent: 0, solved: 0 };
    s.dailyStats[today].solved += linesCount;
    const dtKey = 'solved' + curTask.charAt(0).toUpperCase() + curTask.slice(1);
    s.dailyStats[today][dtKey] = (s.dailyStats[today][dtKey] || 0) + linesCount;

    const h = new Date().getHours();
    if (h >= 0 && h < 5) s.achievementsData.nightOwls += linesCount;
    if (h >= 5 && h < 8) s.achievementsData.earlyBirds += linesCount;

    if (s.hwFlashcardsToSolve > 0) {
        s.hwFlashcardsToSolve = Math.max(0, s.hwFlashcardsToSolve - linesCount);
        if (s.hwFlashcardsToSolve === 0) {
            s.achievementsData.hwDone++;
            if (isPerfectHw) s.achievementsData.hwPerfect++;
            setTimeout(() => showToast('🎉', 'Долг учителю выполнен!', 'bg-emerald-500', 'border-emerald-700'), 2000);
        }
    }
    saveLocal();
    updateGlobalUI();
}

// --- Ачивки ---
function checkAchievements() {
    if (!window.state.stats.achievements) window.state.stats.achievements = [];
    if (!window.state.stats.achievementsData) window.state.stats.achievementsData = { nightOwls: 0, earlyBirds: 0, hwDone: 0, hwPerfect: 0, maxMistakes: 0 };
    let unlockedAny = false;
    if (typeof achievementsList !== 'undefined') {
        achievementsList.forEach(ach => {
            if (!window.state.stats.achievements.includes(ach.id) && ach.check(window.state.stats)) {
                window.state.stats.achievements.push(ach.id);
                unlockedAny = true;
                showToast('🏆', `Ачивка открыта: ${ach.name}!`, 'bg-yellow-500', 'border-yellow-700');
            }
        });
    }
    if (unlockedAny) saveProgress();
}

// --- Загрузка из localStorage ---
function loadFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        Object.assign(window.state.stats, parsed);
        if (parsed.streak !== undefined) window.state.stats.streak = parsed.streak;
        if (parsed.mistakesPool) window.state.mistakesPool = parsed.mistakesPool;
        if (parsed.hideLearned !== undefined) window.state.hideLearned = parsed.hideLearned;

        // Гарантируем структуру
        if (!window.state.stats.dailyStats) window.state.stats.dailyStats = {};
        if (window.state.stats.flashcardsSolved === undefined) window.state.stats.flashcardsSolved = 0;
        if (window.state.stats.hwFlashcardsToSolve === undefined) window.state.stats.hwFlashcardsToSolve = 0;
        if (!window.state.stats.achievements) window.state.stats.achievements = [];
        if (!window.state.stats.achievementsData) window.state.stats.achievementsData = { nightOwls: 0, earlyBirds: 0, hwDone: 0, hwPerfect: 0, maxMistakes: 0 };
        if (!window.state.stats.solvedByTask) window.state.stats.solvedByTask = { task3: 0, task4: 0, task5: 0, task7: 0 };

        // Миграция factStreaks
        const now = Date.now();
        for (const key in window.state.stats.factStreaks) {
            let data = window.state.stats.factStreaks[key];
            if (typeof data === 'number') {
                window.state.stats.factStreaks[key] = {
                    points: data >= 3 ? 3 : data, level: data >= 3 ? 1 : 0,
                    nextReview: data >= 3 ? now + 12*3600000 : 0, lastUpdated: now
                };
            } else if (data && data.streak !== undefined) {
                window.state.stats.factStreaks[key] = {
                    points: data.streak >= 3 ? 3 : data.streak, level: data.streak >= 3 ? 1 : 0,
                    nextReview: data.streak >= 3 ? now + 12*3600000 : 0, lastUpdated: data.lastUpdated || now
                };
            }
        }

        // Миграция eraStats
        const eras = window.state.stats.eraStats || {};
        const oldFormat = TASK_EPOCHS.some(k => eras[k] && typeof eras[k].correct === 'number');
        if (oldFormat) {
            const migrated = { task3: {}, task4: {}, task5: {}, task7: {} };
            for (const era of TASK_EPOCHS) {
                if (eras[era]) {
                    migrated.task4[era] = { ...eras[era] };
                    ['task3', 'task5', 'task7'].forEach(tk => { migrated[tk][era] = { correct: 0, total: 0 }; });
                }
            }
            window.state.stats.eraStats = migrated;
        }
        for (const tk of TASK_LIST) {
            if (!window.state.stats.eraStats[tk]) window.state.stats.eraStats[tk] = {};
            for (const era of TASK_EPOCHS) {
                if (!window.state.stats.eraStats[tk][era]) window.state.stats.eraStats[tk][era] = { correct: 0, total: 0 };
            }
        }
    } catch (e) {
        console.error('[loadFromStorage]', e);
    }
}

// --- Прогноз ЕГЭ ---
function estimateEGEScore(stats) {
    const streaks = stats.factStreaks || {};
    const es = stats.eraStats || {};
    const ERAS = TASK_EPOCHS;
    const W = ERA_WEIGHTS;

    let d4 = 0, d5 = 0, d3 = 0, d7 = 0;
    Object.entries(streaks).forEach(([k, v]) => {
        if (!v || typeof v !== 'object') return;
        const learned = v.level >= 1 || (v.level === 0 && (v.streak || 0) >= 3);
        if (!learned) return;
        if (k.startsWith('t5_'))      d5++;
        else if (k.startsWith('t7_')) d7++;
        else if (k.startsWith('t3_')) d3++;
        else                          d4++;
    });

    const s4 = 20 * Math.min(d4 / 500, 1);
    const s3 = 17 * Math.min(d3 / 150, 1);
    const s5 = 16 * Math.min(d5 / 250, 1);
    const s7 = 12 * Math.min(d7 / 180, 1);
    const factBase = s4 + s5 + s3 + s7;

    const isNew = !!(es.task4 || es.task3);
    const eTot = {};
    let sumT = 0;
    ERAS.forEach(era => {
        let t = 0;
        (isNew ? TASK_LIST : [null]).forEach(tk => {
            const e = tk ? (es[tk] || {})[era] : es[era];
            if (e) t += e.total || 0;
        });
        eTot[era] = t;
        sumT += t;
    });

    let pen = 0, minR = 1, weakEra = null;
    if (sumT >= 40) {
        ERAS.forEach(era => {
            const a = eTot[era] / sumT, ex = W[era];
            const r = a / ex;
            if (r < minR) { minR = r; weakEra = era; }
            if (a < ex * 0.5) pen += ((ex * 0.5 - a) / (ex * 0.5)) * W[era] * 25;
        });
    }
    pen = Math.min(pen, 25);

    let tc = 0, tt = 0;
    (isNew ? TASK_LIST : [null]).forEach(tk => {
        ERAS.forEach(era => {
            const e = tk ? (es[tk] || {})[era] : es[era];
            if (e) { tc += e.correct || 0; tt += e.total || 0; }
        });
    });
    const accAdj = tt >= 30 ? Math.max(-15, Math.min(15, (tc / tt - 0.87) * 200)) : 0;

    const ceil = sumT >= 40 ? Math.round(55 + 45 * Math.min(minR, 1)) : 100;
    const raw = 20 + factBase - pen + accAdj;
    const score = Math.max(20, Math.min(100, Math.min(ceil, Math.round(raw))));

    const ERA_NAMES = { early: 'До XVIII в.', '18th': 'XVIII в.', '19th': 'XIX в.', '20th': 'XX в.' };
    return {
        score, ceiling: ceil, factBase: Math.round(factBase),
        pen: Math.round(pen), accAdj: Math.round(accAdj),
        d4, d5, d3, d7, s4, s5, s3, s7,
        weakEra: weakEra ? ERA_NAMES[weakEra] : null,
        accuracy: tt >= 30 ? Math.round(tc / tt * 100) : null
    };
}

// --- Прогресс по заданиям ---
function getTaskProgress(task) {
    const streaks = window.state.stats.factStreaks || {};
    let learned = 0;
    const cfg = TASK_CONFIG[task];
    const prefix = cfg ? (cfg.prefix || null) : null;

    for (const [key, val] of Object.entries(streaks)) {
        const match = prefix
            ? key.startsWith(prefix)
            : (!key.startsWith('t5_') && !key.startsWith('t7_') && !key.startsWith('t3_'));
        if (match && window.isFactLearned(val)) learned++;
    }

    let total = 0;
    try { total = (TASK_CONFIG[task] || TASK_CONFIG.task4).data().length; } catch (e) {}
    return { learned, total: total || 1 };
}

function updateProgressBars() {
    TASK_LIST.forEach(task => {
        const info = getTaskProgress(task);
        const pct = Math.min(100, Math.round((info.learned / info.total) * 100));
        const bar = $('progress-bar-' + task);
        const txt = $('progress-text-' + task);
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = info.learned + ' / ' + info.total + ' выучено';
    });
}

// Заглушки для облачных функций (firebase-sync.js перезапишет)
window.loadProgressFromCloud = async function() {};
window.syncProgressToCloud = async function() {};
window.loadClassProgress = function() {};
