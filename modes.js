// modes.js — игровые режимы: flashcards, study, redpencil, detective, duel
// Зависимости: config.js, utils.js, state.js, table.js
'use strict';

// ═══════════════════════════════════════════════════════════
//  ДУЭЛЬ (PvP)
// ═══════════════════════════════════════════════════════════

let duelSearchTimer = null;
let duelSearchSeconds = 0;

window.startDuelSearch = function() {
    haptic('medium');
    showModal('duel-search-modal');
    $('duel-search-status').innerText = "Поиск соперника...";
    duelSearchSeconds = 0;
    $('duel-search-timer').innerText = `Ожидание: 0с`;
    duelSearchTimer = setInterval(() => {
        duelSearchSeconds++;
        $('duel-search-timer').innerText = `Ожидание: ${duelSearchSeconds}с`;
        if (duelSearchSeconds > 30) window.cancelDuelSearch('Никого нет в сети 😢');
    }, 1000);
    if (window.startDuelSearchDb) window.startDuelSearchDb();
};

window.cancelDuelSearch = function(msg) {
    haptic('light');
    clearInterval(duelSearchTimer);
    hideModal('duel-search-modal');
    if (msg) showToast('ℹ️', msg, 'bg-blue-500', 'border-blue-700');
    if (window.cancelDuelDb) window.cancelDuelDb();
};

window.initDuelStart = function(startTime) {
    clearInterval(duelSearchTimer);
    haptic('success');
    $('duel-search-status').innerText = "СОПЕРНИК НАЙДЕН!";
    $('cancel-duel-btn').classList.add('hidden');
    $('duel-search-timer').innerText = (window.state.duel.oppName || 'Соперник') + " готовится...";
    const startWait = setInterval(() => {
        const left = startTime - Date.now();
        if (left <= 0) { clearInterval(startWait); hideModal('duel-search-modal'); window.startDuelGame(); }
        else { $('duel-search-timer').innerText = `Начинаем через ${Math.ceil(left / 1000)}...`; }
    }, 100);
};

