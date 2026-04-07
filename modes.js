// modes.js — игровые режимы: flashcards, redpencil, study, detective, duel, task tables
// Зависимости: app.js, ui.js
'use strict';

let duelSearchTimer = null;
let duelSearchSeconds = 0;

window.startDuelSearch = function() {
    haptic('medium');
    showModal('duel-search-modal');
    $('duel-search-status').innerText = "Поиск соперника...";
    duelSearchSeconds = 0;
    $('duel-search-timer').innerText = `Ожидание: ${duelSearchSeconds}с`;
    duelSearchTimer = setInterval(() => {
        duelSearchSeconds++;
        $('duel-search-timer').innerText = `Ожидание: ${duelSearchSeconds}с`;
        if (duelSearchSeconds > 30) {
            window.cancelDuelSearch('Никого нет в сети 😢');
        }
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
        if (left <= 0) {
            clearInterval(startWait);
            hideModal('duel-search-modal');
            window.startDuelGame();
        } else {
            $('duel-search-timer').innerText = `Начинаем через ${Math.ceil(left/1000)}...`;
        }
    }, 100);
};

window.startDuelGame = function() {
    $('lobby-area').classList.add('hidden'); 
    $('game-container').classList.remove('hidden'); 
    $('game-container').classList.add('flex');
    document.body.classList.add('in-game'); 
    $('bottom-nav').classList.add('hide-nav');
    
    // Прячем другие режимы и показываем классическую таблицу
    ['flashcard-area', 'study-area', 'redpencil-area'].forEach(id => { const el = $(id); if (el) { el.classList.add('hidden'); el.classList.remove('flex'); } });
    const ca = $('classic-task-area'); if (ca) { ca.classList.remove('hidden'); ca.classList.add('flex', 'lg:flex-row'); }
    
    window.state.currentTask = 'task4';
    $('filter-task').value = 'task4';
    window.state.currentMode = 'duel';
    window.state.duel.active = true;
    window.state.duel.myScore = 0;
    window.state.duel.myCombo = 0;
    window.state.duel.oppScore = 0;
    window.state.duel.oppCombo = 0;
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
        if(window.state.timeLeft <= 0) window.endDuel(); 
    }, 1000);
};

window.updateDuelUI = function() {
    if (!window.state.duel || !window.state.duel.active) return;
    $('duel-my-score').innerText = window.state.duel.myScore;
    $('duel-opp-score').innerText = window.state.duel.oppScore;
    $('duel-my-combo').innerText = `🔥 ${window.state.duel.myCombo}`;
    $('duel-opp-combo').innerText = `🔥 ${window.state.duel.oppCombo}`;
};

window.endDuel = function() {
    clearInterval(window.state.timerInterval);
    
    const myS = window.state.duel.myScore;
    const oppS = window.state.duel.oppScore;
    
    window.state.duel.active = false;
    if (window.cancelDuelDb) window.cancelDuelDb();
    
    let emoji = '😐', title = 'НИЧЬЯ', text = 'Победила дружба', color = 'text-gray-500';
    if (myS > oppS) { emoji = '🏆'; title = 'ПОБЕДА!'; text = 'Вы разгромили соперника!'; color = 'text-emerald-500'; haptic('success'); }
    else if (myS < oppS) { emoji = '💔'; title = 'ПОРАЖЕНИЕ'; text = 'Соперник оказался быстрее...'; color = 'text-rose-500'; haptic('error'); }
    
    $('modal-emoji').innerText = emoji;
    $('modal-main-title').innerText = title;
    $('modal-score').innerHTML = `<span class="${color}">${myS}</span> <span class="text-gray-400 text-3xl mx-2">:</span> <span class="text-gray-500">${oppS}</span>`;
    
    showModal('game-over-modal');
    $('board-overlay').classList.remove('hidden');
    saveLocal(); // ✅ Локально мгновенно
    syncNow();   // ✅ Немедленно в облако — дуэль завершена
    updateGlobalUI();
};

window.nextFlashcard = function() {
    const allowed = getFilteredPool($('filter-period').value || 'all');
    if (!allowed || allowed.length === 0) { $('flashcard-area').innerHTML = '<div class="text-center p-10 w-full"><h2 class="text-xl font-bold text-rose-500 bg-white dark:bg-[#1e1e1e] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-[#2c2c2c]">⚠️ В этом периоде нет событий!</h2></div>'; return; }
    const fact = allowed[Math.floor(Math.random() * allowed.length)]; let d = window.state.stats.factStreaks[factKey(fact)];
    const isT5 = window.state.currentTask === 'task5';
    const isT7 = window.state.currentTask === 'task7';
    const isT3 = window.state.currentTask === 'task3';
    const tpl = $('flashcard-template-front').content.cloneNode(true);
    tpl.querySelector('.fc-level-badge').innerText = `Ур: ${d ? d.level || 0 : 0} | Балл: ${d ? (d.points||0).toFixed(1) : 0}/3`;
    tpl.querySelector('.fc-label').innerText = isT7 ? 'Памятник культуры' : (isT5 ? 'Участник' : (isT3 ? 'Процесс' : 'Событие')); 
    tpl.querySelector('.fc-title').innerText = isT7 ? fact.culture : (isT5 ? fact.person : (isT3 ? fact.process : fact.event));
    const area = $('flashcard-area'); area.innerHTML = ''; area.appendChild(tpl); window.state.currentFlashcardFact = fact;
};

