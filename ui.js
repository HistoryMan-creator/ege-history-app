// ui.js — UI: модалки, тосты, тема, онбординг, настройки, статистика
// Загружается первым (нет зависимостей от app.js)
'use strict';

window.showModal = function(id) {
    const m = document.getElementById(id); if(!m) return;
    m.classList.remove('hidden'); m.classList.add('flex');
    setTimeout(() => m.classList.remove('opacity-0'), 10);
};
window.hideModal = function(id) {
    const m = document.getElementById(id); if(!m) return;
    m.classList.add('opacity-0');
    setTimeout(() => { m.classList.add('hidden'); m.classList.remove('flex'); }, 300);
};

window._currentHwStudentId = null;
window._currentHwTask = 'task4';

window.promptAssignHw = function(studentId, name) {
    window._currentHwStudentId = studentId;
    window._currentHwTask = 'task4';
    document.getElementById('assign-hw-student-name').textContent = name || 'Ученик';
    document.getElementById('assign-hw-rows').value = '';
    document.getElementById('assign-hw-deadline').value = '';
    // Сбросить кнопки
    document.querySelectorAll('.hw-task-btn').forEach(b => b.className = b.className.replace(/bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900\/30 dark:text-blue-300/g, 'bg-white border-gray-200 text-gray-600 dark:bg-[#2c2c2c] dark:border-[#3f3f46] dark:text-gray-400'));
    const def = document.getElementById('hw-task-btn-task4');
    if (def) def.className = def.className.replace('bg-white border-gray-200 text-gray-600 dark:bg-[#2c2c2c] dark:border-[#3f3f46] dark:text-gray-400', 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300');
    document.querySelectorAll('.hw-rows-btn').forEach(b => b.className = b.className.replace('border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', 'border-gray-200 bg-white text-gray-600 dark:bg-[#2c2c2c] dark:border-[#3f3f46] dark:text-gray-400'));
    document.querySelectorAll('.hw-deadline-btn').forEach(b => b.className = b.className.replace('border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', 'border-gray-200 bg-white text-gray-600 dark:bg-[#2c2c2c] dark:border-[#3f3f46] dark:text-gray-400'));
    showModal('assign-hw-modal');
};

window.selectHwTask = function(task) {
    window._currentHwTask = task;
    ['task3','task4','task5','task7'].forEach(t => {
        const btn = document.getElementById('hw-task-btn-' + t);
        if (!btn) return;
        const active = t === task;
        btn.style.cssText = active
            ? 'border-color:#3b82f6;background:#eff6ff;color:#1d4ed8'
            : '';
    });
};

window.setHwRows = function(n) {
    document.getElementById('assign-hw-rows').value = n;
    document.querySelectorAll('.hw-rows-btn').forEach(b => {
        const active = Number(b.dataset.rows) === n;
        b.style.cssText = active ? 'border-color:#3b82f6;background:#eff6ff;color:#1d4ed8' : '';
    });
};

window.setHwDeadline = function(days) {
    const d = new Date(); d.setDate(d.getDate() + days);
    document.getElementById('assign-hw-deadline').value = d.toISOString().split('T')[0];
    document.querySelectorAll('.hw-deadline-btn').forEach(b => {
        const active = Number(b.dataset.days) === days;
        b.style.cssText = active ? 'border-color:#7c3aed;background:#f5f3ff;color:#6d28d9' : '';
    });
};

window.submitAssignHw = function() {
    const num = parseInt(document.getElementById('assign-hw-rows').value);
    if (isNaN(num) || num <= 0) return showToast('⚠️', 'Введите количество строк', 'bg-rose-500', 'border-rose-700');
    const task = window._currentHwTask || 'task4';
    const deadline = document.getElementById('assign-hw-deadline').value || null;
    hideModal('assign-hw-modal');
    if (window._assignHwDb) window._assignHwDb(window._currentHwStudentId, num, task, deadline);
};

function checkOnboarding() {
    if (!localStorage.getItem('ege_onboarding_done')) {
        $('onboarding-overlay').classList.remove('hidden');
        $('onboarding-overlay').classList.add('flex');
    }
}
window.nextOnbStep = function(step) {
    haptic('light');
    for (let i = 1; i <= 6; i++) {
        const s = $('onb-step-' + i); if (s) s.classList.toggle('hidden', i !== step);
        const d = $('onb-dot-' + i); if (d) { 
            d.classList.toggle('bg-blue-500', i === step); 
            d.classList.toggle('bg-gray-300', i !== step && i > step); 
            d.classList.toggle('bg-blue-200', i < step);
            d.classList.toggle('dark:bg-gray-600', i !== step);
        }
    }
};
window.finishOnboarding = function() {
    haptic('medium');
    // Save name/class from onboarding slide 6 if provided
    const onbName = $('onb-name-input') ? $('onb-name-input').value.trim() : '';
    const onbClass = $('onb-class-input') ? $('onb-class-input').value.trim() : '';
    if (onbName) localStorage.setItem('student_manual_name', onbName);
    if (onbClass) localStorage.setItem('student_class_code', onbClass);
    localStorage.setItem('ege_onboarding_done', '1');
    $('onboarding-overlay').classList.add('hidden');
    $('onboarding-overlay').classList.remove('flex');
    if (onbName || onbClass) {
        if (window.syncProgressToCloud) window.syncProgressToCloud();
        showToast('✅', 'Профиль сохранён! Удачи на ЕГЭ!', 'bg-emerald-500', 'border-emerald-700');
    }
};

// === PULL-TO-REFRESH ===
// БАГ-ФИКс: эта функция вызывалась как IIFE с $ из app.js, который ещё не загружен.
// $ — это const из app.js, он не доступен когда выполняется ui.js (defer-порядок).
// Решение: используем document.getElementById напрямую и откладываем до app:ready.
document.addEventListener('app:ready', function initPullToRefresh() {
    let startY = 0, pulling = false;
    const lobby = document.getElementById('lobby-area');
    if (!lobby) return;
    lobby.addEventListener('touchstart', function(e) {
        if (window.scrollY === 0 && !document.body.classList.contains('in-game')) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });
    lobby.addEventListener('touchmove', function(e) {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 80) {
            pulling = false;
            if (typeof haptic === 'function') haptic('medium');
            if (typeof updateProgressBars === 'function') updateProgressBars();
            if (typeof updateGlobalUI === 'function') updateGlobalUI();
            showToast('🔄', 'Обновлено!', 'bg-blue-500', 'border-blue-700');
        }
    }, { passive: true });
    lobby.addEventListener('touchend', function() { pulling = false; }, { passive: true });
}, { once: true });