window.startDuelGame = function() {
    $('lobby-area').classList.add('hidden');
    $('game-container').classList.remove('hidden');
    $('game-container').classList.add('flex');
    document.body.classList.add('in-game');
    $('bottom-nav').classList.add('hide-nav');

    ['flashcard-area', 'study-area', 'visual-trainer-area', 'redpencil-area'].forEach(id => {
        const el = $(id); if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    const ca = $('classic-task-area');
    if (ca) { ca.classList.remove('hidden'); ca.classList.add('flex', 'lg:flex-row'); }

    window.state.currentTask = 'task4';
    $('filter-task').value = 'task4';
    window.state.currentMode = 'duel';
    Object.assign(window.state.duel, { active: true, myScore: 0, myCombo: 0, oppScore: 0, oppCombo: 0 });
    window.state.timeLeft = 60;

    $('game-header').classList.add('hidden');
    $('duel-header').classList.remove('hidden');
    $('duel-header').classList.add('flex');
    $('duel-opp-name').innerText = window.state.duel.oppName || "Соперник";
    window.updateDuelUI();
    window.generateTable();

    window.state.timerInterval = setInterval(() => {
        window.state.timeLeft--;
        $('duel-timer').innerText = window.state.timeLeft;
        if (window.state.timeLeft <= 0) window.endDuel();
    }, 1000);
};

window.updateDuelUI = function() {
    if (!window.state.duel?.active) return;
    $('duel-my-score').innerText = window.state.duel.myScore;
    $('duel-opp-score').innerText = window.state.duel.oppScore;
    $('duel-my-combo').innerText = `🔥 ${window.state.duel.myCombo}`;
    $('duel-opp-combo').innerText = `🔥 ${window.state.duel.oppCombo}`;
};

window.endDuel = function() {
    clearInterval(window.state.timerInterval);
    const myS = window.state.duel.myScore, oppS = window.state.duel.oppScore;
    window.state.duel.active = false;
    if (window.cancelDuelDb) window.cancelDuelDb();

    let emoji = '😐', title = 'НИЧЬЯ', color = 'text-gray-500';
    if (myS > oppS) { emoji = '🏆'; title = 'ПОБЕДА!'; color = 'text-emerald-500'; haptic('success'); }
    else if (myS < oppS) { emoji = '💔'; title = 'ПОРАЖЕНИЕ'; color = 'text-rose-500'; haptic('error'); }

    $('modal-emoji').innerText = emoji;
    $('modal-main-title').innerText = title;
    $('modal-score').innerHTML = `<span class="${color}">${myS}</span> <span class="text-gray-400 text-3xl mx-2">:</span> <span class="text-gray-500">${oppS}</span>`;
    showModal('game-over-modal');
    $('board-overlay').classList.remove('hidden');
    saveLocal();
    syncNow();
    updateGlobalUI();
};

// ═══════════════════════════════════════════════════════════
//  ФЛЕШ-КАРТОЧКИ
// ═══════════════════════════════════════════════════════════

window.nextFlashcard = function() {
    const allowed = getFilteredPool($('filter-period').value || 'all');
    if (!allowed || allowed.length === 0) {
        $('flashcard-area').innerHTML = '<div class="text-center p-10 w-full"><h2 class="text-xl font-bold text-rose-500 bg-white dark:bg-[#1e1e1e] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-[#2c2c2c]">⚠️ В этом периоде нет событий!</h2></div>';
        return;
    }
    const fact = allowed[Math.floor(Math.random() * allowed.length)];
    const d = window.state.stats.factStreaks[factKey(fact)];
    const task = window.state.currentTask;
    const cfg = TASK_CONFIG[task];

    const labelMap = { task3: 'Процесс', task4: 'Событие', task5: 'Участник', task7: 'Памятник культуры' };
    const titleMap = { task3: f => f.process, task4: f => f.event, task5: f => f.person, task7: f => f.culture };

    const tpl = $('flashcard-template-front').content.cloneNode(true);
    tpl.querySelector('.fc-level-badge').innerText = `Ур: ${d ? d.level || 0 : 0} | Балл: ${d ? (d.points || 0).toFixed(1) : 0}/3`;
    tpl.querySelector('.fc-label').innerText = labelMap[task] || 'Событие';
    tpl.querySelector('.fc-title').innerText = titleMap[task](fact);
    const area = $('flashcard-area');
    area.innerHTML = '';
    area.appendChild(tpl);
    window.state.currentFlashcardFact = fact;
};

window.flipFlashcard = function(card) {
    if (card.classList.contains('flipped')) return;
    card.classList.add('flipped');
    haptic('medium');
    const fact = window.state.currentFlashcardFact;
    const task = window.state.currentTask;
    card.className = "w-full max-w-md bg-blue-50 dark:bg-[#1e1e1e] rounded-3xl shadow-[0_8px_30px_rgba(59,130,246,0.15)] p-6 min-h-[300px] flex flex-col items-center justify-center text-center border-2 border-blue-200 dark:border-[#2c2c2c] transition-all duration-300 relative flipped";
    card.onclick = null;

    const contentMap = {
        task3: () => `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-emerald-100 dark:border-[#2c2c2c] w-full text-center mb-3"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Факт</span><span class="text-[14px] font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">${fact.fact}</span></div><div class="bg-white dark:bg-[#181818]/50 p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-[#2c2c2c] w-full text-center"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Год</span><span class="text-2xl font-black text-examBlue dark:text-blue-300">${fact.year}</span></div>`,
        task4: () => {
            let mapLink = '';
            if (fact.geo && typeof geoDict !== 'undefined' && geoDict[fact.geo]) mapLink = `<span onclick="window.openMapModal('${fact.geo}')" class="mt-2 text-[12px] font-bold text-blue-600 underline decoration-dashed cursor-pointer">Показать на карте</span>`;
            return `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-blue-100 dark:border-[#2c2c2c] w-full mb-3"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Год</span><span class="text-3xl font-black text-examBlue dark:text-blue-300">${fact.year}</span></div><div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-green-100 dark:border-[#2c2c2c] flex flex-col items-center w-full"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Место</span><span class="text-xl font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">${fact.geo}</span>${mapLink}</div>`;
        },
        task5: () => `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-purple-100 dark:border-[#2c2c2c] w-full text-center"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Событие</span><span class="text-lg sm:text-xl font-bold text-purple-700 dark:text-purple-400 leading-relaxed">${fact.event}</span></div>`,
        task7: () => `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-amber-100 dark:border-[#2c2c2c] w-full text-center mb-3"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Характеристика</span><span class="text-[14px] font-bold text-amber-700 dark:text-amber-400 leading-relaxed">${fact.trait}</span></div><div class="bg-white dark:bg-[#181818]/50 p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-[#2c2c2c] w-full text-center"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Создание</span><span class="text-2xl font-black text-examBlue dark:text-blue-300">${fact.year}</span></div>`,
    };

    const tpl = $('flashcard-template-back').content.cloneNode(true);
    tpl.querySelector('.fc-content').innerHTML = (contentMap[task] || contentMap.task4)();
    card.innerHTML = '';
    card.appendChild(tpl);
    setTimeout(() => window.updateZenButton(), 50);
};

window.answerFlashcard = function(isCorrect, isSure, e) {
    e.stopPropagation();
    const fact = window.state.currentFlashcardFact;
    const fKey = factKey(fact);
    const task = window.state.currentTask;
    const mIdx = window.state.mistakesPool.findIndex(m => mistakeMatchesFact(m, fact));

    // FIX #3: трекаем eraStats для флеш-карточек
    const eraKey = getEraFromFact(fact, task);
    if (eraKey) {
        if (!window.state.stats.eraStats[task]) window.state.stats.eraStats[task] = {};
        if (!window.state.stats.eraStats[task][eraKey]) window.state.stats.eraStats[task][eraKey] = { correct: 0, total: 0 };
        window.state.stats.eraStats[task][eraKey].total++;
        if (isCorrect) window.state.stats.eraStats[task][eraKey].correct++;
    }

    if (isCorrect) {
        haptic('success');
        const d = updateFactSRS(fKey, true, isSure);
        if (mIdx !== -1) window.state.mistakesPool.splice(mIdx, 1);
        window.state.stats.streak++;
        if (d.level > 0) showToast('🧠', isSure ? 'Отлично! Уровень повышен' : 'Повторим завтра', 'bg-emerald-500', 'border-emerald-700');
        else showToast(isSure ? '✅' : '🤔', window.getJokePhrase(true), isSure ? 'bg-emerald-500' : 'bg-indigo-500', isSure ? 'border-emerald-700' : 'border-indigo-700');
    } else {
        haptic('error');
        updateFactSRS(fKey, false, false);
        if (mIdx === -1) window.state.mistakesPool.push({ fact, task: window.state.currentTask });
        window.state.stats.streak = 0;
        showToast('🔄', window.getJokePhrase(false), 'bg-rose-500', 'border-rose-700');
    }
    window.state.stats.flashcardsSolved = (window.state.stats.flashcardsSolved || 0) + 1;
    saveProgress();
    updateGlobalUI();
    checkAchievements();
    window.nextFlashcard();
};

// ═══════════════════════════════════════════════════════════
//  ДЕТЕКТИВ
// ═══════════════════════════════════════════════════════════

function generateDetectiveTable() {
    window.state.tableHasMistake = false;
    window.state.answersRevealed = false;

    $('pool-title').innerHTML = '<span>🔎</span> УЛИКИ';
    $('check-buttons').classList.remove('hidden');
    $('check-buttons').classList.add('flex');
    $('check-btn-sure').innerHTML = '✅ Вынести вердикт';
    $('check-btn-doubt').innerHTML = '🤔 Нужна экспертиза';
    $('reveal-btn').className = "hidden text-orange-500 font-bold py-2 px-6 active:scale-95 text-[11px] sm:text-xs w-full transition-colors underline uppercase tracking-wider mt-2";
    $('reveal-btn').innerHTML = '👀 Запросить подсказку штаба';
    $('next-btn').classList.add('hidden');
    if ($('detective-stamp')) $('detective-stamp').classList.remove('hidden');
    $('task-table-body').innerHTML = '';
    $('pool-container').innerHTML = '';

    if (typeof detectiveCases === 'undefined') {
        $('table-head').innerHTML = '';
        $('task-table-body').innerHTML = '<tr><td class="text-center p-10 font-bold text-gray-500">Материалы дела недоступны...</td></tr>';
        return;
    }
    const cases = detectiveCases[$('filter-case').value];
    if (!cases || cases.length === 0) {
        $('table-head').innerHTML = '';
        $('task-table-body').innerHTML = '<tr><td class="text-center p-10 font-bold text-gray-500">Дела в разработке...</td></tr>';
        return;
    }

    // ── Умный выбор кейса: цикл без повторов ──
    const caseKey = $('filter-case').value;
    if (!window._detectiveSeenCases) window._detectiveSeenCases = {};
    if (!window._detectiveSeenCases[caseKey]) window._detectiveSeenCases[caseKey] = [];
    let seen = window._detectiveSeenCases[caseKey];
    // Если все кейсы показаны — сбросить
    if (seen.length >= cases.length) seen.length = 0;
    // Выбрать из непоказанных
    const unseen = cases.map((c, i) => i).filter(i => !seen.includes(i));
    const pickIdx = unseen[Math.floor(Math.random() * unseen.length)];
    seen.push(pickIdx);
    const caseData = cases[pickIdx];
    window.state.currentTargetData = caseData.items;
    $('table-head').innerHTML = `<tr><th class="p-2 sm:p-4 text-left relative bg-[#f3efe6] dark:bg-[#c7c1b3] rounded-t-lg"><div class="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-1">Архив Главного Управления</div><div class="text-2xl sm:text-3xl font-serif font-black text-[#3e352d] uppercase border-b-2 border-[#d1c1a5] pb-2">ДОСЬЕ №${Math.floor(Math.random() * 900 + 100)}-${['К','А','М','С','Ж'][Math.floor(Math.random() * 5)]}</div><div class="text-sm font-bold text-[#3e352d] mt-3 flex items-center gap-2"><span class="text-xl">📁</span> ${caseData.title}</div></th></tr>`;

    const missing = [];
    const trFrag = document.createDocumentFragment();
    caseData.items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = idx;
        const td = document.createElement('td');
        td.className = "p-2 sm:p-4 align-middle text-left leading-relaxed text-[13px] sm:text-base";
        missing.push(item.answer);
        td.innerHTML = `<span class="font-bold mr-2 text-gray-500">${idx + 1}.</span> ${item.text.replace('###', `<div class="dnd-slot detective-slot" data-expected="${String(item.answer).replace(/"/g, '&quot;')}" data-letter=""></div>`)}`;
        tr.appendChild(td);
        trFrag.appendChild(tr);
    });
    $('task-table-body').appendChild(trFrag);

    const poolItems = [...missing, ...(caseData.fakes || [])];
    const poolFrag = document.createDocumentFragment();
    shuffleArray(poolItems).forEach(txt => {
        const chip = document.createElement('div');
        chip.className = "dnd-chip";
        chip.innerText = txt;
        chip.dataset.pureText = txt;
        poolFrag.appendChild(chip);
    });
    $('pool-container').appendChild(poolFrag);
}