window.flipFlashcard = function(card) {
    if (card.classList.contains('flipped')) return; card.classList.add('flipped'); haptic('medium');
    const fact = window.state.currentFlashcardFact; 
    const isT5 = window.state.currentTask === 'task5';
    const isT7 = window.state.currentTask === 'task7';
    const isT3 = window.state.currentTask === 'task3';
    card.className = "w-full max-w-md bg-blue-50 dark:bg-[#1e1e1e] rounded-3xl shadow-[0_8px_30px_rgba(59,130,246,0.15)] p-6 min-h-[300px] flex flex-col items-center justify-center text-center border-2 border-blue-200 dark:border-[#2c2c2c] transition-all duration-300 relative flipped"; card.onclick = null; 
    
    let cardContent = '';
    if (isT3) {
        cardContent = `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-emerald-100 dark:border-[#2c2c2c] w-full text-center mb-3"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Факт</span><span class="text-[14px] font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">${fact.fact}</span></div><div class="bg-white dark:bg-[#181818]/50 p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-[#2c2c2c] w-full text-center"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Год</span><span class="text-2xl font-black text-examBlue dark:text-blue-300">${fact.year}</span></div>`;
    } else if (isT7) {
        cardContent = `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-amber-100 dark:border-[#2c2c2c] w-full text-center mb-3"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Характеристика</span><span class="text-[14px] font-bold text-amber-700 dark:text-amber-400 leading-relaxed">${fact.trait}</span></div><div class="bg-white dark:bg-[#181818]/50 p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-[#2c2c2c] w-full text-center"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Создание</span><span class="text-2xl font-black text-examBlue dark:text-blue-300">${fact.year}</span></div>`;
    } else if (isT5) {
        cardContent = `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-purple-100 dark:border-[#2c2c2c] w-full text-center"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Событие</span><span class="text-lg sm:text-xl font-bold text-purple-700 dark:text-purple-400 leading-relaxed">${fact.event}</span></div>`;
    } else {
        let mapLink = ''; if (fact.geo && typeof geoDict !== 'undefined' && geoDict[fact.geo]) mapLink = `<span onclick="window.openMapModal('${fact.geo}')" class="mt-2 text-[12px] font-bold text-blue-600 underline decoration-dashed cursor-pointer">Показать на карте</span>`;
        cardContent = `<div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-blue-100 dark:border-[#2c2c2c] w-full mb-3"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Год</span><span class="text-3xl font-black text-examBlue dark:text-blue-300">${fact.year}</span></div><div class="bg-white dark:bg-[#181818]/50 p-5 rounded-2xl shadow-sm border border-green-100 dark:border-[#2c2c2c] flex flex-col items-center w-full"><span class="text-[10px] text-gray-400 uppercase font-black block mb-1 tracking-widest">Место</span><span class="text-xl font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">${fact.geo}</span>${mapLink}</div>`;
    }
    
    const tpl = $('flashcard-template-back').content.cloneNode(true); tpl.querySelector('.fc-content').innerHTML = cardContent; card.innerHTML = ''; card.appendChild(tpl);
    setTimeout(() => window.updateZenButton(), 50);
};

window.answerFlashcard = function(isCorrect, isSure, e) {
    e.stopPropagation(); const fact = window.state.currentFlashcardFact; let fKey = factKey(fact); let mIdx = window.state.mistakesPool.findIndex(m => mistakeMatchesFact(m, fact));
    if (isCorrect) { 
        haptic('success'); 
        let d = updateFactSRS(fKey, true, isSure); 
        if(mIdx !== -1) window.state.mistakesPool.splice(mIdx, 1); 
        window.state.stats.streak++; 
        if (d.level > 0) showToast('🧠', isSure ? 'Отлично! Уровень повышен' : 'Повторим завтра', 'bg-emerald-500', 'border-emerald-700'); 
        else showToast(isSure ? '✅' : '🤔', window.getJokePhrase(true), isSure ? 'bg-emerald-500' : 'bg-indigo-500', isSure ? 'border-emerald-700' : 'border-indigo-700'); 
    } else { 
        haptic('error'); 
        updateFactSRS(fKey, false, false); 
        if (mIdx === -1) window.state.mistakesPool.push({ fact: fact, task: window.state.currentTask }); 
        window.state.stats.streak = 0; 
        showToast('🔄', window.getJokePhrase(false), 'bg-rose-500', 'border-rose-700'); 
    }
    window.state.stats.flashcardsSolved = (window.state.stats.flashcardsSolved || 0) + 1; saveProgress(); updateGlobalUI(); checkAchievements(); window.nextFlashcard();
};