window.openGlobalSettings = function() {
    $('pre-game-title').innerText = 'Глобальные настройки';
    
    $('pg-period-container').classList.remove('hidden');
    $('pg-rows-container').classList.remove('hidden');
    $('pg-case-container').classList.add('hidden'); 
    $('pg-database-container').classList.remove('hidden'); 
    $('pg-hide-learned-container').classList.remove('hidden');
    
    // Hide period & rows for detective mode (Secret Archive uses its own case system)
    if (window.state.currentMode === 'detective') {
        $('pg-period-container').classList.add('hidden');
        $('pg-rows-container').classList.add('hidden');
        $('pg-database-container').classList.add('hidden');
        $('pg-hide-learned-container').classList.add('hidden');
        $('pg-case-container').classList.remove('hidden');
    }
    // Hide rows for red pencil mode
    if (window.state.currentMode === 'redpencil') {
        $('pg-rows-container').classList.add('hidden');
        $('pg-database-container').classList.add('hidden');
    }
    
    if ($('filter-period')) $('pg-filter-period').value = $('filter-period').value || 'custom';
    if ($('filter-case')) $('pg-filter-case').value = $('filter-case').value || 'rtw';
    if ($('filter-database')) $('pg-filter-database').value = $('filter-database').value || 'top100';
    if ($('filter-rows')) window.setPgRows($('filter-rows').value || '4');
    // Always open custom period by default with 862-2026
    if ($('pg-filter-period').value === 'custom' || $('pg-filter-period').value === 'all') {
        $('pg-filter-period').value = 'custom';
        $('filter-period').value = 'custom';
        if (!$('pg-custom-year-start').value || $('pg-custom-year-start').value === '0') $('pg-custom-year-start').value = '862';
        if (!$('pg-custom-year-end').value || $('pg-custom-year-end').value === '0') $('pg-custom-year-end').value = '2026';
    }
    checkCustomPeriod(); 
    showModal('pre-game-modal'); 
    setTimeout(() => $('pg-sheet').classList.remove('translate-y-full'), 10);
};

