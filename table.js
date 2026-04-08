// table.js — единый генератор таблиц для всех типов заданий
// Заменяет 4 отдельные функции generateTable/Task3/Task5/Task7Table (~800 строк → ~350)
'use strict';

// ═══════════════════════════════════════════════════════════
//  АЛГОРИТМЫ ПОДБОРА СТРОК ПО ЭПОХАМ
// ═══════════════════════════════════════════════════════════

// Task4: 75% — по одной из каждой эпохи, 25% — 2×XX + early + XVIII/XIX
function pickTargetTask4(allowed, rowsCount) {
    if (rowsCount !== 4) return null;
    const ep = {};
    TASK_EPOCHS.forEach(e => { ep[e] = shuffleArray(allowed.filter(f => f.c === e)); });
    const usedEv = new Set();
    const pick1 = (pool) => { for (const f of pool) { if (!usedEv.has(f.event)) { usedEv.add(f.event); return f; } } return null; };
    const use20twice = Math.random() < 0.25;
    let picked = [];
    if (use20twice && ep['20th'].length >= 2) {
        const p20a = pick1(ep['20th']), p20b = pick1(ep['20th']);
        const pEa = pick1(ep['early']);
        const midEp = Math.random() < 0.5 ? '18th' : '19th';
        const pMid = pick1(ep[midEp]) || pick1(ep[midEp === '18th' ? '19th' : '18th']);
        picked = [p20a, p20b, pEa, pMid].filter(Boolean);
    } else {
        TASK_EPOCHS.forEach(e => { const f = pick1(ep[e]); if (f) picked.push(f); });
    }
    return picked.length === 4 ? shuffleArray(picked) : null;
}

// Task3: строго по одному из каждой эпохи
function pickTargetTask3(allowed, rowsCount) {
    if (rowsCount !== 4) return null;
    const ep = {};
    TASK_EPOCHS.forEach(e => { ep[e] = shuffleArray(allowed.filter(f => f.c === e)); });
    if (!TASK_EPOCHS.every(e => ep[e].length > 0)) return null;
    const uP = new Set(), uF = new Set(), target = [];
    TASK_EPOCHS.forEach(e => {
        for (const f of ep[e]) {
            if (uP.has(f.process) || uF.has(f.fact)) continue;
            target.push(f); uP.add(f.process); uF.add(f.fact); break;
        }
    });
    return target.length === 4 ? shuffleArray(target) : null;
}

// Task5: early + XVIII-XIX + ВОВ + (60% СВО / 40% другой XX)
function pickTargetTask5(allowed, rowsCount) {
    if (rowsCount !== 4) return null;
    const isEarly = f => f.year < 1700;
    const is1819 = f => f.year >= 1700 && f.year <= 1899;
    const isWW2 = f => f.year >= 1941 && f.year <= 1945;
    const isSVO = f => f.year >= 2022;
    const isOther20 = f => f.year >= 1900 && f.year < 1941;
    const slotUE = new Set(), slotUP = new Set();
    const pick1 = (pool) => { for (const f of pool) { if (!slotUE.has(f.event) && !slotUP.has(f.person)) { slotUE.add(f.event); slotUP.add(f.person); return f; } } return null; };
    const shuf = shuffleArray([...allowed]);
    const slot1 = pick1(shuf.filter(isEarly));
    const slot2 = pick1(shuf.filter(is1819));
    const slot3 = pick1(shuf.filter(isWW2));
    const wantSVO = Math.random() < 0.6;
    const slot4 = wantSVO
        ? (pick1(shuf.filter(isSVO)) || pick1(shuf.filter(isOther20)))
        : (pick1(shuf.filter(isOther20)) || pick1(shuf.filter(isSVO)));
    const slots = [slot1, slot2, slot3, slot4].filter(Boolean);
    return slots.length === 4 ? shuffleArray(slots) : null;
}

// Task7: 50% схема A (1+1+1+1), 50% схема B (1+0+2+1)
function pickTargetTask7(allowed, rowsCount) {
    if (rowsCount !== 4) return null;
    const ep = {};
    TASK_EPOCHS.forEach(e => { ep[e] = allowed.filter(f => f.c === e); });
    const pickFrom = (pool, count, usedC) => {
        const res = [];
        for (const f of shuffleArray([...pool])) {
            if (res.length >= count) break;
            if (!usedC.has(f.culture)) { res.push(f); usedC.add(f.culture); }
        }
        return res;
    };
    const usedC = new Set();
    let picked = [];
    if (Math.random() < 0.5) {
        TASK_EPOCHS.forEach(e => { picked.push(...pickFrom(ep[e], 1, usedC)); });
    } else {
        picked.push(...pickFrom(ep['early'], 1, usedC));
        picked.push(...pickFrom(ep['19th'], 2, usedC));
        picked.push(...pickFrom(ep['20th'], 1, usedC));
    }
    return picked.length === 4 ? shuffleArray(picked) : null;
}