function generateDetectiveTable() {
    window.state.tableHasMistake = false; window.state.answersRevealed = false;
    $('pool-title').innerHTML = `<span>🔎</span> УЛИКИ`; 
    $('check-buttons').classList.remove('hidden'); $('check-buttons').classList.add('flex'); $('check-btn-sure').innerHTML = '✅ Вынести вердикт'; $('check-btn-doubt').innerHTML = '🤔 Нужна экспертиза';
    $('reveal-btn').className = "hidden text-orange-500 font-bold py-2 px-6 active:scale-95 text-[11px] sm:text-xs w-full transition-colors underline uppercase tracking-wider mt-2"; $('reveal-btn').innerHTML = '👀 Запросить подсказку штаба'; $('next-btn').classList.add('hidden');
    if ($('detective-stamp')) $('detective-stamp').classList.remove('hidden');
    $('task-table-body').innerHTML = ''; $('pool-container').innerHTML = '';
    if (typeof detectiveCases === 'undefined') { $('table-head').innerHTML = ''; $('task-table-body').innerHTML = `<tr><td class="text-center p-10 font-bold text-gray-500">Материалы дела недоступны...</td></tr>`; return; }
    const cases = detectiveCases[$('filter-case').value]; if(!cases || cases.length === 0) { $('table-head').innerHTML = ''; $('task-table-body').innerHTML = `<tr><td class="text-center p-10 font-bold text-gray-500">Дела в разработке...</td></tr>`; return; }
    const caseData = cases[Math.floor(Math.random() * cases.length)]; window.state.currentTargetData = caseData.items; 
    $('table-head').innerHTML = `<tr><th class="p-2 sm:p-4 text-left relative bg-[#f3efe6] dark:bg-[#c7c1b3] rounded-t-lg"><div class="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-1">Архив Главного Управления</div><div class="text-2xl sm:text-3xl font-serif font-black text-[#3e352d] uppercase border-b-2 border-[#d1c1a5] pb-2">ДОСЬЕ №${Math.floor(Math.random()*900 + 100)}-${['К','А','М','С','Ж'][Math.floor(Math.random()*5)]}</div><div class="text-sm font-bold text-[#3e352d] mt-3 flex items-center gap-2"><span class="text-xl">📁</span> ${caseData.title}</div></th></tr>`;
    let missing = []; const trFrag = document.createDocumentFragment();
    caseData.items.forEach((item, idx) => { const tr = document.createElement('tr'); tr.dataset.index = idx; const td = document.createElement('td'); td.className = "p-2 sm:p-4 align-middle text-left leading-relaxed text-[13px] sm:text-base"; missing.push(item.answer); td.innerHTML = `<span class="font-bold mr-2 text-gray-500">${idx + 1}.</span> ${item.text.replace('###', `<div class="dnd-slot detective-slot" data-expected="${String(item.answer).replace(/"/g, '&quot;')}" data-letter=""></div>`)}`; tr.appendChild(td); trFrag.appendChild(tr); }); $('task-table-body').appendChild(trFrag);
    let poolItems = [...missing, ...(caseData.fakes || [])]; const poolFrag = document.createDocumentFragment(); shuffleArray(poolItems).forEach(txt => { const chip = document.createElement('div'); chip.className = "dnd-chip"; chip.innerText = txt; chip.dataset.pureText = txt; poolFrag.appendChild(chip); }); $('pool-container').appendChild(poolFrag);
}


function generateTask3Table() {
    window.state.tableHasMistake = false; window.state.answersRevealed = false; 
    
    const isForced4 = window.state.currentMode === 'speedrun' || window.state.currentMode === 'duel';
    const rowsCount = isForced4 ? 4 : (parseInt($('filter-rows').value) || 4);
    const actualPeriod = isForced4 ? 'all' : ($('filter-period').value || 'all');
    
    $('pool-title').innerHTML = `<span>🧩</span> ВАРИАНТЫ`; if ($('detective-stamp')) $('detective-stamp').classList.add('hidden');
    $('check-buttons').classList.remove('hidden'); $('check-buttons').classList.add('flex'); $('check-btn-sure').innerHTML = '✅ Уверен'; $('check-btn-doubt').innerHTML = '🤔 Сомневаюсь'; $('reveal-btn').className = "hidden text-gray-500 hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400 font-bold py-2 active:scale-95 text-[11px] sm:text-xs w-full transition-colors underline uppercase tracking-wider mt-2"; $('reveal-btn').innerHTML = '👀 Сдаюсь, покажи ответы'; $('next-btn').classList.add('hidden'); $('task-table-body').innerHTML = ''; $('pool-container').innerHTML = '';
    $('table-head').innerHTML = `<tr><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[55%] text-left pl-2 sm:pl-4">📋 Процесс (явление)</th><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[45%] border-l border-gray-200 dark:border-[#2c2c2c] text-center">📜 Факт</th></tr>`;
    
    let allowed = getFilteredPool(actualPeriod, rowsCount); 
    if (!allowed || allowed.length === 0) { $('task-table-body').innerHTML = `<tr><td colspan="2" class="p-10 text-center font-bold text-rose-500 bg-white dark:bg-[#1e1e1e]">⚠️ Нет событий!</td></tr>`; return; }
    
    let target = []; 
    if (window.state.isHomeworkMode && window.state.hwTargetIndices && window.state.hwTargetIndices.length > 0) {
        let count = Math.min(rowsCount, window.state.hwCurrentPool.length); 
        window.state.hwCurrentPool.slice(0, count).forEach(i => { let f = (typeof task3Data !== 'undefined' ? task3Data : [])[i]; if(f) target.push(f); });
    } else {
        // === АЛГОРИТМ ЕГЭ №3: строго по одному процессу из каждой из 4 эпох ===
        // (early / 18th / 19th / 20th) — нельзя допускать два процесса одной эпохи
        const canUseEpochAlgo3 = actualPeriod === 'all' && rowsCount === 4;
        let algoSuccess3 = false;
        if (canUseEpochAlgo3) {
            const epochs3 = ['early', '18th', '19th', '20th'];
            const ep3pools = {};
            epochs3.forEach(ep => { ep3pools[ep] = shuffleArray(allowed.filter(f => f.c === ep)); });
            if (epochs3.every(ep => ep3pools[ep].length > 0)) {
                let uP3 = new Set(), uF3 = new Set();
                epochs3.forEach(ep => {
                    for (let f of ep3pools[ep]) {
                        if (uP3.has(f.process) || uF3.has(f.fact)) continue;
                        target.push(f); uP3.add(f.process); uF3.add(f.fact); break;
                    }
                });
                if (target.length === 4) { shuffleArray(target); algoSuccess3 = true; }
            }
        }
        // Фолбэк: старая логика (при фильтре эпохи или если данных не хватает)
        if (!algoSuccess3) {
            target = [];
            let uP = new Set(); let uF = new Set(); let shuf = shuffleArray([...allowed]);
            for (let f of shuf) { if (target.length >= rowsCount) break; if (uP.has(f.process) || uF.has(f.fact)) continue; target.push(f); uP.add(f.process); uF.add(f.fact); }
            if (target.length < rowsCount) for (let f of shuf) { if (target.length >= rowsCount) break; if (!uF.has(f.fact)) { target.push(f); uP.add(f.process); uF.add(f.fact); } }
        }
    }

    // Year sort option for task3
    const sortByYear = $('filter-sort-year') && $('filter-sort-year').checked;
    if (sortByYear) target.sort((a,b) => (a.year||0) - (b.year||0));

    window.state.currentTargetData = target; let missing = []; let uPoolF = new Set(); const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М']; const trFrag = document.createDocumentFragment();
    target.forEach((row, idx) => { const tr = document.createElement('tr'); tr.className = "border-b border-gray-100 dark:border-[#2c2c2c] bg-white dark:bg-[#1e1e1e] transition-colors hover:bg-gray-50 dark:hover:bg-[#25282a]"; tr.dataset.index = idx; missing.push(row.fact); uPoolF.add(row.fact); tr.innerHTML = `<td class="p-1.5 sm:p-3 py-1.5 align-middle text-left border-r border-gray-100 dark:border-[#2c2c2c]"><span class="text-[11px] sm:text-[14px] font-bold text-gray-800 dark:text-gray-300 leading-relaxed block">${letters[idx] || '?'}) ${row.process}</span></td><td class="p-1 sm:p-3 py-1.5 align-middle text-center overflow-hidden"><div class="dnd-slot relative" data-expected="${String(row.fact).replace(/"/g, '&quot;')}" data-letter="?"></div></td>`; trFrag.appendChild(tr); }); $('task-table-body').appendChild(trFrag);
    
    if (typeof task3Data === 'undefined') return;
    let fakesCount = Math.ceil(target.length / 2);
    let poolItems = [...missing];
    /* --- SMART DISTRACTORS для Task3 --- */
    const targetPeriods = [...new Set(target.map(t => t.c))];
    const avgYear = Math.round(target.reduce((s,t) => s + (parseInt(t.year,10)||0), 0) / target.length);
    const factYearMap = {}; task3Data.forEach(d => { if (!factYearMap[d.fact]) factYearMap[d.fact] = parseInt(d.year,10)||0; });
    const periodOrder = ['early','18th','19th','20th'];
    const adjSet = new Set(); targetPeriods.forEach(p => { let i = periodOrder.indexOf(p); if (i > 0) adjSet.add(periodOrder[i-1]); if (i < periodOrder.length-1) adjSet.add(periodOrder[i+1]); });
    targetPeriods.forEach(p => adjSet.delete(p));
    const scored = []; const seen = new Set();
    task3Data.forEach(d => {
        if (seen.has(d.fact) || uPoolF.has(d.fact)) return; seen.add(d.fact);
        let pri = targetPeriods.includes(d.c) ? 0 : (adjSet.has(d.c) ? 1 : 2);
        scored.push({ f: d.fact, pri, dist: Math.abs(factYearMap[d.fact] - avgYear) });
    });
    shuffleArray(scored); scored.sort((a,b) => a.pri - b.pri || a.dist - b.dist);
    const needed = target.length + fakesCount;
    for (let s of scored) { if (poolItems.length >= needed) break; poolItems.push(s.f); uPoolF.add(s.f); }
    const poolFrag = document.createDocumentFragment(); shuffleArray(poolItems).forEach(txt => { const c = document.createElement('div'); c.className = "dnd-chip"; c.innerText = txt; c.dataset.pureText = txt; poolFrag.appendChild(c); }); $('pool-container').appendChild(poolFrag);
}