window.closePreGameModal = function() { hideModal('pre-game-modal'); $('pg-sheet').classList.add('translate-y-full'); };
window.checkCustomPeriod = function() { $('pg-custom-period-container').classList.toggle('hidden', $('pg-filter-period').value !== 'custom'); };
window.setPgRows = function(rows) { $$('.pg-row-btn').forEach(btn => btn.className = "pg-row-btn bg-white border-gray-200 text-gray-600 dark:bg-[#2c2c2c] dark:border-[#3f3f46] dark:text-gray-400 border-2 rounded-xl py-3 font-black text-sm transition-colors"); $(`btn-row-${rows}`).className = "pg-row-btn bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-2 rounded-xl py-3 font-black text-sm transition-colors"; $('filter-rows').value = rows; };

window.applyGlobalSettings = function() {
    haptic('medium'); 
    $('filter-period').value = $('pg-filter-period').value; 
    $('custom-year-start').value = $('pg-custom-year-start').value; 
    $('custom-year-end').value = $('pg-custom-year-end').value;
    $('filter-case').value = $('pg-filter-case').value;
    if ($('filter-database')) $('filter-database').value = $('pg-filter-database').value;
    const hideLearned = $('pg-hide-learned').checked; 
    $('toggle-hide-learned').checked = hideLearned; 
    window.state.hideLearned = hideLearned; 
    
    saveProgress();
    closePreGameModal();
    
    if (document.body.classList.contains('in-game')) {
        window.handleSettingsChange();
    } else {
        showToast('⚙️', 'Настройки сохранены', 'bg-blue-500', 'border-blue-700');
    }
};

function toggleTheme() { localStorage.setItem('ege_theme', document.documentElement.classList.toggle('dark') ? 'dark' : 'light'); }

window.toggleFocusMode = function() {
    window.state.focusMode = !window.state.focusMode; 
    const header = $('main-header'), bottomNav = $('bottom-nav'), body = document.body;
    
    if (window.state.focusMode) { 
        body.classList.add('zen-mode-active'); 
        header.classList.add('hidden'); 
        bottomNav.classList.add('hide-nav'); 
        if (!body.classList.contains('in-game')) body.classList.add('in-game'); 
        showToast('🧘', 'Режим Дзен активирован', 'bg-teal-500', 'border-teal-700'); 
    } else { 
        body.classList.remove('zen-mode-active'); 
        header.classList.remove('hidden'); 
        if (!$('lobby-area').classList.contains('hidden')) { 
            bottomNav.classList.remove('hide-nav'); 
            body.classList.remove('in-game'); 
        }
        showToast('🧘', 'Дзен отключен', 'bg-gray-500', 'border-gray-700'); 
    }
    window.updateZenButton();
};

function toggleHideLearned() { window.state.hideLearned = $('toggle-hide-learned').checked; saveProgress(); handleSettingsChange(); }

window.startHwFromBanner = function() {
    haptic('light');
    // Стартуем с задания у которого больше всего строк в ДЗ
    const s = window.state.stats;
    const tasks = [
        { key: 'task3', cnt: s.hwTask3||0 },
        { key: 'task4', cnt: s.hwTask4||0 },
        { key: 'task5', cnt: s.hwTask5||0 },
        { key: 'task7', cnt: s.hwTask7||0 },
    ];
    const best = tasks.reduce((a,b) => b.cnt > a.cnt ? b : a, tasks[0]);
    quickStartGame(best.cnt > 0 ? best.key : 'task4', 'normal');
};