const EPOCH_PICKERS = { task3: pickTargetTask3, task4: pickTargetTask4, task5: pickTargetTask5, task7: pickTargetTask7 };

// ═══════════════════════════════════════════════════════════
//  SMART DISTRACTORS — генерация ловушек
// ═══════════════════════════════════════════════════════════

function generateDistractors(task, target, missing) {
    const poolItems = [...missing];

    if (task === 'task4') {
        return generateDistractorsTask4(target, poolItems);
    }

    // Task3/5/7: единая логика — берём дистракторы из того же/соседнего периода
    const cfg = TASK_CONFIG[task];
    const dataSource = cfg.data();
    const targetPeriods = [...new Set(target.map(t => t.c))];
    const periodOrder = TASK_EPOCHS;
    const adjSet = new Set();
    targetPeriods.forEach(p => {
        const i = periodOrder.indexOf(p);
        if (i > 0) adjSet.add(periodOrder[i - 1]);
        if (i < periodOrder.length - 1) adjSet.add(periodOrder[i + 1]);
    });
    targetPeriods.forEach(p => adjSet.delete(p));

    // Определяем поле для дистракторов
    const fieldMap = { task3: 'fact', task5: 'person', task7: 'trait' };
    const field = fieldMap[task];

    const usedVals = new Set(poolItems);
    // Для task7 дополнительно исключаем trait'ы целевых культур
    if (task === 'task7') {
        const targetCultures = new Set(target.map(t => t.culture));
        dataSource.forEach(d => { if (targetCultures.has(d.culture)) usedVals.add(d[field]); });
    }

    const scored = [];
    const seen = new Set();
    dataSource.forEach(d => {
        const val = d[field];
        if (seen.has(val) || usedVals.has(val)) return;
        seen.add(val);
        const pri = targetPeriods.includes(d.c) ? 0 : (adjSet.has(d.c) ? 1 : 2);
        scored.push({ val, pri });
    });
    shuffleArray(scored);
    scored.sort((a, b) => a.pri - b.pri);

    const fakesCount = Math.ceil(target.length / 2);
    const needed = target.length + fakesCount;
    for (const s of scored) {
        if (poolItems.length >= needed) break;
        poolItems.push(s.val);
    }
    return poolItems;
}