// ═══════════════════════════════════════════════════════════
//  УЧЁБА (Study)
// ═══════════════════════════════════════════════════════════

window.renderStudyCard = function() {
    const pool = getBasePool($('filter-period').value || 'all');
    if (pool.length === 0) {
        $('study-area').innerHTML = '<div class="text-center p-10 bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm"><h2 class="text-xl font-bold text-rose-500">⚠️ В этом периоде нет событий!</h2></div>';
        return;
    }
    const sorted = [...pool].sort((a, b) => getYearFromFact(a) - getYearFromFact(b));
    if (window.state.studyIndex >= sorted.length) {
        window.state.studyIndex = 0;
        showToast('🎉', 'Эпоха пройдена!', 'bg-emerald-500', 'border-emerald-700');
    }

    const it = sorted[window.state.studyIndex];
    const task = window.state.currentTask;
    const labelMap = { task3: 'Процесс → Факт', task4: 'География', task5: 'Личность', task7: 'Культура' };
    const titleMap = {
        task3: it => `${it.year} г. • ${it.process}`,
        task4: it => `${it.year} г. • ${it.geo}`,
        task5: it => `${it.year} • ${it.person}`,
        task7: it => `${it.culture}`,
    };
    const descMap = { task3: it => it.fact, task4: it => it.event, task5: it => it.event, task7: it => it.trait };

    const e = ['📜','⚔️','🛡️','👑','🚂','🚀','🏛️','🗺️','💡','🎨','⚓'];
    const b = ['from-blue-500 to-purple-600','from-emerald-400 to-teal-600','from-orange-400 to-rose-500','from-indigo-500 to-blue-600'];
    const tpl = $('study-card-template').content.cloneNode(true);

    tpl.querySelector('.st-bg').className = `h-32 sm:h-40 flex items-center justify-center text-7xl shadow-inner transition-colors bg-gradient-to-br ${b[Math.floor(Math.random() * b.length)]}`;
    tpl.querySelector('.st-emoji').innerText = task === 'task7' ? '🎨' : (task === 'task3' ? '🔗' : e[Math.floor(Math.random() * e.length)]);
    tpl.querySelector('.st-label').innerText = labelMap[task] || 'Событие';
    tpl.querySelector('.st-title').innerText = titleMap[task](it);
    tpl.querySelector('.st-desc').innerText = descMap[task](it);
    tpl.querySelector('.st-progress').innerText = `Карточка ${window.state.studyIndex + 1} из ${sorted.length}`;
    $('study-area').innerHTML = '';
    $('study-area').appendChild(tpl);
};