window.openEGEModal = function() {
    haptic('light');
    const r = estimateEGEScore(window.state.stats);
    const score = r.score;
    const color = score >= 85 ? '#0F6E56' : score >= 70 ? '#185FA5' : score >= 55 ? '#BA7517' : '#A32D2D';
    const grade = score >= 85 ? 'Отлично' : score >= 70 ? 'Хорошо' : score >= 55 ? 'Средне' : 'Слабо';

    const rows = [
        { label:'База', val:'+20', pct:29, color:'#888' },
        { label:'Задание №4 (факты)', val:'+'+Math.round(r.s4), pct:Math.round((r.s4/20)*100), color:'#185FA5' },
        { label:'Задание №3 (процессы)', val:'+'+Math.round(r.s3), pct:Math.round((r.s3/17)*100), color:'#1D9E75' },
        { label:'Задание №5 (даты)', val:'+'+Math.round(r.s5), pct:Math.round((r.s5/16)*100), color:'#8b5cf6' },
        { label:'Задание №7 (культура)', val:'+'+Math.round(r.s7), pct:Math.round((r.s7/12)*100), color:'#d97706' },
        { label:'Штраф за эпохи', val:'−'+r.pen, pct:Math.round((r.pen/25)*100), color:'#E24B4A', neg:true },
        { label:'Точность'+(r.accuracy?` (${r.accuracy}%)`:''), val:(r.accAdj>=0?'+':'')+r.accAdj, pct:Math.round((Math.abs(r.accAdj)/15)*100), color: r.accAdj >= 0 ? '#1D9E75' : '#E24B4A', neg: r.accAdj < 0 },
    ];

    const rowsHtml = rows.map(row => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;color:#888;min-width:160px;flex-shrink:0">${row.label}</span>
        <div style="flex:1;height:5px;background:rgba(128,128,128,0.15);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${row.pct}%;background:${row.color};border-radius:3px;transition:width .3s"></div>
        </div>
        <span style="font-size:12px;font-weight:700;color:${row.neg?'#E24B4A':row.color};min-width:36px;text-align:right">${row.val}</span>
      </div>`).join('');

    const potentialRow = r.ceiling < 100 && r.weakEra ? `
      <div style="background:rgba(234,179,8,0.12);border:0.5px solid rgba(234,179,8,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin-top:12px">
        ⚠ Слабое место: <b>${r.weakEra}</b>. Потолок = ${r.ceiling}. Прокачай эту эпоху — выйдешь на ${Math.min(100, r.score + (100 - r.ceiling))}+.
      </div>` : '';

    const ceilRow = r.ceiling < 100 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;opacity:.7">
        <span style="font-size:11px;color:#888;min-width:160px;flex-shrink:0">Потолок (слаб. эпоха)</span>
        <div style="flex:1;height:5px;background:rgba(128,128,128,0.15);border-radius:3px;overflow:hidden"><div style="height:100%;width:${r.ceiling}%;background:#888;border-radius:3px"></div></div>
        <span style="font-size:12px;font-weight:700;color:#888;min-width:36px;text-align:right">≤${r.ceiling}</span></div>` : '';

    const factsRow = `<div style="margin:12px 0 8px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em;font-weight:700">Выучено фактов</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${[['📍 №4',r.d4,500,'#185FA5'],['👤 №5',r.d5,250,'#8b5cf6'],['🔗 №3',r.d3,150,'#1D9E75'],['🎨 №7',r.d7,180,'#d97706']].map(([lbl,cnt,mx,clr])=>`
        <div style="background:rgba(128,128,128,0.07);border-radius:8px;padding:8px 10px">
          <div style="font-size:11px;color:#888;margin-bottom:4px">${lbl}</div>
          <div style="font-size:16px;font-weight:700;color:${clr}">${cnt}<span style="font-size:10px;font-weight:400;color:#aaa"> / ${mx}</span></div>
          <div style="margin-top:4px;height:3px;background:rgba(128,128,128,0.15);border-radius:2px"><div style="height:100%;width:${Math.min(100,Math.round(cnt/mx*100))}%;background:${clr};border-radius:2px"></div></div>
        </div>`).join('')}
      </div>`;

    // Используем существующий модал-контейнер через innerHTML overlay
    const overlayId = 'ege-score-overlay';
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.55);display:flex;align-items:flex-end;justify-content:center;padding:0';
        overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div style="background:var(--tw-bg-opacity,1);background-color:#fff;width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:24px 20px 32px;max-height:90vh;overflow-y:auto" class="dark:bg-[#1e1e1e]">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#888">Прогноз ЕГЭ по истории</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px">
            <span style="font-size:48px;font-weight:500;color:${color};line-height:1">${score}</span>
            <span style="font-size:13px;color:${color};font-weight:700">${grade}</span>
          </div>
        </div>
        <button onclick="document.getElementById('${overlayId}').remove()" style="font-size:20px;color:#aaa;background:none;border:none;cursor:pointer;padding:4px 8px">✕</button>
      </div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;color:#888;margin-bottom:8px">Из чего складывается</div>
      ${rowsHtml}${ceilRow}${potentialRow}${factsRow}
      <div style="margin-top:16px;font-size:10px;color:#aaa;text-align:center">Факты — основной сигнал (65 оч.), точность — до ±15 оч., база — 20. Не учитывает задания 18–24.</div>
    </div>`;
};

function updateGlobalUI() {
    let totalL = 0, freshL = 0, now = Date.now();
    Object.values(window.state.stats.factStreaks || {}).forEach(d => { if (window.isFactLearned(d)) { totalL++; if (d.nextReview > now) freshL++; } });
    // EGE score badge
    const egeResult = estimateEGEScore(window.state.stats);
    const egeEl = $('stat-ege');
    if (egeEl) {
        egeEl.textContent = '~' + egeResult.score;
        const sc = egeResult.score;
        egeEl.className = 'text-xs sm:text-sm font-black ' +
            (sc >= 85 ? 'text-emerald-400' : sc >= 70 ? 'text-blue-300' : sc >= 55 ? 'text-yellow-300' : 'text-rose-400');
    }
    updateText($('stat-streak'), window.state.stats.streak); updateText($('stat-solved'), window.state.stats.totalSolvedEver); if($('zen-stat-solved')) updateText($('zen-stat-solved'), window.state.stats.totalSolvedEver); updateText($('stat-learned'), totalL); updateText($('modal-stat-solved'), window.state.stats.totalSolvedEver); updateText($('modal-stat-mistakes'), window.state.mistakesPool.length);
    // Per-task solved counters
    const sbt = window.state.stats.solvedByTask || {};
    if ($('modal-stat-task3')) $('modal-stat-task3').textContent = sbt.task3 || 0;
    if($('modal-stat-task4')) updateText($('modal-stat-task4'), sbt.task4 || 0);
    if($('modal-stat-task5')) updateText($('modal-stat-task5'), sbt.task5 || 0);
    if($('modal-stat-task7')) updateText($('modal-stat-task7'), sbt.task7 || 0);
    if (window.state.isHomeworkMode && window.state.hwTargetIndices && window.state.hwTargetIndices.length > 0 && $('hw-remaining')) updateText($('hw-remaining'), window.state.hwCurrentPool.length);
    if (window.state.stats.hwFlashcardsToSolve > 0) { 
        if($('personal-hw-alert')) $('personal-hw-alert').classList.remove('hidden'); 
        if($('personal-hw-remaining')) updateText($('personal-hw-remaining'), window.state.stats.hwFlashcardsToSolve); 
        // Per-task breakdown
        if($('personal-hw-breakdown')) {
            const parts = [];
            if ((window.state.stats.hwTask3||0) > 0) parts.push('🔗№3:' + window.state.stats.hwTask3);
            if ((window.state.stats.hwTask4||0) > 0) parts.push('📍№4:' + window.state.stats.hwTask4);
            if ((window.state.stats.hwTask5||0) > 0) parts.push('👤№5:' + window.state.stats.hwTask5);
            if ((window.state.stats.hwTask7||0) > 0) parts.push('🎨№7:' + window.state.stats.hwTask7);
            const dlRaw = localStorage.getItem('teacher_hw_deadline');
            const dlStr = dlRaw ? ' · до ' + new Date(dlRaw + 'T00:00:00').toLocaleDateString('ru-RU', {day:'numeric',month:'short'}) : '';
            $('personal-hw-breakdown').textContent = (parts.length ? parts.join(' ') : '') + dlStr;
        }
        if($('lobby-hw-banner')) $('lobby-hw-banner').classList.remove('hidden');
        if($('lobby-hw-remaining')) updateText($('lobby-hw-remaining'), window.state.stats.hwFlashcardsToSolve);
        const dlRawL = localStorage.getItem('teacher_hw_deadline');
        if($('lobby-hw-deadline')) $('lobby-hw-deadline').textContent = dlRawL ? ('Срок: ' + new Date(dlRawL + 'T00:00:00').toLocaleDateString('ru-RU', {day:'numeric',month:'long'})) : ''; 
    } 
    else { if($('personal-hw-alert')) $('personal-hw-alert').classList.add('hidden'); if($('lobby-hw-banner')) $('lobby-hw-banner').classList.add('hidden'); }
    let h = totalL === 0 ? 100 : Math.round((freshL / totalL) * 100); let hC = 'text-emerald-400'; if (h < 50) hC = 'text-rose-400'; else if (h < 80) hC = 'text-yellow-400';
    if ($('stat-memory')) { $('stat-memory').parentElement.classList.remove('text-emerald-400', 'text-rose-400', 'text-yellow-400'); $('stat-memory').parentElement.classList.add(hC); updateText($('stat-memory'), h + '%'); }
}

let toastTimeout = null;
function showToast(emoji, text, bg, border) { const t = $('joke-toast'), c = $('toast-content'); c.innerHTML = `<span>${emoji}</span><span>${text}</span>`; c.className = `${bg} ${border} text-slate-50 font-bold text-xs sm:text-sm px-4 py-2 rounded-l-lg shadow-lg flex items-center gap-2 border-y-2 border-l-2`; t.classList.remove('translate-x-full'); if (toastTimeout) clearTimeout(toastTimeout); toastTimeout = setTimeout(() => t.classList.add('translate-x-full'), 2000); }

function endGame() {
    clearInterval(window.state.timerInterval); $('modal-score').innerText = window.state.stats.streak;
    if (window.state.currentMode === 'speedrun') { if (window.state.stats.streak > (window.state.stats.bestSpeedrunScore || 0)) { window.state.stats.bestSpeedrunScore = window.state.stats.streak; checkAchievements(); } }
    saveLocal(); // ✅ Сохраняем локально сразу
    syncNow();   // ✅ И немедленно в облако — игра завершена, это ключевое событие
    showModal('game-over-modal'); $('board-overlay').classList.remove('hidden');
}

window.closeGameOverModal = function() { 
    if (window.state.isHomeworkMode) window.location.href = window.location.pathname; 
    else { hideModal('game-over-modal'); $('board-overlay').classList.add('hidden'); backToLobby(); } 
};

function shareTelegram() { const text = `🔥 Мой стрик в тренажере ЕГЭ по истории — ${window.state.stats.streak}! Попробуй побить: `; window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`); }