function generateTask5Table() {
    window.state.tableHasMistake = false; window.state.answersRevealed = false; 
    
    const isForced4 = window.state.currentMode === 'speedrun' || window.state.currentMode === 'duel';
    const rowsCount = isForced4 ? 4 : (parseInt($('filter-rows').value) || 4);
    const actualPeriod = isForced4 ? 'all' : ($('filter-period').value || 'all');
    
    $('pool-title').innerHTML = `<span>🧩</span> ВАРИАНТЫ`; if ($('detective-stamp')) $('detective-stamp').classList.add('hidden');
    $('check-buttons').classList.remove('hidden'); $('check-buttons').classList.add('flex'); $('check-btn-sure').innerHTML = '✅ Уверен'; $('check-btn-doubt').innerHTML = '🤔 Сомневаюсь'; $('reveal-btn').className = "hidden text-gray-500 hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400 font-bold py-2 active:scale-95 text-[11px] sm:text-xs w-full transition-colors underline uppercase tracking-wider mt-2"; $('reveal-btn').innerHTML = '👀 Сдаюсь, покажи ответы'; $('next-btn').classList.add('hidden'); $('task-table-body').innerHTML = ''; $('pool-container').innerHTML = '';
    $('table-head').innerHTML = `<tr><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[60%] text-left pl-2 sm:pl-4">📜 Процесс (явление)</th><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[40%] border-l border-gray-200 dark:border-[#2c2c2c] text-center">👤 Участник</th></tr>`;
    
    let allowed = getFilteredPool(actualPeriod, rowsCount); 
    if (!allowed || allowed.length === 0) { $('task-table-body').innerHTML = `<tr><td colspan="2" class="p-10 text-center font-bold text-rose-500 bg-white dark:bg-[#1e1e1e]">⚠️ Нет событий!</td></tr>`; return; }
    
    let target = []; 
    if (window.state.isHomeworkMode && window.state.hwTargetIndices && window.state.hwTargetIndices.length > 0) {
        let count = Math.min(rowsCount, window.state.hwCurrentPool.length); 
        window.state.hwCurrentPool.slice(0, count).forEach(i => { let f = (typeof task5Data !== 'undefined' ? task5Data : [])[i]; if(f) target.push(f); });
    } else {
        // === АЛГОРИТМ ЕГЭ №5: 4 слота по эпохам ===
        // Слот 1: early (IX–XVII, year < 1700)
        // Слот 2: XVIII–XIX (1700 ≤ year ≤ 1899)
        // Слот 3: ВСЕГДА ВОВ (1941–1945)
        // Слот 4: 60% СВО (year ≥ 2022), 40% другой XX век (1900–1940, кроме ВОВ и СВО)
        const canUseSlotAlgo5 = actualPeriod === 'all' && rowsCount === 4;
        let algoSuccess5 = false;
        if (canUseSlotAlgo5) {
            const isEarly5   = f => f.year < 1700;
            const is1819_5   = f => f.year >= 1700 && f.year <= 1899;
            const isWW2_5    = f => f.year >= 1941 && f.year <= 1945;
            const isSVO_5    = f => f.year >= 2022;
            const isOther20_5 = f => f.year >= 1900 && f.year < 1941;
            const pick1_5 = (pool, usedE, usedP) => { for (let f of pool) { if (!usedE.has(f.event) && !usedP.has(f.person)) { usedE.add(f.event); usedP.add(f.person); return f; } } return null; };
            const slotUE = new Set(), slotUP = new Set();
            const shuf5 = shuffleArray([...allowed]);
            const slot1 = pick1_5(shuf5.filter(isEarly5), slotUE, slotUP);
            const slot2 = pick1_5(shuf5.filter(is1819_5), slotUE, slotUP);
            const slot3 = pick1_5(shuf5.filter(isWW2_5), slotUE, slotUP);
            const wantSVO = Math.random() < 0.6;
            const slot4 = wantSVO
                ? (pick1_5(shuf5.filter(isSVO_5), slotUE, slotUP) || pick1_5(shuf5.filter(isOther20_5), slotUE, slotUP))
                : (pick1_5(shuf5.filter(isOther20_5), slotUE, slotUP) || pick1_5(shuf5.filter(isSVO_5), slotUE, slotUP));
            const slots5 = [slot1, slot2, slot3, slot4].filter(Boolean);
            if (slots5.length === 4) { target = shuffleArray(slots5); algoSuccess5 = true; }
        }
        // Фолбэк: старая логика (при фильтре эпохи или если слотов не хватает)
        if (!algoSuccess5) {
            let uE = new Set(); let uP = new Set(); let svo = 0; let shuf = shuffleArray([...allowed]);
            for (let f of shuf) { if (target.length >= rowsCount) break; if (uE.has(f.event) || uP.has(f.person)) continue; let isSVO = f.year === 2022 || (f.event && String(f.event).includes('СВО')); if (isSVO && svo >= 1) continue; target.push(f); uE.add(f.event); uP.add(f.person); if (isSVO) svo++; }
            if (target.length < rowsCount) for (let f of shuf) { if (target.length >= rowsCount) break; if (!uE.has(f.event) && !uP.has(f.person)) { target.push(f); uE.add(f.event); uP.add(f.person); } }
        }
    }

    window.state.currentTargetData = target; let missing = []; let uPoolP = new Set(); const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М']; const trFrag = document.createDocumentFragment();
    target.forEach((row, idx) => { const tr = document.createElement('tr'); tr.className = "border-b border-gray-100 dark:border-[#2c2c2c] bg-white dark:bg-[#1e1e1e] transition-colors hover:bg-gray-50 dark:hover:bg-[#25282a]"; tr.dataset.index = idx; missing.push(row.person); uPoolP.add(row.person); tr.innerHTML = `<td class="p-1.5 sm:p-3 py-1.5 align-middle text-left border-r border-gray-100 dark:border-[#2c2c2c]"><span class="text-[11px] sm:text-[14px] font-bold text-gray-800 dark:text-gray-300 leading-relaxed block">${letters[idx] || '?'}) ${row.event}</span></td><td class="p-1 sm:p-3 py-1.5 align-middle text-center overflow-hidden"><div class="dnd-slot relative" data-expected="${String(row.person).replace(/"/g, '&quot;')}" data-letter="?"></div></td>`; trFrag.appendChild(tr); }); $('task-table-body').appendChild(trFrag);
    
    if (typeof task5Data === 'undefined') return;
    let fakesCount = Math.ceil(target.length / 2);
    let poolItems = [...missing];
    /* --- SMART DISTRACTORS для Task5 --- */
    const targetPeriods = [...new Set(target.map(t => t.c))];
    const avgYear = Math.round(target.reduce((s,t) => s + (parseInt(t.year,10)||0), 0) / target.length);
    const personYearMap = {}; task5Data.forEach(d => { if (!personYearMap[d.person]) personYearMap[d.person] = parseInt(d.year,10)||0; });
    const periodOrder = ['early','18th','19th','20th'];
    const adjSet = new Set(); targetPeriods.forEach(p => { let i = periodOrder.indexOf(p); if (i > 0) adjSet.add(periodOrder[i-1]); if (i < periodOrder.length-1) adjSet.add(periodOrder[i+1]); });
    targetPeriods.forEach(p => adjSet.delete(p));
    // Собираем всех уникальных кандидатов с приоритетом: 0 = тот же период, 1 = соседний, 2 = остальные
    const scored = []; const seen = new Set();
    task5Data.forEach(d => {
        if (seen.has(d.person) || uPoolP.has(d.person)) return; seen.add(d.person);
        let pri = targetPeriods.includes(d.c) ? 0 : (adjSet.has(d.c) ? 1 : 2);
        scored.push({ p: d.person, pri, dist: Math.abs(personYearMap[d.person] - avgYear) });
    });
    shuffleArray(scored); scored.sort((a,b) => a.pri - b.pri || a.dist - b.dist);
    const needed = target.length + fakesCount;
    for (let s of scored) { if (poolItems.length >= needed) break; poolItems.push(s.p); uPoolP.add(s.p); }
    const poolFrag = document.createDocumentFragment(); shuffleArray(poolItems).forEach(txt => { const c = document.createElement('div'); c.className = "dnd-chip"; c.innerText = txt; c.dataset.pureText = txt; poolFrag.appendChild(c); }); $('pool-container').appendChild(poolFrag);
}