function generateDistractorsTask4(target, poolItems) {
    const rowsCount = target.length;
    // Вычисляем blanks и hidden types
    const blanksPerRow = Array(rowsCount).fill(1);
    let rem = Math.floor(rowsCount * 1.5) - rowsCount;
    while (rem > 0) {
        const r = Math.floor(Math.random() * rowsCount);
        if (blanksPerRow[r] < 2) { blanksPerRow[r]++; rem--; }
    }

    const totalBlanks = blanksPerRow.reduce((a, b) => a + b, 0);
    const types = ['geo', 'event', 'year'];
    const availableTypes = [];
    for (let i = 0; i < totalBlanks; i++) availableTypes.push(types[i % 3]);

    const fakesPerType = Math.ceil(rowsCount / 4);
    const requiredFakes = { geo: fakesPerType, event: fakesPerType, year: fakesPerType };
    const hiddenRowsData = [];

    function popType(av, excl) {
        const valIds = av.map((t, i) => excl.includes(t) ? -1 : i).filter(i => i !== -1);
        if (valIds.length === 0) return av.splice(Math.floor(Math.random() * av.length), 1)[0];
        return av.splice(valIds[Math.floor(Math.random() * valIds.length)], 1)[0];
    }

    // Определяем что скрыть в каждой строке
    const rowChoices = [];
    target.forEach((row, idx) => {
        const needed = blanksPerRow[idx];
        const chosen = [];
        for (let i = 0; i < needed; i++) chosen.push(popType(availableTypes, chosen));
        hiddenRowsData.push({ row, types: chosen });
        rowChoices.push(chosen);
        chosen.forEach(key => poolItems.push(row[key]));
    });

    // Авто-ловушки для годов
    function autoYearTraps(yearStr) {
        const y = parseInt(yearStr, 10);
        if (!y) return [];
        const seen = new Set(), candidates = [];
        window.bigData.forEach(d => {
            const dy = parseInt(d.year, 10);
            if (dy && dy !== y && !seen.has(d.year) && Math.abs(dy - y) <= 50) {
                seen.add(d.year); candidates.push({ val: d.year, dist: Math.abs(dy - y) });
            }
        });
        return candidates.sort((a, b) => a.dist - b.dist).slice(0, 5).map(c => c.val);
    }

    function autoGeoTraps(geoStr, period) {
        const targetGeos = new Set(target.map(t => t.geo));
        const seen = new Set(), result = [];
        shuffleArray(window.bigData.filter(d => d.c === period && !targetGeos.has(d.geo) && d.geo !== geoStr))
            .forEach(d => { if (!seen.has(d.geo)) { seen.add(d.geo); result.push(d.geo); } });
        return result.slice(0, 5);
    }

    const targetPeriodSet = new Set(target.map(t => t.c));
    const pFacts = window.bigData.filter(d => targetPeriodSet.has(d.c));

    ['geo', 'event', 'year'].forEach(type => {
        for (let i = 0; i < requiredFakes[type]; i++) {
            const relHid = hiddenRowsData.find(h => h.types.includes(type));
            // Ручные ловушки
            if (typeof trapDict !== 'undefined' && relHid && Math.random() < 0.6) {
                const pT = trapDict[relHid.row[type]];
                if (pT && pT.length > 0) {
                    const trap = pT[Math.floor(Math.random() * pT.length)];
                    if (!poolItems.includes(trap)) { poolItems.push(trap); continue; }
                }
            }
            // Авто-ловушки для годов
            if (type === 'year' && relHid) {
                const picked = autoYearTraps(relHid.row.year).find(t => !poolItems.includes(t));
                if (picked) { poolItems.push(picked); continue; }
            }
            // Авто-ловушки для гео
            if (type === 'geo' && relHid) {
                const picked = autoGeoTraps(relHid.row.geo, relHid.row.c).find(t => !poolItems.includes(t));
                if (picked) { poolItems.push(picked); continue; }
            }
            // Fallback
            let fnd = false, att = 0;
            while (!fnd && att < 50) {
                const rF = pFacts[Math.floor(Math.random() * pFacts.length)];
                if (rF && !poolItems.includes(rF[type])) { poolItems.push(rF[type]); fnd = true; }
                att++;
            }
        }
    });

    return { poolItems, rowChoices, blanksPerRow };
}

// ═══════════════════════════════════════════════════════════
//  ЕДИНЫЙ ГЕНЕРАТОР ТАБЛИЦ
// ═══════════════════════════════════════════════════════════