window.openStatsModal = function() {
    updateGlobalUI(); if (window.loadStudentLeaderboard) window.loadStudentLeaderboard();
    if ($('stats-era-container')) {
        const tasks = [
            { key: 'task3', label: '🔗 Задание №3', color: 'text-emerald-600 dark:text-emerald-400' },
            { key: 'task4', label: '📍 Задание №4', color: 'text-blue-600 dark:text-blue-400' },
            { key: 'task5', label: '👤 Задание №5', color: 'text-purple-600 dark:text-purple-400' },
            { key: 'task7', label: '🎨 Задание №7', color: 'text-amber-600 dark:text-amber-400' },
        ];
        let eH = '';
        tasks.forEach(({ key, label, color }) => {
            const taskEra = (window.state.stats.eraStats || {})[key] || {};
            const totalAttempts = Object.values(taskEra).reduce((s, e) => s + (e.total || 0), 0);
            if (!totalAttempts) return;
            eH += `<div class="mb-3"><div class="text-[10px] font-black ${color} uppercase tracking-widest mb-2 px-1">${label}</div>`;
            for (const [eKey, eName] of Object.entries(TASK_EPOCH_NAMES)) {
                const e = taskEra[eKey] || { correct: 0, total: 0 };
                if (!e.total) continue;
                const pc = Math.round((e.correct / e.total) * 100);
                const pcColor = pc > 80 ? 'text-emerald-500' : pc > 50 ? 'text-yellow-500' : 'text-rose-500';
                const barColor = pc > 80 ? '#10b981' : pc > 50 ? '#f59e0b' : '#f43f5e';
                eH += `<div class="flex items-center gap-3 bg-gray-50 dark:bg-[#181818] p-2.5 rounded-xl border border-gray-100 dark:border-[#2c2c2c] mb-1.5">
                    <span class="text-[10px] font-black text-gray-500 dark:text-gray-400 min-w-[90px]">${eName}</span>
                    <div class="flex-1 h-1.5 bg-gray-200 dark:bg-[#2c2c2c] rounded-full overflow-hidden">
                        <div style="width:${pc}%;background:${barColor}" class="h-full rounded-full"></div>
                    </div>
                    <span class="text-xs font-black ${pcColor} min-w-[42px] text-right">${pc}% <span class="text-gray-400 font-normal text-[10px]">(${e.correct}/${e.total})</span></span>
                </div>`;
            }
            eH += '</div>';
        });
        $('stats-era-container').innerHTML = eH || '<p class="text-[11px] font-bold text-gray-400 uppercase tracking-widest text-center py-4">Ещё нет данных</p>';
    }
    if ($('stats-daily-container')) { const dStat = window.state.stats.dailyStats || {}; const dts = Object.keys(dStat).sort((a,b) => new Date(b) - new Date(a)).slice(0, 7); if (dts.length > 0) { let dH = ''; dts.forEach(d => { const day = dStat[d]; const mins = Math.floor((day.timeSpent || 0) / 60); const t3 = day.solvedTask3 || 0; const t4 = day.solvedTask4 || 0; const t5 = day.solvedTask5 || 0; const t7 = day.solvedTask7 || 0; const total = day.solved || 0; const taskParts = []; if (t3) taskParts.push(`<span class="text-emerald-500">🔗${t3}</span>`); if (t4) taskParts.push(`<span class="text-blue-500">📍${t4}</span>`); if (t5) taskParts.push(`<span class="text-purple-500">👤${t5}</span>`); if (t7) taskParts.push(`<span class="text-amber-500">🎨${t7}</span>`); const taskStr = taskParts.length > 0 ? taskParts.join(' ') : `<span class="text-examBlue dark:text-blue-400">${total}</span>`; dH += `<div class="bg-gray-50 dark:bg-[#181818] p-3 rounded-xl border border-gray-100 dark:border-[#2c2c2c]"><div class="flex justify-between items-center"><span class="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">${new Date(d).toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit'})}</span><span class="font-bold text-yellow-600 dark:text-yellow-500 text-[11px]">⏱ ${mins} мин</span></div><div class="flex gap-3 mt-1.5 text-[11px] font-black">${taskStr}<span class="text-gray-400 ml-auto">Всего: ${total}</span></div></div>`; }); $('stats-daily-container').innerHTML = dH; } else $('stats-daily-container').innerHTML = '<p class="text-[11px] font-bold text-gray-500 text-center py-4 uppercase tracking-widest">Пока нет данных.</p>'; }
    showModal('stats-modal');
};