window.nextStudyCard = function() { haptic('light'); window.state.studyIndex++; window.renderStudyCard(); };

// ═══════════════════════════════════════════════════════════
//  ВИЗУАЛЬНАЯ АРХИТЕКТУРА
// ═══════════════════════════════════════════════════════════

function visualEscape(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function visualData() {
    return (window.visualArchitectureData || []).filter(item => item && item.mainImage && item.fullCharacteristic);
}

function visualProgressFor(id) {
    const stats = window.state.stats;
    if (!stats.visualArchitectureProgress) stats.visualArchitectureProgress = {};
    if (!stats.visualArchitectureProgress[id]) {
        stats.visualArchitectureProgress[id] = { streak: 0, learned: false, attempts: 0, correct: 0 };
    }
    return stats.visualArchitectureProgress[id];
}

function visualLearnedCount(items) {
    return items.filter(item => visualProgressFor(item.id).learned).length;
}

function visualPickPool(items) {
    const open = items.filter(item => !visualProgressFor(item.id).learned);
    if (!open.length) return null;
    const current = window.state.currentVisualId
        ? open.find(item => item.id === window.state.currentVisualId)
        : null;
    if (current) return current;

    const inProgress = open.filter(item => visualProgressFor(item.id).streak > 0);
    const pool = inProgress.length ? inProgress : open;
    return pool[Math.floor(Math.random() * pool.length)];
}

function visualUniqueBy(items, getValue) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const value = getValue(item);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push({ item, value });
    }
    return out;
}

