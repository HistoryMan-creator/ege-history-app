// visual-trainer.js — Визуальный тренажёр: последовательные характеристики
'use strict';

// ═══════════════════════════════════════════════════════════
//  ВИЗУАЛЬНАЯ АРХИТЕКТУРА — МУЛЬТИ-ХАРАКТЕРИСТИКИ
//  Для каждого памятника спрашиваем 2-3 характеристики подряд
//  (автор, век, город и т.д.), каждая с 4 вариантами.
//  Только если ВСЕ правильно — засчитываем.
// ═══════════════════════════════════════════════════════════

// История показов для spacing (не показывать подряд)
if (!window._visualHistory) window._visualHistory = [];

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

/**
 * Умный подбор следующего памятника:
 * - Не повторять тот же памятник подряд (gap 3-6 итераций)
 * - Приоритет: in-progress (streak > 0) > новые
 */
function visualPickPool(items) {
    const open = items.filter(item => !visualProgressFor(item.id).learned);
    if (!open.length) return null;

    const history = window._visualHistory || [];
    const recentIds = new Set(history.slice(-6));

    // Кандидаты с минимальным gap=3
    const minGap = Math.min(3, open.length - 1);
    const recentBlock = new Set(history.slice(-minGap));
    let candidates = open.filter(item => !recentBlock.has(item.id));
    if (!candidates.length) candidates = open;

    // Приоритет: in-progress
    const inProgress = candidates.filter(item => visualProgressFor(item.id).streak > 0);
    // Из in-progress убираем те что были в последних 6
    const ipFresh = inProgress.filter(item => !recentIds.has(item.id));
    
    let pool;
    if (ipFresh.length) pool = ipFresh;
    else if (inProgress.length) pool = inProgress;
    else {
        const fresh = candidates.filter(item => !recentIds.has(item.id));
        pool = fresh.length ? fresh : candidates;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    window._visualHistory.push(pick.id);
    if (window._visualHistory.length > 20) window._visualHistory = window._visualHistory.slice(-15);
    return pick;
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

/**
 * Генерируем дистракторы для конкретного drill fact
 */
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
        key: `d${idx}`, text: entry.value, correct: false,
    }));
}

/**
 * Строим набор последовательных вопросов для одного памятника.
 * Возвращаем массив шагов (steps), каждый шаг — один drill fact с 4 вариантами.
 * Если у памятника мало drillFacts с дистракторами, используем те что есть (min 1).
 */
function visualBuildSteps(items, item) {
    // Фильтруем date — точный год не спрашиваем
    const facts = (item.drillFacts || []).filter(f => f.type !== 'date' && f.answer && visualFactDistractors(items, item, f).length >= 3);

    if (!facts.length) {
        // Фоллбэк: если нет drill facts с достаточными дистракторами,
        // спрашиваем хотя бы то что есть
        const anyFacts = (item.drillFacts || []).filter(f => f.answer && visualFactDistractors(items, item, f).length >= 1);
        if (!anyFacts.length) return [];
        return anyFacts.map(fact => _buildStep(items, item, fact));
    }

    // Случайный порядок характеристик каждый раз
    const shuffled = shuffleArray([...facts]);

    return shuffled.map(fact => _buildStep(items, item, fact));
}

function _buildStep(items, item, fact) {
    const distractors = visualFactDistractors(items, item, fact);
    // Берём до 3 дистракторов + 1 правильный = 4 варианта
    const options = shuffleArray([
        { key: 'correct', text: fact.answer, correct: true },
        ...distractors.slice(0, 3),
    ]);
    return {
        factType: fact.type,
        label: fact.label,
        question: fact.question,
        correctAnswer: fact.answer,
        options,
    };
}

/** Красивое имя типа факта для UI */
function visualFactIcon(type) {
    const icons = {
        creator: '🎨',
        location: '📍',
        century: '🕰️',
        date: '📅',
        style: '🏛️',
        ruler: '👑',
        event: '⚔️',
    };
    return icons[type] || '❓';
}