window.openMistakesListModal = function() {
    const cont = $('mistakes-list-container'); const pool = window.state.mistakesPool || [];
    if (pool.length === 0) cont.innerHTML = '<div class="text-center p-8 text-gray-500 font-bold text-sm uppercase tracking-widest bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2c2c2c]">Ошибок нет! Вы молодец 🎉</div>';
    else { 
        let ht = '<div class="flex flex-col gap-2">'; 
        pool.forEach((m, idx) => { 
            let mTitle = m.task === 'task7' ? '🎨 Задание 7' : (m.task === 'task5' ? '👤 Задание 5' : (m.task === 'task3' ? '🔗 Задание 3' : '📍 Задание 4'));
            let mContent = m.task === 'task7' ? `<span class="text-amber-600 dark:text-amber-400">${m.fact.culture}</span> ➡️ ${m.fact.trait}` : (m.task === 'task5' ? `<span class="text-blue-600 dark:text-blue-400">${m.fact.person}</span> ➡️ ${m.fact.event}` : (m.task === 'task3' ? `<span class="text-emerald-600 dark:text-emerald-400">${m.fact.process}</span> ➡️ ${m.fact.fact}` : `<span class="text-emerald-600 dark:text-emerald-400">${m.fact.geo}</span> | <span class="text-blue-600 dark:text-blue-400">${m.fact.year}</span><br>${m.fact.event}`));
            ht += `<div class="bg-white dark:bg-[#1e1e1e] p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 shadow-sm flex gap-3 text-sm"><div class="font-black text-rose-300 w-4 text-right shrink-0">${idx + 1}.</div><div class="flex flex-col"><span class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">${mTitle}</span><span class="font-medium text-gray-800 dark:text-gray-300 leading-tight">${mContent}</span></div></div>`; 
        }); 
        ht += '</div>'; 
        cont.innerHTML = ht; 
    }
    showModal('mistakes-list-modal');
};