function generateTable() {
    const task = window.state.currentTask;

    // Автовыбор задания в режиме ошибок
    if (window.state.currentMode === 'mistakes') {
        const mPool = window.state.mistakesPool || [];
        const now = Date.now();
        const availableTasks = [];
        TASK_LIST.forEach(t => {
            const cfg = TASK_CONFIG[t];
            const hasM = mPool.some(m => m.task === t);
            const p = cfg.data();
            const hasE = p.some(f => {
                const d = window.state.stats.factStreaks[cfg.keyFn(f)];
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

    // Режим детектива — отдельная логика
    if (window.state.currentMode === 'detective') return generateDetectiveTable();

    // Task4 имеет 3-колоночную таблицу с множественными скрытыми полями — отдельная ветка
    if (window.state.currentTask === 'task4') return generateTask4Table();

    // Task3/5/7 — единая логика 2-колоночной таблицы
    return generateTwoColumnTable();
}

// Task3/5/7 — единый генератор 2-колоночных таблиц
function generateTwoColumnTable() {
    const task = window.state.currentTask;
    const cfg = TASK_CONFIG[task];

    window.state.tableHasMistake = false;
    window.state.answersRevealed = false;

    const isForced4 = window.state.currentMode === 'speedrun' || window.state.currentMode === 'duel';
    const rowsCount = isForced4 ? 4 : (parseInt($('filter-rows').value) || 4);
    const actualPeriod = isForced4 ? 'all' : ($('filter-period').value || 'all');

    // Сброс UI
    resetTableUI();

    $('table-head').innerHTML = `<tr>${cfg.tableHeaders.map((h, i) =>
        `<th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[${cfg.headerWidths[i]}] ${i === 0 ? 'text-left pl-2 sm:pl-4' : 'border-l border-gray-200 dark:border-[#2c2c2c] text-center'}">${h}</th>`
    ).join('')}</tr>`;

    // Получаем пул
    let allowed = getFilteredPool(actualPeriod, rowsCount);
    if (!allowed || allowed.length === 0) {
        $('task-table-body').innerHTML = `<tr><td colspan="2" class="p-10 text-center font-bold text-rose-500 bg-white dark:bg-[#1e1e1e]">⚠️ Нет событий!</td></tr>`;
        return;
    }

    // Подбираем строки
    let target = [];
    if (window.state.isHomeworkMode && window.state.hwTargetIndices?.length > 0) {
        const dataSource = cfg.data();
        const count = Math.min(rowsCount, window.state.hwCurrentPool.length);
        window.state.hwCurrentPool.slice(0, count).forEach(i => {
            if (dataSource[i]) target.push(dataSource[i]);
        });
    } else {
        const picker = EPOCH_PICKERS[task];
        // Умный подбор работает если доступны все эпохи (all, или кастом покрывающий все)
        const coversAll = TASK_EPOCHS.every(e => allowed.some(f => f.c === e));
        if (coversAll && picker) target = picker(allowed, rowsCount) || [];
        if (target.length === 0) {
            // Fallback: случайный выбор с дедупликацией
            target = [];
            const dedupeKey = task === 'task7' ? 'culture' : (task === 'task3' ? 'process' : 'event');
            const dedupeKey2 = task === 'task3' ? 'fact' : (task === 'task5' ? 'person' : null);
            const used1 = new Set(), used2 = new Set();
            const shuf = shuffleArray([...allowed]);
            for (const f of shuf) {
                if (target.length >= rowsCount) break;
                if (used1.has(f[dedupeKey])) continue;
                if (dedupeKey2 && used2.has(f[dedupeKey2])) continue;
                target.push(f);
                used1.add(f[dedupeKey]);
                if (dedupeKey2) used2.add(f[dedupeKey2]);
            }
        }
    }

    // Сортировка по году для task3
    if (task === 'task3') {
        const sortByYear = $('filter-sort-year') && $('filter-sort-year').checked;
        if (sortByYear) target.sort((a, b) => (a.year || 0) - (b.year || 0));
    }

    window.state.currentTargetData = target;

    // Определяем скрытое поле и отображаемое
    const fieldMap = { task3: ['process', 'fact'], task5: ['event', 'person'], task7: ['culture', 'trait'] };
    const [displayField, hiddenField] = fieldMap[task];

    const missing = [];
    const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М'];
    const trFrag = document.createDocumentFragment();

    target.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 dark:border-[#2c2c2c] bg-white dark:bg-[#1e1e1e] transition-colors hover:bg-gray-50 dark:hover:bg-[#25282a]";
        tr.dataset.index = idx;
        missing.push(row[hiddenField]);

        const chipClass = task === 'task7' ? 'task7-chip' : '';
        tr.innerHTML = `<td class="p-1.5 sm:p-3 py-1.5 align-middle text-left border-r border-gray-100 dark:border-[#2c2c2c]"><span class="text-[11px] sm:text-[14px] font-bold text-gray-800 dark:text-gray-300 leading-relaxed block">${letters[idx] || '?'}) ${row[displayField]}</span></td>` +
            `<td class="p-1 sm:p-3 py-1.5 align-middle text-center overflow-hidden"><div class="dnd-slot relative ${chipClass ? '' : ''}" data-expected="${String(row[hiddenField]).replace(/"/g, '&quot;')}" data-letter="?"></div></td>`;
        trFrag.appendChild(tr);
    });
    $('task-table-body').appendChild(trFrag);

    // Дистракторы
    const poolItems = generateDistractors(task, target, missing);

    const poolFrag = document.createDocumentFragment();
    const chipExtraClass = task === 'task7' ? ' task7-chip' : '';
    shuffleArray(poolItems).forEach(txt => {
        const c = document.createElement('div');
        c.className = 'dnd-chip' + chipExtraClass;
        c.innerText = txt;
        c.dataset.pureText = txt;
        poolFrag.appendChild(c);
    });
    $('pool-container').appendChild(poolFrag);
}