function generateTask7Table() {
    window.state.tableHasMistake = false; window.state.answersRevealed = false; 
    
    const isForced4 = window.state.currentMode === 'speedrun' || window.state.currentMode === 'duel';
    const rowsCount = isForced4 ? 4 : (parseInt($('filter-rows').value) || 4);
    const actualPeriod = isForced4 ? 'all' : ($('filter-period').value || 'all');
    
    $('pool-title').innerHTML = `<span>🧩</span> ВАРИАНТЫ`; if ($('detective-stamp')) $('detective-stamp').classList.add('hidden');
    $('check-buttons').classList.remove('hidden'); $('check-buttons').classList.add('flex'); $('check-btn-sure').innerHTML = '✅ Уверен'; $('check-btn-doubt').innerHTML = '🤔 Сомневаюсь'; $('reveal-btn').className = "hidden text-gray-500 hover:text-orange-500 dark:text-gray-400 font-bold py-2 active:scale-95 text-[11px] sm:text-xs w-full transition-colors underline uppercase tracking-wider mt-2"; $('reveal-btn').innerHTML = '👀 Сдаюсь, покажи ответы'; $('next-btn').classList.add('hidden'); $('task-table-body').innerHTML = ''; $('pool-container').innerHTML = '';
    
    $('table-head').innerHTML = `<tr><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[35%] text-left pl-2 sm:pl-4">🏛️ Памятник культуры</th><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[65%] border-l border-gray-200 dark:border-[#2c2c2c] text-center">📜 Характеристика</th></tr>`;
    
    let allowed = getFilteredPool(actualPeriod, rowsCount); 
    if (!allowed || allowed.length === 0) { $('task-table-body').innerHTML = `<tr><td colspan="2" class="p-10 text-center font-bold text-rose-500 bg-white dark:bg-[#1e1e1e]">⚠️ Нет событий!</td></tr>`; return; }
    
    let target = []; 
    if (window.state.isHomeworkMode && window.state.hwTargetIndices && window.state.hwTargetIndices.length > 0) {
        let count = Math.min(rowsCount, window.state.hwCurrentPool.length); 
        window.state.hwCurrentPool.slice(0, count).forEach(i => { let f = (window.task7Data || [])[i]; if(f) target.push(f); });
    } else {
        // === АЛГОРИТМ ЕГЭ №7: две схемы по эпохам, шанс 50/50 ===
        // Схема A (1+1+1+1): по 1 из early / XVIII / XIX / XX
        // Схема B (1+0+2+1): 1 из early, 2 из XIX (разные культуры), 1 из XX
        const canUseSchemeAlgo7 = actualPeriod === 'all' && rowsCount === 4;
        let algoSuccess7 = false;
        if (canUseSchemeAlgo7) {
            const pickFrom7 = (pool, count7, usedC7) => {
                const res7 = [];
                for (let f of shuffleArray([...pool])) {
                    if (res7.length >= count7) break;
                    if (!usedC7.has(f.culture)) { res7.push(f); usedC7.add(f.culture); }
                }
                return res7;
            };
            const ep7 = {};
            ['early','18th','19th','20th'].forEach(ep => { ep7[ep] = allowed.filter(f => f.c === ep); });
            const useSchemeA = Math.random() < 0.5;
            const usedC7 = new Set();
            let picked7 = [];
            if (useSchemeA) {
                // Схема A: 1+1+1+1
                ['early','18th','19th','20th'].forEach(ep => { picked7.push(...pickFrom7(ep7[ep], 1, usedC7)); });
            } else {
                // Схема B: 1+0+2+1
                picked7.push(...pickFrom7(ep7['early'], 1, usedC7));
                picked7.push(...pickFrom7(ep7['19th'],  2, usedC7));
                picked7.push(...pickFrom7(ep7['20th'],  1, usedC7));
            }
            if (picked7.length === 4) { target = shuffleArray(picked7); algoSuccess7 = true; }
        }
        // Фолбэк: старая логика (при фильтре эпохи или недостатке данных)
        if (!algoSuccess7) {
            let uC = new Set(); let shuf = shuffleArray([...allowed]);
            for (let f of shuf) { if (target.length >= rowsCount) break; if (!uC.has(f.culture)) { target.push(f); uC.add(f.culture); } }
            if (target.length < rowsCount) for (let f of shuf) { if (target.length >= rowsCount) break; if (!target.includes(f)) { target.push(f); } }
        }
    }

    window.state.currentTargetData = target; let missing = []; const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М']; const trFrag = document.createDocumentFragment();
    target.forEach((row, idx) => { 
        const tr = document.createElement('tr'); tr.className = "border-b border-gray-100 dark:border-[#2c2c2c] bg-white dark:bg-[#1e1e1e] transition-colors hover:bg-gray-50 dark:hover:bg-[#25282a]"; tr.dataset.index = idx; missing.push(row.trait);
        tr.innerHTML = `<td class="p-1.5 sm:p-3 py-1.5 align-middle text-left border-r border-gray-100 dark:border-[#2c2c2c]"><span class="text-[11px] sm:text-[14px] font-bold text-gray-800 dark:text-gray-300 leading-relaxed block">${letters[idx] || '?'}) ${row.culture}</span></td><td class="p-1 sm:p-3 py-1.5 align-middle text-center overflow-hidden"><div class="dnd-slot relative" data-expected="${String(row.trait).replace(/"/g, '&quot;')}" data-letter="?"></div></td>`; 
        trFrag.appendChild(tr); 
    }); 
    $('task-table-body').appendChild(trFrag);
    
    let fakesCount = Math.ceil(target.length / 2);
    let poolItems = [...missing];
    /* --- SMART DISTRACTORS для Task7 --- */
    const targetCultures = new Set(target.map(t => t.culture));
    const validTraitsForTargets = new Set();
    window.task7Data.forEach(d => { if (targetCultures.has(d.culture)) validTraitsForTargets.add(d.trait); });
    const t7Periods = [...new Set(target.map(t => t.c))];
    const t7PO = ['early','18th','19th','20th'];
    const t7Adj = new Set(); t7Periods.forEach(p => { let i = t7PO.indexOf(p); if (i > 0) t7Adj.add(t7PO[i-1]); if (i < t7PO.length-1) t7Adj.add(t7PO[i+1]); });
    t7Periods.forEach(p => t7Adj.delete(p));
    // Единый список кандидатов с приоритетами
    const t7Seen = new Set(poolItems);
    const t7Scored = [];
    window.task7Data.forEach(d => {
        if (targetCultures.has(d.culture) || t7Seen.has(d.trait) || validTraitsForTargets.has(d.trait)) return;
        t7Seen.add(d.trait);
        let pri = t7Periods.includes(d.c) ? 0 : (t7Adj.has(d.c) ? 1 : 2);
        t7Scored.push({ t: d.trait, pri });
    });
    shuffleArray(t7Scored); t7Scored.sort((a,b) => a.pri - b.pri);
    const t7Needed = target.length + fakesCount;
    for (let s of t7Scored) { if (poolItems.length >= t7Needed) break; poolItems.push(s.t); }
    
    const poolFrag = document.createDocumentFragment(); 
    shuffleArray(poolItems).forEach(txt => { 
        const c = document.createElement('div'); 
        c.className = "dnd-chip task7-chip"; 
        c.innerText = txt; 
        c.dataset.pureText = txt; 
        poolFrag.appendChild(c); 
    }); 
    $('pool-container').appendChild(poolFrag);
}