window.openProfileModal = function() {
    $('profile-name-input').value = localStorage.getItem('student_manual_name') || '';
    $('profile-class-code').value = localStorage.getItem('student_class_code') || '';
    const gEmail = localStorage.getItem('google_email');
    if ($('profile-google-status')) {
        $('profile-google-status').textContent = gEmail ? '✅ ' + gEmail : 'Не привязан';
        $('profile-google-status').className = gEmail ? 'text-[11px] font-bold text-emerald-600 mt-1' : 'text-[11px] font-bold text-gray-400 mt-1';
    }
    showModal('profile-modal');
};
window.saveProfileName = function() { const nm = $('profile-name-input').value.trim(), cd = $('profile-class-code').value.trim(); if (nm) localStorage.setItem('student_manual_name', nm); if (cd !== undefined) localStorage.setItem('student_class_code', cd); showToast('✅', 'Профиль сохранен!', 'bg-emerald-500', 'border-emerald-700'); hideModal('profile-modal'); if (window.syncProgressToCloud) window.syncProgressToCloud(); };

window.openAchievementsModal = function() {
    const gr = $('achievements-grid'); if (gr && typeof achievementsList !== 'undefined') { let ht = ''; achievementsList.forEach(a => { const isU = window.state.stats.achievements.includes(a.id); ht += `<div class="achievement-card bg-white dark:bg-[#1e1e1e] border ${isU ? 'border-yellow-400 shadow-[0_4px_15px_rgba(250,204,21,0.2)]' : 'border-gray-100 dark:border-[#2c2c2c]'} rounded-2xl p-4 flex flex-col items-center text-center relative ${isU ? '' : 'achievement-locked'}"><div class="text-4xl mb-3 drop-shadow-sm">${a.icon}</div><h4 class="font-black text-[10px] sm:text-xs text-gray-800 dark:text-gray-300 mb-1 leading-tight uppercase tracking-wide">${a.name}</h4><p class="text-[9px] font-bold text-gray-400 leading-tight mt-1">${a.desc}</p></div>`; }); gr.innerHTML = ht; }
    showModal('achievements-modal');
};