function visualFactLabel(type) {
    const labels = {
        creator: 'Автор',
        location: 'Место',
        century: 'Век',
        date: 'Дата',
        style: 'Стиль',
        ruler: 'Правитель',
        event: 'Событие',
    };
    return labels[type] || 'Факт';
}


window.startVisualTrainer = function() {
    haptic('medium');
    window.state.currentMode = 'visual';
    window.state.currentVisualId = null;
    window._visualHistory = [];
    window._visualMultiStep = null;
    $('game-title-display').innerText = '🏛️ Визуал ЕГЭ';
    $('lobby-area').classList.add('hidden');
    $('game-container').classList.remove('hidden');
    $('game-container').classList.add('flex');
    document.body.classList.add('in-game');
    $('bottom-nav').classList.add('hide-nav');
    if (typeof toggleMode === 'function') toggleMode('visual');
};

/**
 * Основной рендер: если нет активного мульти-шага — выбираем новый памятник
 * и строим цепочку вопросов. Если есть — рендерим текущий шаг.
 */
window.renderVisualTrainer = function(forceNew) {
    const area = $('visual-trainer-area');
    if (!area) return;
    const items = visualData();
    if (!items.length) {
        area.innerHTML = '<div class="text-center p-8 bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2c2c2c] text-rose-500 font-black">База визуала не загружена.</div>';
        return;
    }
    if (forceNew) {
        window.state.currentVisualId = null;
        window._visualHistory = [];
        window._visualMultiStep = null;
    }

    const learned = visualLearnedCount(items);
    const pct = Math.round(learned / items.length * 100);

    if (learned >= items.length) {
        area.innerHTML = `<div class="w-full max-w-lg bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-sm border border-gray-200 dark:border-[#2c2c2c] p-8 text-center">
            <div class="text-5xl mb-4">🏆</div>
            <h2 class="text-2xl font-black text-gray-800 dark:text-gray-200 uppercase tracking-widest mb-2">Архитектура выучена!</h2>
            <p class="text-sm font-bold text-gray-500 dark:text-gray-400 mb-6">${learned} / ${items.length} памятников</p>
            <button data-action="resetVisualTrainer" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl uppercase tracking-widest active:scale-95 transition-transform">🔄 Начать заново</button>
        </div>`;
        return;
    }

    // Если нет активной цепочки — выбираем новый памятник
    let ms = window._visualMultiStep;
    if (!ms || ms.finished) {
        const item = visualPickPool(items);
        if (!item) return;
        window.state.currentVisualId = item.id;
        const steps = visualBuildSteps(items, item);
        if (!steps.length) {
            // Если у памятника совсем нет вопросов — пропускаем
            window._visualMultiStep = null;
            setTimeout(() => window.renderVisualTrainer(), 50);
            return;
        }
        ms = {
            item,
            steps,
            currentStep: 0,
            allCorrect: true,
            wrongSteps: [],
            finished: false,
        };
        window._visualMultiStep = ms;
    }

    const item = ms.item;
    const progress = visualProgressFor(item.id);
    const step = ms.steps[ms.currentStep];
    const totalSteps = ms.steps.length;
    const currentIdx = ms.currentStep;

    // --- Stepper dots ---
    const stepperDots = ms.steps.map((s, i) => {
        let dotClass = 'bg-gray-300 dark:bg-gray-600';
        let iconText = '';
        if (i < currentIdx) {
            // Завершённый шаг
            if (ms.wrongSteps.includes(i)) {
                dotClass = 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]';
                iconText = '✗';
            } else {
                dotClass = 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]';
                iconText = '✓';
            }
        } else if (i === currentIdx) {
            dotClass = 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] ring-2 ring-blue-300 dark:ring-blue-700';
        }
        const label = visualFactLabel(s.factType);
        return `<div class="flex flex-col items-center gap-0.5">
            <div class="w-7 h-7 rounded-full ${dotClass} flex items-center justify-center text-[10px] font-black text-white transition-all duration-300">${iconText}</div>
            <span class="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">${visualEscape(label)}</span>
        </div>`;
    }).join(`<div class="flex-1 h-0.5 bg-gray-200 dark:bg-gray-700 self-start mt-3.5 -mx-1"></div>`);

    // --- Streak dots (общий прогресс: 2 правильных раунда подряд) ---
    const streakDots = [0,1].map(i =>
        `<div class="w-3 h-3 rounded-full ${i < progress.streak ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-gray-300 dark:bg-gray-600'}"></div>`
    ).join('');

    // --- Options ---
    const options = step.options.map(option => `
        <button data-action="answerVisualStep" data-arg="${option.key}" data-visual-option="${option.key}"
            class="visual-option w-full text-left bg-white hover:bg-blue-50 dark:bg-[#242424] dark:hover:bg-[#2c2c2c] border border-gray-200 dark:border-[#3f3f46] rounded-xl p-3 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 leading-relaxed active:scale-[0.99] transition-all cursor-pointer">
            ${visualEscape(option.text)}
        </button>`).join('');

    area.innerHTML = `<div class="w-full max-w-5xl flex flex-col gap-2 visual-trainer-root">
        <div class="flex items-center justify-between gap-3 px-1">
            <div class="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest">Визуальная архитектура</div>
            <div class="flex items-center gap-2">
                <div class="text-[10px] sm:text-xs font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full">${learned} / ${items.length} выучено</div>
                <button data-action="resetVisualTrainer" class="text-[10px] font-black text-gray-400 hover:text-rose-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full transition-colors" title="Сбросить прогресс">🔄</button>
            </div>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-1">
            <div class="bg-gradient-to-r from-blue-500 to-emerald-500 h-1.5 rounded-full transition-all duration-700" style="width:${pct}%"></div>
        </div>
        <div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] gap-3 items-stretch">
            <div class="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2c2c2c] shadow-sm overflow-hidden flex flex-col">
                <div class="bg-gray-100 dark:bg-[#181818] flex items-center justify-center visual-img-box">
                    <img src="${visualEscape(item.mainImage)}" alt="Памятник" class="w-full h-full object-contain">
                </div>
                <div class="p-3 border-t border-gray-200 dark:border-[#2c2c2c]">
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="flex-1 min-w-0">
                            <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">🧩 Определи характеристики</div>
                            <div class="flex items-center gap-1 text-[11px] font-bold text-gray-400">
                                <span>Серия:</span> ${streakDots}
                                <span class="ml-1 text-gray-300 dark:text-gray-600">${progress.streak}/2</span>
                            </div>
                        </div>
                    </div>
                    <!-- Stepper -->
                    <div class="flex items-start gap-0 mt-1">${stepperDots}</div>
                </div>
            </div>
            <div class="bg-gray-50 dark:bg-[#181818] rounded-2xl border border-gray-200 dark:border-[#2c2c2c] shadow-sm p-3 sm:p-4 flex flex-col gap-2">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-lg">${visualFactIcon(step.factType)}</span>
                        <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Шаг ${currentIdx + 1} из ${totalSteps}</div>
                    </div>
                    <h3 class="text-sm sm:text-base font-black text-gray-800 dark:text-gray-200 leading-snug">${visualEscape(step.question)}</h3>
                </div>
                <div class="flex flex-col gap-1.5">${options}</div>
                <div id="visual-feedback" class="min-h-[36px] text-xs font-bold text-gray-500 dark:text-gray-400 leading-relaxed mt-auto"></div>
            </div>
        </div>
    </div>`;
};