function visualFullDistractors(items, item) {
    const candidates = items.filter(other => other.id !== item.id && other.fullCharacteristic !== item.fullCharacteristic);
    const samePeriod = visualUniqueBy(candidates.filter(other => other.period === item.period), other => other.fullCharacteristic);
    const all = visualUniqueBy(candidates, other => other.fullCharacteristic);
    const source = samePeriod.length >= 4 ? samePeriod : all;
    return shuffleArray(source).slice(0, 4).map((entry, idx) => ({
        key: `d${idx}`,
        text: entry.value,
        correct: false,
    }));
}

function visualFactDistractors(items, item, fact) {
    const byType = other => (other.drillFacts || []).find(f => f.type === fact.type && f.answer && f.answer !== fact.answer);
    const samePeriod = visualUniqueBy(
        items.filter(other => other.id !== item.id && other.period === item.period && byType(other)),
        other => byType(other).answer
    );
    const all = visualUniqueBy(
        items.filter(other => other.id !== item.id && byType(other)),
        other => byType(other).answer
    );
    const source = samePeriod.length >= 4 ? samePeriod : all;
    return shuffleArray(source).slice(0, 4).map((entry, idx) => ({
        key: `d${idx}`,
        text: entry.value,
        correct: false,
    }));
}

function visualPickDrillFact(items, item) {
    const priority = ['creator', 'location', 'century', 'style', 'date', 'ruler', 'event'];
    const facts = (item.drillFacts || []).filter(f => visualFactDistractors(items, item, f).length >= 4);
    if (!facts.length) return null;
    facts.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
    const lastType = visualProgressFor(item.id).lastType;
    return facts.find(f => f.type !== lastType) || facts[0];
}

function visualBuildQuestion(items, item) {
    const progress = visualProgressFor(item.id);
    const drillFact = progress.streak >= 2 ? visualPickDrillFact(items, item) : null;

    if (drillFact) {
        const options = [
            { key: 'correct', text: drillFact.answer, correct: true },
            ...visualFactDistractors(items, item, drillFact),
        ];
        return {
            item,
            stage: 'drill',
            prompt: drillFact.question,
            label: drillFact.label,
            correctKey: 'correct',
            correctText: drillFact.answer,
            factType: drillFact.type,
            options: shuffleArray(options),
        };
    }

    const options = [
        { key: 'correct', text: item.fullCharacteristic, correct: true },
        ...visualFullDistractors(items, item),
    ];
    return {
        item,
        stage: 'full',
        prompt: 'Выбери полную характеристику',
        label: 'паспорт памятника',
        correctKey: 'correct',
        correctText: item.fullCharacteristic,
        factType: 'full',
        options: shuffleArray(options),
    };
}

window.startVisualTrainer = function() {
    haptic('medium');
    window.state.currentMode = 'visual';
    window.state.currentVisualId = null;
    $('game-title-display').innerText = '🏛️ Визуал ЕГЭ';
    $('lobby-area').classList.add('hidden');
    $('game-container').classList.remove('hidden');
    $('game-container').classList.add('flex');
    document.body.classList.add('in-game');
    $('bottom-nav').classList.add('hide-nav');
    if (typeof toggleMode === 'function') toggleMode('visual');
};