// Task4 — 3-колоночная таблица со смешанными скрытыми полями
function generateTask4Table() {
    window.state.tableHasMistake = false;
    window.state.answersRevealed = false;

    const isForced4 = window.state.currentMode === 'speedrun' || window.state.currentMode === 'duel';
    const rowsCount = isForced4 ? 4 : (parseInt(DOM['filter-rows']?.value || $('filter-rows').value) || 4);
    const actualPeriod = isForced4 ? 'all' : (DOM['filter-period']?.value || $('filter-period').value || 'all');

    resetTableUI();

    if (generateTable._lastHeadTask !== 'task4') {
        $('table-head').innerHTML = `<tr><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[27.5%] text-center">🗺️ Объект</th><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[45%] border-l border-gray-200 dark:border-[#2c2c2c] text-center">📜 Событие</th><th class="p-1.5 sm:p-3 text-[11px] sm:text-[14px] font-bold border-b border-gray-200 dark:border-[#2c2c2c] w-[27.5%] border-l border-gray-200 dark:border-[#2c2c2c] text-center">⏳ Дата</th></tr>`;
        generateTable._lastHeadTask = 'task4';
    }

    let target = [];
    if (window.state.isHomeworkMode && window.state.hwTargetIndices?.length > 0) {
        const count = Math.min(rowsCount, window.state.hwCurrentPool.length);
        window.state.hwCurrentPool.slice(0, count).forEach(i => {
            if (window.bigData[i]) target.push(window.bigData[i]);
        });
    } else {
        const allowed = getFilteredPool(actualPeriod, rowsCount);
        if (!allowed || allowed.length === 0) {
            $('task-table-body').innerHTML = `<tr><td colspan="3" class="p-10 text-center font-bold text-rose-500 bg-white dark:bg-[#1e1e1e]">⚠️ Нет событий!</td></tr>`;
            return;
        }
        // Умный подбор работает если доступны все эпохи (all, или кастом покрывающий все)
        const coversAllEpochs4 = TASK_EPOCHS.every(e => allowed.some(f => f.c === e));
        if (coversAllEpochs4) target = pickTargetTask4(allowed, rowsCount) || [];
        if (target.length === 0) target = shuffleArray([...allowed]).slice(0, Math.min(rowsCount, allowed.length));
    }

    window.state.currentTargetData = target;

    // Генерация дистракторов для task4
    const result = generateDistractorsTask4(target, []);
    const { poolItems, rowChoices } = result;

    const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М', 'Н', 'О', 'П'];
    let lIdx = 0;
    const trFrag = document.createDocumentFragment();

    target.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 dark:border-[#2c2c2c] bg-white dark:bg-[#1e1e1e] transition-colors hover:bg-gray-50 dark:hover:bg-[#25282a]";
        tr.dataset.index = idx;
        const chosen = rowChoices[idx];

        ['geo', 'event', 'year'].forEach(key => {
            const td = document.createElement('td');
            td.className = "p-1 sm:p-3 py-1.5 align-middle text-center overflow-hidden border-l border-gray-100 dark:border-[#2c2c2c] first:border-l-0";
            if (chosen.includes(key)) {
                td.innerHTML = `<div class="dnd-slot relative" data-expected="${String(row[key]).replace(/"/g, '&quot;')}" data-letter="${letters[lIdx] || '?'}"></div>`;
                lIdx++;
            } else {
                const style = key === 'year' ? "font-bold text-blue-800 dark:text-blue-400" : "text-gray-700 dark:text-gray-300";
                let cH = `<span class="text-[11px] sm:text-[14px] ${style} leading-relaxed block">${row[key]}</span>`;
                if (key === 'geo' && typeof geoDict !== 'undefined' && geoDict[row[key]]) {
                    cH = `<span onclick="openMapModal('${row[key]}')" title="На карте" class="text-[11px] sm:text-[14px] font-bold text-blue-600 dark:text-blue-400 underline decoration-dashed cursor-pointer block">${row[key]}</span>`;
                }
                td.innerHTML = cH;
            }
            tr.appendChild(td);
        });
        trFrag.appendChild(tr);
    });
    $('task-table-body').appendChild(trFrag);

    const pFrag = document.createDocumentFragment();
    shuffleArray(poolItems).forEach(txt => {
        const c = document.createElement('div');
        c.className = "dnd-chip";
        c.innerText = txt;
        c.dataset.pureText = txt;
        pFrag.appendChild(c);
    });
    $('pool-container').appendChild(pFrag);
}

