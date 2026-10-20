/* ==================================================================
 * Portal de Estudos — lógica do app (PWA)
 * ================================================================== */
'use strict';

/* ----------------------------- CONSTANTES --------------------------- */

const STORAGE_KEY = 'estudo.dados.v1';
const THEME_KEY = 'estudo.tema';

const MODES = {
    focus: { label: 'Foco', ring: 'is-focus' },
    short: { label: 'Pausa curta', ring: 'is-break' },
    long: { label: 'Pausa longa', ring: 'is-break' },
};

const DEFAULT_DATA = {
    settings: {
        focus: 25,
        short: 5,
        long: 15,
        cycle: 4,
        goal: 120,
        autoStart: false,
        sound: true,
        notify: false,
    },
    tasks: [],
    stats: { sessions: 0, minutes: 0, tasksDone: 0, history: {} },
};

const $ = (id) => document.getElementById(id);
const RING_CIRCUMFERENCE = 2 * Math.PI * 88;

/* ------------------------------ ESTADO ------------------------------ */

let data = loadData();

const timer = {
    mode: 'focus',
    remaining: 0,
    running: false,
    endAt: 0,
    cycle: 1,
    tickId: null,
};

let taskFilter = 'all';
let toastTimer = null;

/* -------------------------- PERSISTÊNCIA --------------------------- */

function loadData() {
    let stored = {};
    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (err) {
        console.warn('Dados corrompidos, recomeçando.', err);
    }
    return {
        settings: { ...DEFAULT_DATA.settings, ...(stored.settings || {}) },
        tasks: Array.isArray(stored.tasks) ? stored.tasks : [],
        stats: { ...DEFAULT_DATA.stats, ...(stored.stats || {}), history: (stored.stats && stored.stats.history) || {} },
    };
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
        toast('Não foi possível salvar os dados.');
    }
}

/* ------------------------------ UTILITÁRIOS ------------------------ */

function todayKey(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayLabel(date) {
    return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

function todayStats() {
    const key = todayKey();
    if (!data.stats.history[key]) data.stats.history[key] = { minutes: 0, sessions: 0, tasks: 0 };
    return data.stats.history[key];
}

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function toast(message, duration = 2600) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.hidden = true;
    }, duration);
}

/* ------------------------------- TEMA ------------------------------- */

function applyTheme(theme) {
    const resolved = theme === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem(THEME_KEY, theme);
    $('theme-btn').textContent = resolved === 'dark' ? '☀️' : '🌙';
}

function cycleTheme() {
    const current = localStorage.getItem(THEME_KEY) || 'auto';
    const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
    applyTheme(next);
    toast(`Tema: ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[next]}`);
}

/* -------------------------------- ABAS ------------------------------ */

function initTabs() {
    const buttons = [...document.querySelectorAll('.tab')];
    const panels = [...document.querySelectorAll('.panel')];

    /** Ativa o painel cujo id é `panelId` (vem de aria-controls dos botões). */
    function activate(panelId) {
        buttons.forEach((btn) => {
            const active = btn.getAttribute('aria-controls') === panelId;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
            btn.tabIndex = active ? 0 : -1;
        });
        panels.forEach((panel) => {
            const active = panel.id === panelId;
            panel.classList.toggle('is-active', active);
            panel.hidden = !active;
        });
    }

    buttons.forEach((btn, index) => {
        btn.addEventListener('click', () => activate(btn.getAttribute('aria-controls')));
        btn.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const dir = event.key === 'ArrowRight' ? 1 : -1;
            const next = buttons[(index + dir + buttons.length) % buttons.length];
            next.focus();
            activate(next.getAttribute('aria-controls'));
        });
    });

    const hash = location.hash.replace('#', '');
    const target = buttons.find((btn) => btn.id === `tab-btn-${hash}`);
    if (target) activate(target.getAttribute('aria-controls'));
}

/* -------------------------------- SOM ------------------------------- */

let audioCtx = null;

function playSound() {
    if (!data.settings.sound) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = audioCtx || new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        [0, 0.22, 0.44].forEach((delay, index) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(index === 2 ? 880 : 660, now + delay);
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.25, now + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.18);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + 0.2);
        });
    } catch (err) {
        console.warn('Não foi possível tocar o som.', err);
    }
}

function notify(title, body) {
    if (!data.settings.notify || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    } catch (err) {
        console.warn('Notificação indisponível.', err);
    }
}