window.renderVisualTrainer = function(forceNew) {
    const area = $('visual-trainer-area');
    if (!area) return;
    const items = visualData();
    if (!items.length) {
        area.innerHTML = '<div class="text-center p-8 bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2c2c2c] text-rose-500 font-black">База визуала не загружена.</div>';
        return;
    }
    if (forceNew) window.state.currentVisualId = null;

    const learned = visualLearnedCount(items);
    if (learned >= items.length) {
        area.innerHTML = `<div class="w-full max-w-lg bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-sm border border-gray-200 dark:border-[#2c2c2c] p-8 text-center">
            <div class="text-5xl mb-4">🏆</div>
            <h2 class="text-2xl font-black text-gray-800 dark:text-gray-200 uppercase tracking-widest mb-2">Архитектура выучена</h2>
            <p class="text-sm font-bold text-gray-500 dark:text-gray-400 mb-6">${learned} / ${items.length}</p>
            <button data-action="resetVisualTrainer" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl uppercase tracking-widest active:scale-95 transition-transform">Начать заново</button>
        </div>`;
        return;
    }

    const item = visualPickPool(items);
    if (!item) return;
    window.state.currentVisualId = item.id;
    const progress = visualProgressFor(item.id);
    const question = visualBuildQuestion(items, item);
    window.state.currentVisualQuestion = question;

    const stageText = question.stage === 'drill'
        ? `контрольный факт: ${question.label}`
        : `полная характеристика ${Math.min(progress.streak + 1, 2)} / 2`;
    const nextText = progress.streak >= 2 ? 'после ответа памятник будет выучен' : 'после 2 подряд будет точечный факт';
    const options = question.options.map(option => `
        <button data-action="answerVisualTrainer" data-arg="${option.key}" data-visual-option="${option.key}"
            class="visual-option w-full text-left bg-white hover:bg-blue-50 dark:bg-[#242424] dark:hover:bg-[#2c2c2c] border border-gray-200 dark:border-[#3f3f46] rounded-xl p-3 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 leading-relaxed active:scale-[0.99] transition-all">
            ${visualEscape(option.text)}
        </button>`).join('');

    area.innerHTML = `<div class="w-full max-w-5xl flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3 px-1">
            <div class="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest">Визуальная архитектура</div>
            <div class="text-[10px] sm:text-xs font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full">${learned} / ${items.length} выучено</div>
        </div>
        <div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-4 items-stretch">
            <div class="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2c2c2c] shadow-sm overflow-hidden flex flex-col">
                <div class="bg-gray-100 dark:bg-[#181818] h-[280px] sm:h-[380px] lg:h-[520px] flex items-center justify-center">
                    <img src="${visualEscape(item.mainImage)}" alt="Памятник культуры" class="w-full h-full object-contain">
                </div>
                <div class="p-4 border-t border-gray-200 dark:border-[#2c2c2c]">
                    <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">${visualEscape(stageText)}</div>
                    <h2 class="text-xl sm:text-2xl font-black text-gray-800 dark:text-gray-200 leading-tight">Памятник культуры</h2>
                    <div class="text-[11px] font-bold text-gray-400 mt-2">${visualEscape(nextText)}</div>
                </div>
            </div>
            <div class="bg-gray-50 dark:bg-[#181818] rounded-2xl border border-gray-200 dark:border-[#2c2c2c] shadow-sm p-4 flex flex-col gap-3">
                <div>
                    <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Вопрос</div>
                    <h3 class="text-base sm:text-lg font-black text-gray-800 dark:text-gray-200 leading-snug">${visualEscape(question.prompt)}</h3>
                </div>
                <div class="flex flex-col gap-2">${options}</div>
                <div id="visual-feedback" class="min-h-[42px] text-xs font-bold text-gray-500 dark:text-gray-400 leading-relaxed mt-auto"></div>
            </div>
        </div>
    </div>`;
};