window.renderStudyCard = function() {
    let pool = getBasePool($('filter-period').value || 'all'); if (pool.length === 0) { $('study-area').innerHTML = '<div class="text-center p-10 bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm"><h2 class="text-xl font-bold text-rose-500">⚠️ В этом периоде нет событий!</h2></div>'; return; }
    let sorted = [...pool].sort((a,b) => getYearFromFact(a) - getYearFromFact(b));
    if (window.state.studyIndex >= sorted.length) { window.state.studyIndex = 0; showToast('🎉', 'Эпоха пройдена!', 'bg-emerald-500', 'border-emerald-700'); }
    
    const it = sorted[window.state.studyIndex];
    const isT5 = window.state.currentTask === 'task5';
    const isT7 = window.state.currentTask === 'task7';
    const isT3 = window.state.currentTask === 'task3';
    
    const e = ['📜','⚔️','🛡️','👑','🚂','🚀','🏛️','🗺️','💡','🎨','⚓'];
    const b = ['from-blue-500 to-purple-600','from-emerald-400 to-teal-600','from-orange-400 to-rose-500','from-indigo-500 to-blue-600'];
    const tpl = $('study-card-template').content.cloneNode(true); 
    
    tpl.querySelector('.st-bg').className = `h-32 sm:h-40 flex items-center justify-center text-7xl shadow-inner transition-colors bg-gradient-to-br ${b[Math.floor(Math.random() * b.length)]}`; 
    tpl.querySelector('.st-emoji').innerText = isT7 ? '🎨' : (isT3 ? '🔗' : e[Math.floor(Math.random() * e.length)]); 
    
    tpl.querySelector('.st-label').innerText = isT7 ? "Культура" : (isT5 ? "Личность" : (isT3 ? "Процесс → Факт" : "География")); 
    tpl.querySelector('.st-title').innerText = isT7 ? `${it.culture}` : (isT3 ? `${it.year} г. • ${it.process}` : `${it.year} ${isT5 ? '' : 'г.'} • ${isT5 ? it.person : it.geo}`); 
    tpl.querySelector('.st-desc').innerText = isT7 ? it.trait : (isT3 ? it.fact : it.event); 
    tpl.querySelector('.st-progress').innerText = `Карточка ${window.state.studyIndex + 1} из ${sorted.length}`;
    
    $('study-area').innerHTML = ''; $('study-area').appendChild(tpl);
};
window.nextStudyCard = function() { haptic('light'); window.state.studyIndex++; window.renderStudyCard(); };