// Сброс UI таблицы
function resetTableUI() {
    const poolTitle = DOM['pool-title'] || $('pool-title');
    if (poolTitle) poolTitle.innerHTML = '<span>🧩</span> ВАРИАНТЫ';
    const stamp = DOM['detective-stamp'] || $('detective-stamp');
    if (stamp) stamp.classList.add('hidden');

    const checkBtns = DOM['check-buttons'] || $('check-buttons');
    if (checkBtns) { checkBtns.classList.remove('hidden'); checkBtns.classList.add('flex'); }

    const btnSure = DOM['check-btn-sure'] || $('check-btn-sure');
    if (btnSure) btnSure.innerHTML = '✅ Уверен';
    const btnDoubt = DOM['check-btn-doubt'] || $('check-btn-doubt');
    if (btnDoubt) btnDoubt.innerHTML = '🤔 Сомневаюсь';

    const revealBtn = DOM['reveal-btn'] || $('reveal-btn');
    if (revealBtn) {
        revealBtn.className = "hidden text-gray-500 hover:text-orange-500 dark:text-gray-400 font-bold py-2 active:scale-95 text-[11px] sm:text-xs w-full transition-colors underline uppercase tracking-wider mt-2";
        revealBtn.innerHTML = '👀 Сдаюсь, покажи ответы';
    }

    const nextBtn = DOM['next-btn'] || $('next-btn');
    if (nextBtn) nextBtn.classList.add('hidden');

    const tbody = DOM['task-table-body'] || $('task-table-body');
    if (tbody) tbody.innerHTML = '';
    const pool = DOM['pool-container'] || $('pool-container');
    if (pool) pool.innerHTML = '';
}

// Обработка кликов по слотам и чипам
function handleSlotClick(slot) {
    if (slot.classList.contains('correct-slot') || slot.classList.contains('revealed-slot')) return;
    haptic('light');
    if (window.state.selectedChip) {
        if (slot.classList.contains('has-item')) {
            const oldC = slot.querySelector('.dnd-chip');
            if (oldC) { oldC.classList.remove('in-slot', 'selected'); $('pool-container').appendChild(oldC); }
        }
        const newC = window.state.selectedChip;
        newC.classList.remove('selected');
        newC.classList.add('in-slot');
        slot.innerHTML = '';
        slot.appendChild(newC);
        slot.classList.add('has-item');
        slot.classList.remove('incorrect-slot');
        window.state.selectedChip = null;
        updateSlotGlow();
    } else if (slot.classList.contains('has-item')) {
        const oldC = slot.querySelector('.dnd-chip');
        if (oldC) {
            oldC.classList.remove('in-slot', 'selected');
            $('pool-container').appendChild(oldC);
            slot.innerHTML = '';
            slot.classList.remove('has-item', 'incorrect-slot');
        }
    }
}

function updateSlotGlow() {
    $$('.dnd-slot').forEach(s => s.classList.toggle('slot-ready', !!window.state.selectedChip && !s.classList.contains('has-item')));
}

window.onChipClick = function(chip, e) {
    haptic('light');
    const now = Date.now();
    const timeSinceLastClick = now - (chip._lastClickTime || 0);

    if (chip.classList.contains('crossed-out')) {
        chip.classList.remove('crossed-out', 'opacity-30', 'line-through', 'grayscale', 'scale-90');
        chip._lastClickTime = 0;
    } else if (timeSinceLastClick < 300) {
        chip.classList.add('crossed-out', 'opacity-30', 'line-through', 'grayscale', 'scale-90');
        chip.classList.remove('selected');
        if (window.state.selectedChip === chip) window.state.selectedChip = null;
        updateSlotGlow();
        e.stopPropagation();
        chip._lastClickTime = now;
        return;
    }

    chip._lastClickTime = now;

    if (chip.classList.contains('in-slot')) {
        e.stopPropagation();
        const slot = chip.parentElement;
        if (slot.classList.contains('correct-slot') || slot.classList.contains('revealed-slot')) return;
        chip.classList.remove('in-slot', 'selected');
        $('pool-container').appendChild(chip);
        slot.innerHTML = '';
        slot.classList.remove('has-item', 'incorrect-slot');
        if (window.state.selectedChip === chip) window.state.selectedChip = null;
        updateSlotGlow();
        return;
    }

    if (window.state.selectedChip && window.state.selectedChip !== chip) {
        window.state.selectedChip.classList.remove('selected');
    }
    if (window.state.selectedChip !== chip) {
        window.state.selectedChip = chip;
        chip.classList.add('selected');
    } else {
        window.state.selectedChip = null;
        chip.classList.remove('selected');
    }
    updateSlotGlow();
};