window.openTeacherModal = function() {
    let tc = localStorage.getItem('teacher_class_code'); if(!tc) { tc = Math.floor(1000 + Math.random() * 9000).toString(); localStorage.setItem('teacher_class_code', tc); } $('teacher-class-code-input').value = tc;
    switchTeacherTab('stats'); showModal('teacher-modal');
};

window.saveTeacherClassCode = function() { const cd = $('teacher-class-code-input').value.trim(); if(cd) localStorage.setItem('teacher_class_code', cd); if (window.loadClassProgress) window.loadClassProgress(); };
window.switchTeacherTab = function(tab) { ['stats', 'weekly'].forEach(t => { $(`teacher-tab-${t}`).classList.add('hidden'); $(`teacher-tab-${t}`).classList.remove('flex'); $(`tab-btn-${t}`).className = "py-3 text-[9px] sm:text-xs font-black border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors uppercase tracking-wide leading-none truncate"; }); $(`teacher-tab-${tab}`).classList.remove('hidden'); $(`teacher-tab-${tab}`).classList.add('flex'); $(`tab-btn-${tab}`).className = "py-3 text-[9px] sm:text-xs font-black border-b-2 border-examBlue text-examBlue dark:text-blue-400 transition-colors uppercase tracking-wide leading-none truncate"; if (window.loadClassProgress) window.loadClassProgress(); };

window.copyTextReport = function() { 
    const tM = Math.floor((window.state.stats.totalTimeSpent || 0) / 60); 
    const lC = Object.values(window.state.stats.factStreaks || {}).filter(window.isFactLearned).length; 
    let t = `🎓 Отчет: Тренажер ЕГЭ История\n📅 Дата: ${new Date().toLocaleDateString('ru-RU')}\n⏱ Время: ${tM} мин\n✅ Решено: ${window.state.stats.totalSolvedEver}\n🃏 Карточек: ${window.state.stats.flashcardsSolved || 0}\n🔥 Стрик: ${window.state.stats.streak}\n🧠 Выучено: ${lC} фактов\n\n📊 По эпохам:\n`; 
    const rawEra = window.state.stats.eraStats || {};
    Object.entries(TASK_EPOCH_NAMES).forEach(([k, n]) => {
        let correct = 0, total = 0;
        ['task3','task4','task5','task7'].forEach(tk => { const e = (rawEra[tk] || {})[k] || {}; correct += e.correct || 0; total += e.total || 0; });
        t += `- ${n}: ${total > 0 ? Math.round((correct / total) * 100) : 0}% (${correct} из ${total})\n`;
    });
    if (window.state.mistakesPool.length > 0) { 
        t += `\n⚠️ Ошибки:\n`; 
        window.state.mistakesPool.forEach((m, i) => { 
            if (m.task === 'task7') t += `${i + 1}. ${m.fact.culture} ➡️ ${m.fact.trait}\n`;
            else if (m.task === 'task5') t += `${i + 1}. ${m.fact.event} ➡️ ${m.fact.person}\n`;
            else if (m.task === 'task3') t += `${i + 1}. ${m.fact.process} ➡️ ${m.fact.fact}\n`;
            else t += `${i + 1}. ${m.fact.geo} | ${m.fact.event} | ${m.fact.year}\n`; 
        }); 
    } else t += `\n🎉 Ошибок нет!\n`; 
    const copyFn = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('📋', 'Скопировано!', 'bg-emerald-500', 'border-emerald-700'); }; 
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => showToast('📋', 'Скопировано!', 'bg-emerald-500', 'border-emerald-700')).catch(copyFn); else copyFn(); 
};

window.openMapModal = function(name) { const cd = typeof geoDict !== 'undefined' ? geoDict[name] : null; $('yandex-map-iframe').src = cd ? `https://yandex.ru/map-widget/v1/?ll=${cd[0]},${cd[1]}&z=6&pt=${cd[0]},${cd[1]},pm2rdm` : `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(name + ' историческое место')}&z=6`; $('map-modal-title').innerText = name; showModal('map-modal'); };