// --- КРАСНЫЙ КАРАНДАШ ---
let currentRPCaseIndex = 0, rpFakesTotal = 0, rpFakesFound = 0, rpCasesShuffled = [];
window.updateRPCounter = function() { if($('rp-counter')) $('rp-counter').innerText = `${rpFakesFound} / ${rpFakesTotal}`; };
window.startRedPencilMode = function() {
    if (typeof redPencilCases === 'undefined') { $('rp-content').innerHTML = '<div class="text-center text-red-500 font-bold py-10 bg-white">База данных не найдена. Проверьте data.js</div>'; return; }
    const p = $('filter-period').value || 'all'; let fC = [];
    if (p === 'all') fC = [...redPencilCases]; else if (p === 'custom') { const sy = parseInt($('custom-year-start').value) || 0, ey = parseInt($('custom-year-end').value) || 3000; fC = redPencilCases.filter(c => c.year >= sy && c.year <= ey); } else { fC = redPencilCases.filter(c => { let y = c.year; if (p === 'early' && y <= 1700) return true; if (p === '18th' && y > 1700 && y <= 1800) return true; if (p === '19th' && y > 1800 && y <= 1900) return true; if (p === '20th' && y > 1900) return true; return false; }); }
    if (fC.length === 0) { $('rp-content').innerHTML = '<div class="text-center text-rose-500 font-bold py-10 bg-white">⚠️ В периоде нет документов!</div>'; $('rp-giveup-btn').classList.add('hidden'); return; }
    rpCasesShuffled = shuffleArray([...fC]); currentRPCaseIndex = 0; window.loadRPCase(currentRPCaseIndex);
};
window.loadRPCase = function(idx) {
    if(window.state) window.state.rpHasMistake = false; 
    if (idx >= rpCasesShuffled.length) { idx = 0; currentRPCaseIndex = 0; rpCasesShuffled = shuffleArray([...rpCasesShuffled]); }
    const cD = rpCasesShuffled[idx]; $('rp-title').innerText = cD.title + ' • ' + cD.year + ' г.';
    let pF = cD.slots.filter(s => s.current !== s.correct), fT = cD.slots.filter(s => s.current === s.correct);
    let tFC = Math.max(1, Math.min(Math.floor(Math.random() * 5) + 2, pF.length));
    let sF = shuffleArray([...pF]), aF = sF.slice(0, tFC), cT = sF.slice(tFC), fS = {};
    aF.forEach(s => fS[s.id] = { ...s, isFake: true }); cT.forEach(s => fS[s.id] = { ...s, isFake: false, current: s.correct }); fT.forEach(s => fS[s.id] = { ...s, isFake: false, current: s.correct });
    rpFakesTotal = aF.length; rpFakesFound = 0; window.updateRPCounter();
    let hC = cD.text; cD.slots.forEach(s => { const f = fS[s.id]; hC = hC.replace(`{${f.id}}`, `<span class="word-node target-node" data-id="${f.id}" data-type="${f.isFake ? 'fake' : 'truth'}" data-correct="${f.correct}">${f.current}</span>`); });
    let tD = document.createElement('div'); tD.innerHTML = hC;
    function wrapTN(node) { if (node.nodeType === 3) { const txt = node.nodeValue; if (!txt.trim()) return; const wS = txt.split(/([\s.,!?;:«»"—]+)/); const fr = document.createDocumentFragment(); wS.forEach(str => { if (str.trim().length > 0 && !/^[\s.,!?;:«»"—]+$/.test(str)) { const s = document.createElement('span'); s.className = 'plain-word'; s.textContent = str; fr.appendChild(s); } else fr.appendChild(document.createTextNode(str)); }); node.parentNode.replaceChild(fr, node); } else if (node.nodeType === 1 && !node.classList.contains('word-node')) Array.from(node.childNodes).forEach(wrapTN); }
    Array.from(tD.childNodes).forEach(wrapTN); $('rp-content').innerHTML = tD.innerHTML;
    $('rp-next-btn').classList.add('hidden'); $('rp-giveup-btn').classList.remove('hidden');
    $$('#rp-content .word-node').forEach(n => n.addEventListener('click', window.handleRPWordClick)); $$('#rp-content .plain-word').forEach(n => n.addEventListener('click', window.handleRPPlainClick));
};
window.handleRPWordClick = function(e) {
    const n = e.currentTarget; if (!n || n.classList.contains('crossed')) return;
    if (n.dataset.type === 'fake') { n.classList.add('crossed', 'show-correction'); n.innerHTML += `<span class="correction-badge">${n.dataset.correct}</span>`; rpFakesFound++; window.updateRPCounter(); if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); if (rpFakesFound === rpFakesTotal) window.winRPCase(); } 
    else window.handleRPPlainClick({ currentTarget: n });
};
window.handleRPPlainClick = function(e) {
    const n = e.currentTarget; if (n.classList.contains('shaking') || n.classList.contains('crossed')) return; 
    n.classList.add('animate-shake', 'text-rose-600', 'shaking'); if(window.state) { window.state.stats.streak = 0; window.state.rpHasMistake = true; updateGlobalUI(); saveProgress(); }
    setTimeout(() => n.classList.remove('animate-shake', 'text-rose-600', 'shaking'), 500); if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error'); 
    showToast('❌', window.getJokePhrase(false), 'bg-rose-500', 'border-rose-700');
};
window.winRPCase = function() {
    $('rp-next-btn').classList.remove('hidden'); $('rp-giveup-btn').classList.add('hidden');
    if(window.state && !window.state.rpHasMistake) { updateScoreAndStats(1, true); window.state.stats.streak = (window.state.stats.streak || 0) + 1; updateGlobalUI(); saveProgress(); checkAchievements(); }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); 
    showToast('🎉', window.state.rpHasMistake ? 'Все фальшивки найдены!' : window.getJokePhrase(true), 'bg-emerald-500', 'border-emerald-700');
};
window.giveUpRedPencil = function() { $$('#rp-content .target-node[data-type="fake"]').forEach(n => { if (!n.classList.contains('crossed')) { n.classList.add('crossed', 'show-correction'); n.innerHTML += `<span class="correction-badge">${n.dataset.correct}</span>`; } }); rpFakesFound = rpFakesTotal; window.updateRPCounter(); if(window.state) { window.state.stats.streak = 0; updateGlobalUI(); saveProgress(); } $('rp-next-btn').classList.remove('hidden'); $('rp-giveup-btn').classList.add('hidden'); };