/**
 * Обработка ответа на один шаг мульти-цепочки
 */
window.answerVisualStep = function(optionKey) {
    const ms = window._visualMultiStep;
    if (!ms || ms.finished) return;

    const step = ms.steps[ms.currentStep];
    const correct = optionKey === 'correct';

    // Подсветить кнопки
    document.querySelectorAll('[data-visual-option]').forEach(btn => {
        btn.disabled = true;
        btn.classList.remove('hover:bg-blue-50', 'dark:hover:bg-[#2c2c2c]', 'cursor-pointer');
        if (btn.dataset.visualOption === 'correct') {
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
        if (feedback) feedback.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400">✓ ${visualEscape(visualFactLabel(step.factType))}: ${visualEscape(step.correctAnswer)}</span>`;
    } else {
        haptic('error');
        ms.allCorrect = false;
        ms.wrongSteps.push(ms.currentStep);
        if (feedback) feedback.innerHTML = `<span class="text-rose-600 dark:text-rose-400">✗ Правильно: ${visualEscape(step.correctAnswer)}</span>`;
    }

    const isLast = ms.currentStep >= ms.steps.length - 1;

    if (isLast) {
        // Завершение раунда — подводим итоги
        ms.finished = true;
        const item = ms.item;
        const progress = visualProgressFor(item.id);
        progress.attempts = (progress.attempts || 0) + 1;
        progress.lastUpdated = Date.now();

        if (ms.allCorrect) {
            progress.correct = (progress.correct || 0) + 1;
            progress.streak = Math.min((progress.streak || 0) + 1, 2);
            if (progress.streak >= 2) {
                progress.learned = true;
                progress.learnedAt = Date.now();
                window.state.currentVisualId = null;
                window.state.stats.visualArchitectureSolved = (window.state.stats.visualArchitectureSolved || 0) + 1;
                setTimeout(() => {
                    if (feedback) feedback.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400">🏆 Все верно! <b>${visualEscape(item.title)}</b> — ВЫУЧЕНО!</span>`;
                }, correct ? 300 : 800);
                showToast('🏛️', `${item.title} выучен!`, 'bg-emerald-500', 'border-emerald-700');
            } else {
                window.state.currentVisualId = item.id;
                setTimeout(() => {
                    if (feedback) feedback.innerHTML = `<span class="text-blue-600 dark:text-blue-400">✅ Все характеристики верны! <b>${visualEscape(item.title)}</b> — серия ${progress.streak}/2</span>`;
                }, correct ? 300 : 800);
            }
        } else {
            progress.streak = 0;
            progress.learned = false;
            window.state.currentVisualId = null;
            const wrongCount = ms.wrongSteps.length;
            setTimeout(() => {
                if (feedback) feedback.innerHTML = `<span class="text-rose-600 dark:text-rose-400">❌ Это <b>${visualEscape(item.title)}</b>. Ошибок: ${wrongCount} из ${ms.steps.length}. Серия сброшена.</span>`;
            }, correct ? 300 : 800);
        }

        saveProgress();
        // Переход к следующему памятнику
        const delay = ms.allCorrect ? 1500 : 2500;
        setTimeout(() => {
            window._visualMultiStep = null;
            window.renderVisualTrainer();
        }, delay);
    } else {
        // Переход к следующему шагу
        ms.currentStep++;
        const delay = correct ? 700 : 1400;
        setTimeout(() => window.renderVisualTrainer(), delay);
    }
};

window.resetVisualTrainer = function() {
    if (!confirm('Сбросить весь прогресс визуала? Все памятники вернутся в пул.')) return;
    haptic('light');
    window.state.stats.visualArchitectureProgress = {};
    window.state.stats.visualArchitectureSolved = 0;
    window.state.currentVisualId = null;
    window._visualHistory = [];
    window._visualMultiStep = null;
    saveProgress();
    window.renderVisualTrainer(true);
    showToast('🔄', 'Прогресс визуала сброшен', 'bg-blue-500', 'border-blue-700');
};