/* ------------------------------- TIMER ------------------------------ */

function phaseDuration(mode = timer.mode) {
    const s = data.settings;
    return (mode === 'focus' ? s.focus : mode === 'short' ? s.short : s.long) * 60;
}

function renderTimer() {
    const total = phaseDuration();
    const remaining = timer.remaining;
    const progress = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;

    $('timer-value').textContent = formatTime(remaining);
    $('timer-value').setAttribute('datetime', `PT${Math.floor(remaining / 60)}M${remaining % 60}S`);
    $('timer-mode').textContent = MODES[timer.mode].label;
    $('timer-cycle').textContent = `Ciclo ${timer.cycle} de ${data.settings.cycle}`;

    const ring = $('ring-progress');
    ring.setAttribute('stroke-dasharray', RING_CIRCUMFERENCE.toFixed(2));
    ring.setAttribute('stroke-dashoffset', (RING_CIRCUMFERENCE * (1 - progress)).toFixed(2));

    const ringWrap = ring.closest('.timer-ring');
    ringWrap.classList.toggle('is-focus', timer.mode === 'focus');
    ringWrap.classList.toggle('is-break', timer.mode !== 'focus');

    $('btn-start').textContent = timer.running ? 'Pausar' : remaining === total ? 'Iniciar' : 'Continuar';
}

function startTimer() {
    if (timer.running) return;
    if (timer.remaining <= 0) timer.remaining = phaseDuration();
    timer.endAt = Date.now() + timer.remaining * 1000;
    timer.running = true;
    $('timer-status').textContent = MODES[timer.mode].label + ' em andamento. Boa concentração!';
    timer.tickId = setInterval(tick, 250);
    renderTimer();
}

function pauseTimer() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    timer.running = false;
    clearInterval(timer.tickId);
    timer.tickId = null;
    $('timer-status').textContent = 'Pausado. Retome quando estiver pronto.';
    renderTimer();
}

function resetTimer() {
    timer.running = false;
    clearInterval(timer.tickId);
    timer.tickId = null;
    timer.remaining = phaseDuration();
    $('timer-status').textContent = 'Cronômetro reiniciado.';
    renderTimer();
}

function tick() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    if (timer.remaining <= 0) {
        finishPhase(true);
        return;
    }
    renderTimer();
}

function nextMode() {
    if (timer.mode === 'focus') {
        const finishedCycle = timer.cycle % data.settings.cycle === 0;
        return finishedCycle ? 'long' : 'short';
    }
    timer.cycle += 1;
    return 'focus';
}

function finishPhase(completed) {
    clearInterval(timer.tickId);
    timer.tickId = null;
    timer.running = false;

    if (completed && timer.mode === 'focus') {
        const stats = todayStats();
        stats.minutes += data.settings.focus;
        stats.sessions += 1;
        data.stats.minutes += data.settings.focus;
        data.stats.sessions += 1;
        saveData();
        playSound();
        notify('Ciclo de foco concluído!', `Você estudou ${data.settings.focus} minutos. Faça uma pausa.`);
        $('timer-status').textContent = `Ciclo concluído! +${data.settings.focus} min de foco.`;
        toast(`+${data.settings.focus} minutos de foco registrados 🎉`);
    } else if (completed) {
        playSound();
        notify('Pausa concluída', 'Hora de voltar ao foco!');
        $('timer-status').textContent = 'Pausa concluída. Bora focar de novo?';
    }

    timer.mode = nextMode();
    timer.remaining = phaseDuration();
    renderTimer();
    renderProgress();

    if (data.settings.autoStart) startTimer();
}

function skipPhase() {
    timer.running = false;
    clearInterval(timer.tickId);
    timer.tickId = null;
    timer.mode = nextMode();
    timer.remaining = phaseDuration();
    $('timer-status').textContent = 'Etapa pulada.';
    renderTimer();
}

function initTimer() {
    timer.remaining = phaseDuration();
    renderTimer();

    $('btn-start').addEventListener('click', () => (timer.running ? pauseTimer() : startTimer()));
    $('btn-reset').addEventListener('click', resetTimer);
    $('btn-skip').addEventListener('click', skipPhase);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && timer.running) tick();
    });
}

/* ------------------------------ AJUSTES ----------------------------- */