window.answerVisualTrainer = function(optionKey) {
    const question = window.state.currentVisualQuestion;
    if (!question) return;
    const item = question.item;
    const progress = visualProgressFor(item.id);
    const correct = optionKey === question.correctKey;
    progress.attempts = (progress.attempts || 0) + 1;
    progress.lastUpdated = Date.now();

    document.querySelectorAll('[data-visual-option]').forEach(btn => {
        btn.disabled = true;
        btn.classList.remove('hover:bg-blue-50', 'dark:hover:bg-[#2c2c2c]');
        if (btn.dataset.visualOption === question.correctKey) {
            btn.classList.add('bg-emerald-50', 'border-emerald-400', 'text-emerald-800', 'dark:bg-emerald-900/30', 'dark:text-emerald-300');
        } else if (btn.dataset.visualOption === optionKey) {
            btn.classList.add('bg-rose-50', 'border-rose-400', 'text-rose-800', 'dark:bg-rose-900/30', 'dark:text-rose-300');
        } else {
            btn.classList.add('opacity-60');
        }
    });

    const feedback = $('visual-feedback');
    if (correct) {
        haptic('success');
        progress.correct = (progress.correct || 0) + 1;
        progress.streak = Math.min((progress.streak || 0) + 1, 3);
        progress.lastType = question.factType;
        if (progress.streak >= 3) {
            progress.learned = true;
            progress.learnedAt = Date.now();
            window.state.currentVisualId = null;
            window.state.stats.visualArchitectureSolved = (window.state.stats.visualArchitectureSolved || 0) + 1;
            if (feedback) feedback.textContent = `Выучено: ${item.title}.`;
        } else {
            window.state.currentVisualId = item.id;
            if (feedback) feedback.textContent = `Верно: ${item.title}. Серия: ${progress.streak} / 3.`;
        }
    } else {
        haptic('error');
        progress.streak = 0;
        progress.learned = false;
        window.state.currentVisualId = null;
        if (feedback) feedback.textContent = `Это ${item.title}. Правильно: ${question.correctText}`;
    }

    saveProgress();
    setTimeout(() => window.renderVisualTrainer(), correct ? 850 : 1400);
};

window.resetVisualTrainer = function() {
    haptic('light');
    window.state.stats.visualArchitectureProgress = {};
    window.state.stats.visualArchitectureSolved = 0;
    window.state.currentVisualId = null;
    saveProgress();
    window.renderVisualTrainer(true);
};

// ═══════════════════════════════════════════════════════════
//  КРАСНЫЙ КАРАНДАШ (Red Pencil)
// ═══════════════════════════════════════════════════════════

let currentRPCaseIndex = 0, rpFakesTotal = 0, rpFakesFound = 0, rpCasesShuffled = [];

window.updateRPCounter = function() { if ($('rp-counter')) $('rp-counter').innerText = `${rpFakesFound} / ${rpFakesTotal}`; };

window.startRedPencilMode = function() {
    if (typeof redPencilCases === 'undefined') {
        $('rp-content').innerHTML = '<div class="text-center text-red-500 font-bold py-10 bg-white">База данных не найдена.</div>';
        return;
    }
    const p = $('filter-period').value || 'all';
    let fC = [];
    if (p === 'all') fC = [...redPencilCases];
    else if (p === 'custom') {
        const sy = parseInt($('custom-year-start').value) || 0, ey = parseInt($('custom-year-end').value) || 3000;
        fC = redPencilCases.filter(c => c.year >= sy && c.year <= ey);
    } else {
        fC = redPencilCases.filter(c => {
            const y = c.year;
            if (p === 'early' && y <= 1700) return true;
            if (p === '18th' && y > 1700 && y <= 1800) return true;
            if (p === '19th' && y > 1800 && y <= 1900) return true;
            if (p === '20th' && y > 1900) return true;
            return false;
        });
    }
    if (fC.length === 0) {
        $('rp-content').innerHTML = '<div class="text-center text-rose-500 font-bold py-10 bg-white">⚠️ В периоде нет документов!</div>';
        $('rp-giveup-btn').classList.add('hidden');
        return;
    }
    rpCasesShuffled = shuffleArray([...fC]);
    currentRPCaseIndex = 0;
    window.loadRPCase(0);
};