function initSettings() {
    const s = data.settings;
    const map = {
        'set-focus': 'focus',
        'set-short': 'short',
        'set-long': 'long',
        'set-goal': 'goal',
    };

    Object.entries(map).forEach(([id, key]) => {
        const input = $(id);
        input.value = s[key];
        input.addEventListener('change', () => {
            const min = Number(input.min) || 1;
            const max = Number(input.max) || 999;
            let value = Math.min(max, Math.max(min, parseInt(input.value, 10) || min));
            input.value = value;
            data.settings[key] = value;
            if (!timer.running && timer.remaining > 0) timer.remaining = phaseDuration();
            saveData();
            renderTimer();
            renderProgress();
        });
    });

    const auto = $('set-auto');
    auto.checked = s.autoStart;
    auto.addEventListener('change', () => {
        data.settings.autoStart = auto.checked;
        saveData();
    });

    const sound = $('set-sound');
    sound.checked = s.sound;
    sound.addEventListener('change', () => {
        data.settings.sound = sound.checked;
        saveData();
        if (sound.checked) playSound();
    });

    const notifyBox = $('set-notify');
    notifyBox.checked = s.notify && 'Notification' in window && Notification.permission === 'granted';
    notifyBox.addEventListener('change', async () => {
        if (!notifyBox.checked) {
            data.settings.notify = false;
            saveData();
            return;
        }
        if (!('Notification' in window)) {
            notifyBox.checked = false;
            toast('Este navegador não suporta notificações.');
            return;
        }
        const permission = await Notification.requestPermission();
        data.settings.notify = permission === 'granted';
        notifyBox.checked = data.settings.notify;
        saveData();
        if (!data.settings.notify) toast('Permissão de notificações negada.');
    });
}

/* ------------------------------ TAREFAS ----------------------------- */

function taskMatchesFilter(task) {
    if (taskFilter === 'pending') return !task.done;
    if (taskFilter === 'done') return task.done;
    return true;
}

function renderTasks() {
    const list = $('task-list');
    const empty = $('task-empty');
    list.textContent = '';

    const visible = data.tasks.filter(taskMatchesFilter);
    visible.forEach((task) => list.appendChild(buildTaskItem(task)));

    empty.hidden = visible.length > 0;

    const total = data.tasks.length;
    const done = data.tasks.filter((t) => t.done).length;
    $('task-counter').textContent = `${done}/${total}`;
    $('task-progress-bar').style.width = total ? `${(done / total) * 100}%` : '0%';
}

function buildTaskItem(task) {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' is-done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', `Concluir tarefa: ${task.text}`);
    checkbox.addEventListener('change', () => toggleTask(task.id, checkbox.checked));

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'task-delete';
    remove.textContent = '🗑';
    remove.setAttribute('aria-label', `Excluir tarefa: ${task.text}`);
    remove.addEventListener('click', () => removeTask(task.id));

    li.append(checkbox, text, remove);
    return li;
}

function addTask(text) {
    data.tasks.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        done: false,
        createdAt: Date.now(),
    });
    saveData();
    renderTasks();
}

function toggleTask(id, done) {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = done;
    const stats = todayStats();
    if (done) {
        task.doneAt = Date.now();
        stats.tasks += 1;
        data.stats.tasksDone += 1;
    } else {
        task.doneAt = null;
        stats.tasks = Math.max(0, stats.tasks - 1);
        data.stats.tasksDone = Math.max(0, data.stats.tasksDone - 1);
    }
    saveData();
    renderTasks();
    renderProgress();
}

function removeTask(id) {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.done) {
        todayStats().tasks = Math.max(0, todayStats().tasks - 1);
        data.stats.tasksDone = Math.max(0, data.stats.tasksDone - 1);
    }
    data.tasks = data.tasks.filter((t) => t.id !== id);
    saveData();
    renderTasks();
    renderProgress();
}

function initTasks() {
    $('task-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = $('task-input');
        const text = input.value.trim();
        if (!text) return;
        addTask(text);
        input.value = '';
        input.focus();
    });

    document.querySelectorAll('.chip[data-filter]').forEach((chip) => {
        chip.addEventListener('click', () => {
            taskFilter = chip.dataset.filter;
            document.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('is-active', c === chip));
            renderTasks();
        });
    });

    renderTasks();
}

/* ----------------------------- PROGRESSO ---------------------------- */

function computeStreak() {
    const history = data.stats.history;
    let streak = 0;
    const cursor = new Date();
    if (!history[todayKey(cursor)] || history[todayKey(cursor)].minutes === 0) {
        cursor.setDate(cursor.getDate() - 1);
    }
    while (history[todayKey(cursor)] && history[todayKey(cursor)].minutes > 0) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function renderProgress() {
    const stats = todayStats();
    $('stat-minutes').textContent = stats.minutes;
    $('stat-sessions').textContent = stats.sessions;
    $('stat-tasks').textContent = stats.tasks;
    $('stat-streak').textContent = computeStreak();

    const goal = data.settings.goal || 1;
    const pct = Math.min(100, Math.round((stats.minutes / goal) * 100));
    $('goal-progress-bar').style.width = `${pct}%`;
    $('goal-label').textContent = `${pct}%`;
    $('goal-value').textContent = data.settings.goal;

    renderChart();
}

function renderChart() {
    const chart = $('chart');
    chart.textContent = '';

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push({
            date,
            minutes: (data.stats.history[todayKey(date)] || {}).minutes || 0,
        });
    }

    const max = Math.max(data.settings.goal, ...days.map((d) => d.minutes), 1);

    days.forEach((day) => {
        const col = document.createElement('div');
        col.className = 'chart-col';

        const value = document.createElement('span');
        value.className = 'chart-value';
        value.textContent = day.minutes;

        const bar = document.createElement('div');
        bar.className = 'chart-bar' + (day.minutes > 0 ? ' is-active' : '');
        bar.style.height = `${Math.max(3, (day.minutes / max) * 100)}%`;

        const label = document.createElement('span');
        label.className = 'chart-day';
        label.textContent = dayLabel(day.date);

        col.append(value, bar, label);
        chart.appendChild(col);
    });
}

/* --------------------------- EXPORTAR/IMPORTAR ---------------------- */

function initDataTransfer() {
    $('btn-export').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `estudo-${todayKey()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast('Dados exportados.');
    });

    $('import-file').addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            if (!parsed || typeof parsed !== 'object') throw new Error('formato inválido');
            data = {
                settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) },
                tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
                stats: { ...DEFAULT_DATA.stats, ...(parsed.stats || {}), history: (parsed.stats && parsed.stats.history) || {} },
            };
            saveData();
            renderTasks();
            renderProgress();
            syncSettingsInputs();
            toast('Dados importados com sucesso.');
        } catch (err) {
            toast('Não foi possível importar o arquivo.');
        } finally {
            event.target.value = '';
        }
    });

    $('btn-reset-all').addEventListener('click', () => {
        if (!confirm('Apagar todas as tarefas e o histórico de progresso?')) return;
        localStorage.removeItem(STORAGE_KEY);
        data = loadData();
        timer.remaining = phaseDuration();
        syncSettingsInputs();
        renderTasks();
        renderProgress();
        renderTimer();
        toast('Tudo apagado. Começo do zero!');
    });
}

function syncSettingsInputs() {
    $('set-focus').value = data.settings.focus;
    $('set-short').value = data.settings.short;
    $('set-long').value = data.settings.long;
    $('set-goal').value = data.settings.goal;
    $('set-auto').checked = data.settings.autoStart;
    $('set-sound').checked = data.settings.sound;
    $('set-notify').checked = data.settings.notify;
}

/* ------------------------------- PWA -------------------------------- */

function initPwa() {
    const installBtn = $('install-btn');
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        installBtn.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.hidden = true;
    });

    window.addEventListener('appinstalled', () => {
        installBtn.hidden = true;
        toast('App instalado! Agora você estuda direto da tela inicial. 🎉');
    });

    const badge = $('offline-badge');
    const updateBadge = () => {
        badge.hidden = navigator.onLine;
    };
    window.addEventListener('online', updateBadge);
    window.addEventListener('offline', updateBadge);
    updateBadge();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then((registration) => {
                registration.addEventListener('updatefound', () => {
                    const worker = registration.installing;
                    if (!worker) return;
                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            toast('Nova versão disponível — recarregue a página.', 6000);
                        }
                    });
                });
            }).catch((err) => console.warn('Service worker não registrado.', err));
        });
    }
}

/* ------------------------------ INÍCIO ------------------------------ */

let initialized = false;

function init() {
    if (initialized) return;
    initialized = true;

    applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
    $('theme-btn').addEventListener('click', cycleTheme);
    $('year').textContent = new Date().getFullYear();

    initTabs();
    initTimer();
    initSettings();
    initTasks();
    initDataTransfer();
    initPwa();
    renderProgress();
}

document.addEventListener('DOMContentLoaded', init);