window.loadRPCase = function(idx) {
    if (window.state) window.state.rpHasMistake = false;
    if (idx >= rpCasesShuffled.length) { idx = 0; currentRPCaseIndex = 0; rpCasesShuffled = shuffleArray([...rpCasesShuffled]); }
    const cD = rpCasesShuffled[idx];
    $('rp-title').innerText = cD.title + ' • ' + cD.year + ' г.';

    const pF = cD.slots.filter(s => s.current !== s.correct);
    const fT = cD.slots.filter(s => s.current === s.correct);
    const tFC = Math.max(1, Math.min(Math.floor(Math.random() * 5) + 2, pF.length));
    const sF = shuffleArray([...pF]);
    const aF = sF.slice(0, tFC), cT = sF.slice(tFC);
    const fS = {};
    aF.forEach(s => fS[s.id] = { ...s, isFake: true });
    cT.forEach(s => fS[s.id] = { ...s, isFake: false, current: s.correct });
    fT.forEach(s => fS[s.id] = { ...s, isFake: false, current: s.correct });
    rpFakesTotal = aF.length;
    rpFakesFound = 0;
    window.updateRPCounter();

    let hC = cD.text;
    cD.slots.forEach(s => {
        const f = fS[s.id];
        hC = hC.replace(`{${f.id}}`, `<span class="word-node target-node" data-id="${f.id}" data-type="${f.isFake ? 'fake' : 'truth'}" data-correct="${f.correct}">${f.current}</span>`);
    });

    const tD = document.createElement('div');
    tD.innerHTML = hC;
    function wrapTN(node) {
        if (node.nodeType === 3) {
            const txt = node.nodeValue;
            if (!txt.trim()) return;
            const wS = txt.split(/([\s.,!?;:«»"—]+)/);
            const fr = document.createDocumentFragment();
            wS.forEach(str => {
                if (str.trim().length > 0 && !/^[\s.,!?;:«»"—]+$/.test(str)) {
                    const s = document.createElement('span');
                    s.className = 'plain-word';
                    s.textContent = str;
                    fr.appendChild(s);
                } else fr.appendChild(document.createTextNode(str));
            });
            node.parentNode.replaceChild(fr, node);
        } else if (node.nodeType === 1 && !node.classList.contains('word-node')) {
            Array.from(node.childNodes).forEach(wrapTN);
        }
    }
    Array.from(tD.childNodes).forEach(wrapTN);
    $('rp-content').innerHTML = tD.innerHTML;
    $('rp-next-btn').classList.add('hidden');
    $('rp-giveup-btn').classList.remove('hidden');
    $$('#rp-content .word-node').forEach(n => n.addEventListener('click', window.handleRPWordClick));
    $$('#rp-content .plain-word').forEach(n => n.addEventListener('click', window.handleRPPlainClick));
};

window.handleRPWordClick = function(e) {
    const n = e.currentTarget;
    if (!n || n.classList.contains('crossed')) return;
    if (n.dataset.type === 'fake') {
        n.classList.add('crossed', 'show-correction');
        n.innerHTML += `<span class="correction-badge">${n.dataset.correct}</span>`;
        rpFakesFound++;
        window.updateRPCounter();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (rpFakesFound === rpFakesTotal) window.winRPCase();
    } else {
        window.handleRPPlainClick({ currentTarget: n });
    }
};

window.handleRPPlainClick = function(e) {
    const n = e.currentTarget;
    if (n.classList.contains('shaking') || n.classList.contains('crossed')) return;
    n.classList.add('animate-shake', 'text-rose-600', 'shaking');
    if (window.state) {
        window.state.stats.streak = 0;
        window.state.rpHasMistake = true;
        updateGlobalUI();
        saveLocal(); // FIX #9: только локально, не спамим облако
    }
    setTimeout(() => n.classList.remove('animate-shake', 'text-rose-600', 'shaking'), 500);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    showToast('❌', window.getJokePhrase(false), 'bg-rose-500', 'border-rose-700');
};

window.winRPCase = function() {
    $('rp-next-btn').classList.remove('hidden');
    $('rp-giveup-btn').classList.add('hidden');
    if (window.state && !window.state.rpHasMistake) {
        updateScoreAndStats(1, true);
        window.state.stats.streak = (window.state.stats.streak || 0) + 1;
        updateGlobalUI();
        saveProgress();
        checkAchievements();
    }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    showToast('🎉', window.state.rpHasMistake ? 'Все фальшивки найдены!' : window.getJokePhrase(true), 'bg-emerald-500', 'border-emerald-700');
};

window.giveUpRedPencil = function() {
    $$('#rp-content .target-node[data-type="fake"]').forEach(n => {
        if (!n.classList.contains('crossed')) {
            n.classList.add('crossed', 'show-correction');
            n.innerHTML += `<span class="correction-badge">${n.dataset.correct}</span>`;
        }
    });
    rpFakesFound = rpFakesTotal;
    window.updateRPCounter();
    if (window.state) { window.state.stats.streak = 0; updateGlobalUI(); saveProgress(); }
    $('rp-next-btn').classList.remove('hidden');
    $('rp-giveup-btn').classList.add('hidden');
};

window.nextRedPencilCase = function() {
    haptic('light');
    currentRPCaseIndex++;
    window.loadRPCase(currentRPCaseIndex);
};
