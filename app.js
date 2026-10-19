const STORE_KEY = "estuda-data-v1";
const USERS_KEY = "estuda-users-v1";
const SESSION_KEY = "estuda-session-v1";
const DEFAULT_LOGIN = "andrey.martins";
const DEFAULT_PASSWORD = "250208Aa";
const DEFAULT_LOGIN_MIGRATION_KEY = "estuda-default-login-andrey-v1";
const PIX_KEY = "57e609f5-2202-4321-a904-c927c5cc37d7";
const subjectColors = ["#72b497", "#e5a27f", "#8b9ed2", "#d5ae57", "#cf8290", "#70a9bb"];
const icons = ["✦", "◈", "⌘", "✿", "◇", "✧"];
const defaultData = { subjects: [], notes: [], gradingPeriods: [], totalMinutes: 0, settings: { focus: 25, break: 5, appearance: { theme: "bw", accent: "#202020", background: "#ffffff" } } };
let data = structuredClone(defaultData);
let currentUser = null;
let authMode = "login";
let currentView = "inicio";
let currentSubjectId = null;
let activeNoteId = null;
let selectedGradePeriodId = null;
let selectedColor = subjectColors[0];
let editingSubjectId = null;
let imageDb;
let timer = { mode: "focus", remaining: data.settings.focus * 60, running: false, interval: null, startedAt: null };
let audio = { context: null, source: null, gain: null, filter: null, name: null };

const root = document.getElementById("viewRoot");
const pageName = document.getElementById("pageName");
const modal = document.getElementById("subjectDialog");
const appearanceDialog = document.getElementById("appearanceDialog");
const passwordDialog = document.getElementById("passwordDialog");
const imagePicker = document.getElementById("imagePicker");
const viewTitles = { inicio: "Início", materias: "Minhas matérias", materia: "Matéria", notas: "Notas", pomodoro: "Pomodoro", imagens: "Imagens", sons: "Foco e sons", apoio: "Apoie o projeto" };

function dataKey(username) { return `${STORE_KEY}:${username}`; }
function loadData(username) {
  try {
    let saved = localStorage.getItem(dataKey(username));
    if (!saved && username === "daniel.brito") {
      saved = localStorage.getItem(STORE_KEY);
      if (saved) localStorage.setItem(dataKey(username), saved);
    }
    const parsed = saved ? JSON.parse(saved) : null;
    const restored = parsed ? { ...defaultData, ...parsed, settings: { ...defaultData.settings, ...parsed.settings, appearance: { ...defaultData.settings.appearance, ...parsed.settings?.appearance } } } : structuredClone(defaultData);
    const fallbackSubject = restored.subjects.find(subject => subject.id === localStorage.getItem(`estuda-last-subject:${username}`))?.id || restored.subjects[0]?.id;
    let repaired = false;
    if (fallbackSubject) restored.notes = restored.notes.map(note => { if (note.subjectId) return note; repaired = true; return { ...note, subjectId: fallbackSubject }; });
    if (repaired) localStorage.setItem(dataKey(username), JSON.stringify(restored));
    return restored;
  } catch { return structuredClone(defaultData); }
}
function persist() { if (currentUser) localStorage.setItem(dataKey(currentUser.username), JSON.stringify(data)); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeText(value = "") { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function dateLabel() { return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" }).format(new Date()).replace(".", ""); }
document.getElementById("todayLabel").textContent = dateLabel();

function applyAppearance() {
  const appearance = data.settings.appearance || defaultData.settings.appearance;
  document.documentElement.dataset.theme = appearance.theme;
  if (appearance.theme === "spfc") {
    document.documentElement.style.setProperty("--accent", "#d20a2e");
    document.documentElement.style.setProperty("--accent-soft", "#fde7eb");
    document.documentElement.style.setProperty("--workspace", "#ffffff");
  } else if (appearance.theme === "custom") {
    const accent = appearance.accent || "#202020";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 12%, white)`);
    document.documentElement.style.setProperty("--workspace", appearance.background || "#ffffff");
  } else {
    document.documentElement.style.setProperty("--accent", "#171717");
    document.documentElement.style.setProperty("--accent-soft", "#eeeeef");
    document.documentElement.style.setProperty("--workspace", "#ffffff");
  }
  document.getElementById("accentColor").value = appearance.accent || "#202020";
  document.getElementById("backgroundColor").value = appearance.background || "#ffffff";
  document.querySelectorAll("[data-theme-choice]").forEach(button => button.classList.toggle("selected", button.dataset.themeChoice === appearance.theme));
  document.getElementById("customColors").hidden = appearance.theme !== "custom";
}
applyAppearance();

function subjectById(id) { return data.subjects.find(subject => subject.id === id); }
function countNotes(subjectId) { return data.notes.filter(note => note.subjectId === subjectId).length; }
function navigate(view) {
  currentView = view;
  if (view === "materia" && currentUser && currentSubjectId) localStorage.setItem(`estuda-last-subject:${currentUser.username}`, currentSubjectId);
  pageName.textContent = view === "materia" ? (subjectById(currentSubjectId)?.name || "Matéria") : (viewTitles[view] || "Visão geral");
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view || (view === "materia" && button.dataset.view === "materias")));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) navigate(nav.dataset.view);
});

function heading(kicker, title, description, buttonText = "", action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${buttonText ? `<button class="button primary" data-action="${action}"><span class="plus">＋</span>${buttonText}</button>` : ""}</div>`;
}
function subjectCards(limit = Infinity) {
  const subjects = data.subjects.slice(0, limit);
  if (!subjects.length) return `<div class="empty-state"><div class="empty-illustration">▤</div><h3>Vamos criar sua primeira matéria?</h3><p>Assim, suas anotações, resumos e imagens ficam fáceis de encontrar.</p><button class="button mint" data-action="new-subject"><span class="plus">＋</span>Criar matéria</button></div>`;
  return `<div class="subjects-grid">${subjects.map((subject, index) => `<button class="subject-card" style="--subject-color:${subject.color}" data-subject="${subject.id}"><span class="subject-top"><span class="subject-symbol">${icons[index % icons.length]}</span><span class="subject-arrow">↗</span></span><strong>${escapeText(subject.name)}</strong><span class="subject-meta">${countNotes(subject.id)} ${countNotes(subject.id) === 1 ? "anotação" : "anotações"}</span></button>`).join("")}</div>`;
}
function renderHome() {
  const minutes = data.totalMinutes || 0;
  const latest = [...data.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  return `${heading("SEU ESPAÇO DE ESTUDO", "Vamos começar?", "Escolha uma matéria, organize suas ideias e siga no seu ritmo.")}
    <div class="hero-grid">
      <section class="welcome-card"><div class="welcome-copy"><div class="eyebrow">SEU ESPAÇO DE ESTUDO</div><h2>O que vamos estudar hoje?</h2><p>Abra uma matéria ou comece um tempo de foco.</p><button class="button primary" data-view="pomodoro">Começar Pomodoro <span>→</span></button></div><div class="welcome-art" aria-hidden="true"><div class="sun"></div><div class="hill"></div><div class="hill back"></div><div class="book"></div></div></section>
      <section class="focus-card"><div class="focus-card-top"><span>PRÓXIMO TEMPO DE FOCO</span><span class="focus-icon">◷</span></div><div><h3>Hora de focar</h3><p>Uma sessão curtinha já ajuda a começar.</p></div><div class="focus-bottom"><span class="focus-time">${String(data.settings.focus).padStart(2, "0")}<small style="font:500 11px 'DM Sans';letter-spacing:0"> min</small></span><button class="focus-start" data-action="start-timer" aria-label="Iniciar cronômetro">▶</button></div></section>
    </div>
    <div class="stats-grid"><div class="stat-card"><span class="stat-icon mint">▤</span><span class="stat-copy"><strong>${data.subjects.length}</strong><span>matérias criadas</span></span></div><div class="stat-card"><span class="stat-icon peach">✎</span><span class="stat-copy"><strong>${data.notes.length}</strong><span>anotações guardadas</span></span></div><div class="stat-card"><span class="stat-icon lilac">◷</span><span class="stat-copy"><strong>${minutes} min</strong><span>tempo registrado</span></span></div></div>
    <div class="section-head"><h2>Suas matérias</h2><button class="text-button" data-view="materias">Ver todas →</button></div>${subjectCards(3)}
    <div style="height:25px"></div><div class="two-column"><section class="panel"><h3>Continue de onde parou</h3><p class="panel-subtitle">Suas anotações mais recentes</p>${latest.length ? latest.map(note => { const subject = subjectById(note.subjectId); return `<button class="activity-row" data-note="${note.id}" style="width:100%;border-left:0;border-right:0;border-bottom:0;text-align:left;background:none"><span class="activity-dot" style="background:${subject?.color || "#e5b875"}"></span><span><strong>${escapeText(note.title || "Anotação sem título")}</strong><span>${escapeText(subject?.name || "Sem matéria")} · ${new Date(note.updatedAt).toLocaleDateString("pt-BR")}</span></span></button>`; }).join("") : `<div class="summary-placeholder">Suas anotações aparecem aqui assim que você criar uma.</div>`}</section><section class="panel"><h3>Tudo no seu lugar</h3><p class="panel-subtitle">Um espaço para cada matéria</p><div class="subject-list">${data.subjects.length ? data.subjects.slice(0, 4).map(subject => `<div class="subject-list-row"><span class="subject-dot" style="--subject-color:${subject.color}"></span><strong>${escapeText(subject.name)}</strong></div>`).join("") : `<span class="summary-placeholder">Crie matérias para organizar cada assunto.</span>`}</div></section></div>`;
}

function renderSubjects() {
  return `${heading("TUDO POR ASSUNTO", "Minhas matérias", "Cada matéria tem seu próprio espaço para anotações e resumos.", "Nova matéria", "new-subject")}${subjectCards()}`;
}

function newNote(subjectId = data.subjects[0]?.id || "") {
  if (!subjectById(subjectId)) { navigate("materias"); return; }
  const note = { id: uid(), subjectId, title: "Nova anotação", body: "", summary: "", createdAt: Date.now(), updatedAt: Date.now(), minutes: 0 };
  data.notes.unshift(note); activeNoteId = note.id; currentSubjectId = subjectId; persist(); navigate("materia");
}
function renderNotes(subjectId) {
  const subject = subjectById(subjectId);
  if (!subject) return renderSubjects();
  const subjectNotes = data.notes.filter(note => note.subjectId === subjectId);
  if (!subjectNotes.some(note => note.id === activeNoteId)) activeNoteId = subjectNotes[0]?.id || null;
  const note = data.notes.find(item => item.id === activeNoteId);
  const filteredNotes = [...subjectNotes].sort((a, b) => b.updatedAt - a.updatedAt);
  return `${heading("SEU CADERNO", escapeText(subject.name), "Anotações e resumos reunidos aqui.", "Nova anotação", "new-note")}
    <div class="subject-detail-tools"><span>${filteredNotes.length} ${filteredNotes.length === 1 ? "anotação" : "anotações"} nesta matéria</span><div class="subject-detail-actions"><button class="text-button" data-action="edit-subject">Editar matéria</button><button class="danger-button" data-action="delete-subject">Excluir matéria</button></div></div>
    <div class="note-layout"><aside class="note-list"><div class="note-list-head"><span>NESTA MATÉRIA</span><span>${filteredNotes.length}</span></div><label class="note-search-wrap"><span aria-hidden="true">⌕</span><input id="noteSearch" type="search" placeholder="Buscar por nome" aria-label="Buscar anotação pelo nome"></label><div class="note-list-items">${filteredNotes.length ? filteredNotes.map(item => `<button class="note-item ${item.id === activeNoteId ? "active" : ""}" data-note="${item.id}" data-note-title="${escapeText(item.title || "Anotação sem título")}"><strong>${escapeText(item.title || "Anotação sem título")}</strong><span>${new Date(item.updatedAt).toLocaleDateString("pt-BR")}</span></button>`).join("") : `<div class="summary-placeholder" style="padding:12px">Ainda não há anotações nesta matéria.</div>`}<div class="note-search-empty" id="noteSearchEmpty" hidden>Nenhuma anotação encontrada com esse nome.</div></div></aside>
    <article class="note-editor">${note ? `<div class="editor-top"><input class="editor-title" id="noteTitle" value="${escapeText(note.title)}" placeholder="Nome da anotação" aria-label="Nome da anotação"><span class="note-subject-label">${escapeText(subject.name)}</span><div class="editor-tools"><button class="icon-button" title="Resumir com Lume" data-action="summarize">✦</button></div></div><textarea class="editor-body" id="noteBody" placeholder="Anote aqui o que você está aprendendo em ${escapeText(subject.name)}...">${escapeText(note.body)}</textarea><div class="note-editor-footer"><div class="save-state" id="saveState">Salvo neste dispositivo</div><button class="danger-button" data-action="delete-note">Excluir anotação</button></div><section class="summary-box"><div class="summary-head"><strong><span class="summary-star">✦</span> Resumo com Lume <span class="summary-badge">LOCAL</span></strong><button class="text-button" data-action="summarize">Resumir com Lume</button></div><div class="summary-content" id="summaryContent">${note.summary ? escapeText(note.summary) : `<span class="summary-placeholder">Escreva suas anotações e clique em “Resumir com Lume”. O texto é processado neste navegador.</span>`}</div></section>` : `<div class="empty-state subject-empty"><div class="empty-illustration">✎</div><h3>Comece o caderno de ${escapeText(subject.name)}</h3><p>Suas anotações e resumos vão ficar organizados aqui.</p><button class="button primary" data-action="new-note">Criar primeira anotação</button></div>`}</article></div>`;
}

function summarizeText(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Escreva suas anotações antes de gerar um resumo.";
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(s => s.length > 20) || [];
  if (!sentences.length) return clean.length > 280 ? clean.slice(0, 277) + "…" : clean;
  const stop = new Set("a ao aos aquela aquelas aquele aqueles aquilo as até com como da das de dela delas dele deles depois do dos e ela elas ele eles em entre era essa essas esse esses esta estas este estes eu foi foram há isso isto já mais mas me mesmo meu minha muito na nas nem no nos nós nossa nossas nosso nossos num numa o os ou para pela pelas pelo pelos por porque qual quando que quem se sem ser seu sua suas também te tem tendo ter teu teus tu um uma umas uns você vocês é são".split(" "));
  const words = clean.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  const frequency = new Map();
  words.forEach(word => { if (!stop.has(word)) frequency.set(word, (frequency.get(word) || 0) + 1); });
  const scored = sentences.map((sentence, index) => {
    const tokens = sentence.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
    const score = tokens.reduce((sum, word) => sum + (stop.has(word) ? 0 : frequency.get(word) || 0), 0) / Math.max(1, Math.sqrt(tokens.length));
    return { sentence, index, score: score + (index === 0 ? 0.25 : 0) };
  });
  const count = Math.min(5, Math.max(1, Math.ceil(sentences.length * 0.35)));
  return scored.sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.index - b.index).map(item => "• " + item.sentence).join("\n");
}

function periodAverage(period, subjectId) {
  const entries = (period?.grades || []).filter(item => item.subjectId === subjectId && Number(item.maxScore) > 0);
  return entries.length ? entries.reduce((sum, item) => sum + Number(item.score) / Number(item.maxScore) * 10, 0) / entries.length : null;
}
function gradeStatus(value) {
  if (value === null) return ["Sem notas", "grade-neutral"];
  if (value >= 7) return ["Está bem", "grade-good"];
  if (value >= 5) return ["Precisa melhorar", "grade-warn"];
  return ["Precisa de atenção", "grade-low"];
}
function renderGrades() {
  const periods = data.gradingPeriods || [];
  const active = periods.find(item => !item.closedAt);
  const period = periods.find(item => item.id === selectedGradePeriodId) || active || periods.at(-1);
  if (period) selectedGradePeriodId = period.id;
  const createPeriod = !active ? '<section class="panel grade-start-panel" id="gradeStartPanel"><div><h3>Comece um novo período</h3><p class="panel-subtitle">Escolha o bimestre ou semestre que quer acompanhar.</p></div><div class="grade-start-controls"><select class="grade-input" id="newPeriodType"><option value="bimestre">Bimestre</option><option value="semestre">Semestre</option></select><input class="grade-input" id="newPeriodName" maxlength="50" placeholder="Ex.: 1º Bimestre 2026"><button class="button primary" data-action="start-grade-period">Começar período</button></div></section>' : "";
  if (!data.subjects.length) return heading("SEU PROGRESSO", "Notas", "Crie suas matérias para começar a registrar as avaliações.") + '<div class="empty-state"><h3>Primeiro, organize suas matérias</h3><p>Depois é só adicionar as notas e acompanhar como você está indo.</p><button class="button primary" data-action="new-subject">Criar matéria</button></div>';
  if (!period) return heading("SEU PROGRESSO", "Notas", "Comece um período, registre as notas e acompanhe seus resultados.") + '<section class="panel grade-start-panel" id="gradeStartPanel"><div><h3>Comece um novo período</h3><p class="panel-subtitle">Escolha se você quer acompanhar um bimestre ou semestre.</p></div><div class="grade-start-controls"><select class="grade-input" id="newPeriodType"><option value="bimestre">Bimestre</option><option value="semestre">Semestre</option></select><input class="grade-input" id="newPeriodName" maxlength="50" placeholder="Ex.: 1º Bimestre 2026"><button class="button primary" data-action="start-grade-period">Começar período</button></div></section>';
  const grades = period.grades || [];
  const summary = data.subjects.map(subject => ({ subject, average: periodAverage(period, subject.id), count: grades.filter(item => item.subjectId === subject.id).length })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const averages = summary.map(item => item.average).filter(value => value !== null);
  const overall = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null;
  const cards = summary.map(({ subject, average, count }) => { const status = gradeStatus(average); const score = average === null ? "—" : average.toFixed(1).replace(".", ","); return `<article class="grade-summary-card"><div class="grade-summary-top"><span class="subject-dot" style="--subject-color:${subject.color}"></span><strong>${escapeText(subject.name)}</strong><span class="${status[1]}">${status[0]}</span></div><div class="grade-summary-bottom"><strong>${score}</strong><span>média de 0 a 10 · ${count} avaliações</span></div><div class="grade-meter"><i class="${status[1]}" style="width:${average === null ? 0 : Math.min(100, average * 10)}%"></i></div></article>`; }).join("");
  const options = periods.slice().reverse().map(item => `<option value="${item.id}" ${item.id === period.id ? "selected" : ""}>${escapeText(item.name)}${item.closedAt ? " · encerrado" : " · em andamento"}</option>`).join("");
  const controls = `<div class="grade-period-controls"><label class="grade-select-label">Período<select class="grade-input" id="gradePeriodSelect">${options}</select></label>${period.closedAt ? '<button class="danger-button" data-action="delete-grade-period">Excluir período</button>' : active?.id === period.id ? '<button class="danger-button" data-action="close-grade-period">Encerrar período</button>' : ""}</div>`;
  const rows = grades.slice().reverse().map(item => { const subject = subjectById(item.subjectId); if (!subject) return ""; return `<div class="grade-row"><span>${escapeText(subject.name)}</span><strong>${escapeText(item.title)}</strong><b>${item.score} / ${item.maxScore}</b><button class="grade-delete" data-delete-grade="${item.id}" aria-label="Excluir nota">×</button></div>`; }).join("");
  const form = !period.closedAt ? `<form class="panel grade-entry-form" id="gradeEntryForm"><h3>Adicionar uma nota</h3><label class="grade-field"><span>Matéria</span><select class="grade-input" name="subjectId">${data.subjects.map(subject => `<option value="${subject.id}">${escapeText(subject.name)}</option>`).join("")}</select></label><label class="grade-field"><span>Nome da avaliação</span><input class="grade-input" name="title" placeholder="Ex.: Prova de biologia" maxlength="60" required></label><label class="grade-field"><span>Nota</span><input class="grade-input" name="score" type="number" min="0" step="any" required></label><label class="grade-field"><span>Nota máxima</span><input class="grade-input" name="maxScore" type="number" min="0.01" step="any" value="10" required></label><button type="button" class="button primary" data-action="save-grade">Salvar nota</button></form>` : '<div class="panel grade-locked-note">Este período foi encerrado. Você ainda pode consultar as notas.</div>';
  const comparison = overall === null ? "Adicione uma avaliação para ver a média de cada matéria." : "Média geral: " + overall.toFixed(1).replace(".", ",") + " / 10";
  return heading("SEU PROGRESSO", "Notas", "Adicione suas notas e acompanhe seu desempenho em cada matéria.", active ? "Adicionar nota" : "", active ? "focus-grade-form" : "") + createPeriod + '<section class="grade-period-heading"><div><div class="eyebrow">PERÍODO ATUAL</div><h2>' + escapeText(period.name) + '</h2><p>' + (period.closedAt ? "Encerrado" : "Em andamento") + '</p></div>' + controls + '</section><section class="grade-legend"><span>7 ou mais: está indo bem</span><span>De 5 a 6,9: vale revisar</span><span>Abaixo de 5: precisa de atenção</span><strong>' + comparison + '</strong></section>' + form + '<section class="grade-summary-grid">' + cards + '</section>' + '<section class="panel grade-history"><h3>Notas registradas (' + grades.length + ')</h3>' + (rows || '<p>Suas notas vão aparecer aqui.</p>') + '</section>';
}

function renderPomodoro() {
  const total = (timer.mode === "focus" ? data.settings.focus : data.settings.break) * 60;
  const progress = Math.max(0, Math.min(100, timer.remaining / total * 100));
  const mins = Math.floor(timer.remaining / 60).toString().padStart(2, "0");
  const secs = (timer.remaining % 60).toString().padStart(2, "0");
  return `${heading("NO SEU RITMO", "Pomodoro", "Concentre-se por um tempo e faça pausas para recarregar.")}
    <div class="timer-layout"><section class="timer-card"><div class="mode-switch"><button class="mode-button ${timer.mode === "focus" ? "active" : ""}" data-mode="focus">Foco</button><button class="mode-button ${timer.mode === "break" ? "active" : ""}" data-mode="break">Pausa</button></div><div class="timer-ring" style="--progress:${progress}%"><div class="timer-center"><span class="timer-digits" id="timerDigits">${mins}:${secs}</span><span class="timer-caption">${timer.mode === "focus" ? "hora de se concentrar" : "respire um pouco"}</span></div></div><div class="timer-actions"><button class="button primary" data-action="toggle-timer">${timer.running ? "Pausar" : "Começar foco"}</button><button class="button secondary" data-action="reset-timer">Reiniciar</button></div></section>
    <section class="panel timer-settings"><div><h3>Ajuste seu tempo</h3><p class="panel-subtitle">Escolha uma duração que funcione para você.</p></div><label class="setting-row"><span>Minutos de foco</span><input type="number" min="1" max="90" id="focusSetting" value="${data.settings.focus}"></label><label class="setting-row"><span>Minutos de pausa</span><input type="number" min="1" max="30" id="breakSetting" value="${data.settings.break}"></label><p class="summary-placeholder">Uma dica: escolha uma tarefa para esta sessão e deixe o celular por perto.</p><button class="button secondary" data-view="sons">♫ Ver sons para focar</button></section></div>`;
}

function openImageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("estuda-images-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images", { keyPath: "id" });
    request.onsuccess = () => { imageDb = request.result; resolve(imageDb); };
    request.onerror = () => reject(request.error);
  });
}
async function getImages() {
  const db = imageDb || await openImageDb();
  return new Promise((resolve, reject) => { const request = db.transaction("images").objectStore("images").getAll(); request.onsuccess = () => resolve(request.result.filter(item => (item.owner || "daniel.brito") === currentUser.username)); request.onerror = () => reject(request.error); });
}
function saveImage(record) {
  return new Promise((resolve, reject) => { const request = imageDb.transaction("images", "readwrite").objectStore("images").put(record); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
}
function deleteImage(id) {
  return new Promise((resolve, reject) => { const request = imageDb.transaction("images", "readwrite").objectStore("images").delete(id); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
}
async function removeSubjectImages(subjectId) {
  const images = await getImages();
  await Promise.all(images.filter(image => image.subjectId === subjectId).map(image => deleteImage(image.id)));
}
async function renderImages() {
  const images = await getImages();
  const subjectFilter = `<option value="all">Todas as matérias</option>` + data.subjects.map(subject => `<option value="${subject.id}">${escapeText(subject.name)}</option>`).join("");
  const body = heading("MATERIAL DE APOIO", "Imagens", "Guarde fotos da lousa, diagramas e páginas importantes.", "Adicionar imagens", "add-images") + `<div class="library-toolbar"><select class="select-filter" id="imageSubjectFilter">${subjectFilter}</select><span class="summary-placeholder">Suas imagens ficam salvas neste navegador.</span></div><div class="image-grid" id="imageGrid">${images.length ? images.map(item => `<article class="image-card" data-image-subject="${item.subjectId || ""}"><img src="${URL.createObjectURL(item.blob)}" alt="${escapeText(item.name)}"><div class="image-info"><strong title="${escapeText(item.name)}">${escapeText(item.name)}</strong><button data-delete-image="${item.id}" aria-label="Apagar imagem">×</button></div></article>`).join("") : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-illustration">▧</div><h3>Monte sua biblioteca visual</h3><p>Adicione imagens para deixar seus materiais de referência à mão.</p><button class="button mint" data-action="add-images">Escolher imagens</button></div>`}</div>`;
  root.innerHTML = body;
}

function renderSounds() {
  const sounds = [
    { id: "rain", icon: "☂", name: "Chuva tranquila", detail: "Pingos suaves" },
    { id: "brown", icon: "〰", name: "Ruído marrom", detail: "Grave e constante" },
    { id: "white", icon: "≋", name: "Ruído branco", detail: "Som uniforme" },
    { id: "ocean", icon: "≈", name: "Ondas do mar", detail: "Maré calma" }
  ];
  return `${heading("UM CLIMA PARA FOCAR", "Foco e sons", "Sons de fundo para acompanhar seus estudos, direto no navegador.")}
    <div class="panel" style="margin-bottom:16px"><h3>Encontre um som que combine com seu momento.</h3><p class="panel-subtitle" style="margin-bottom:0">Escolha um som para começar. Toque de novo para parar. O áudio começa após o primeiro toque.</p></div><div class="sound-grid">${sounds.map(sound => `<button class="sound-card ${audio.name === sound.id ? "playing" : ""}" data-sound="${sound.id}"><span class="sound-emoji">${sound.icon}</span><strong>${sound.name}</strong><small>${audio.name === sound.id ? "Tocando · toque para parar" : sound.detail}</small></button>`).join("")}</div>`;
}

function renderSupport() {
  return `${heading("UMA AJUDA OPCIONAL", "Apoie o Estuda", "Se este espaço está ajudando nos seus estudos, você pode contribuir com qualquer valor.")}
    <section class="panel support-card"><div class="support-heart" aria-hidden="true">♡</div><h2>Seu apoio faz diferença</h2><p>O Estuda continua gratuito para todos. Se quiser ajudar a manter o projeto, você pode contribuir com qualquer valor. É totalmente opcional.</p><label for="pixCode" class="support-pix-label">Chave Pix</label><textarea id="pixCode" class="support-pix-code" readonly>${PIX_KEY}</textarea><button class="button primary" data-action="copy-pix">Copiar chave Pix</button><div class="support-copy-feedback" id="pixCopyFeedback" role="status" aria-live="polite"></div><small class="support-pix-hint">Antes de confirmar o pagamento no banco, confira os dados do recebedor.</small></section>`;
}

function render() {
  if (currentView === "inicio") root.innerHTML = renderHome();
  else if (currentView === "materias") root.innerHTML = renderSubjects();
  else if (currentView === "materia") root.innerHTML = renderNotes(currentSubjectId);
  else if (currentView === "notas") {
    root.innerHTML = renderGrades();
    root.querySelectorAll('[data-action="close-grade-period"]').forEach((button, index) => {
      if (index > 0) button.remove();
    });
  }
  else if (currentView === "pomodoro") root.innerHTML = renderPomodoro();
  else if (currentView === "imagens") void renderImages();
  else if (currentView === "sons") root.innerHTML = renderSounds();
  else if (currentView === "apoio") root.innerHTML = renderSupport();
}

function openSubjectDialog(subject = null) {
  editingSubjectId = subject?.id || null;
  selectedColor = subject?.color || subjectColors[0];
  document.getElementById("subjectModalTitle").textContent = subject ? "Editar matéria" : "Criar matéria";
  document.getElementById("subjectName").value = subject?.name || "";
  document.getElementById("colorOptions").innerHTML = subjectColors.map(color => `<button type="button" class="color-choice ${selectedColor === color ? "selected" : ""}" style="background:${color}" data-color="${color}" aria-label="Escolher cor"></button>`).join("");
  modal.showModal();
  setTimeout(() => document.getElementById("subjectName").focus(), 50);
}
document.getElementById("colorOptions").addEventListener("click", event => {
  const choice = event.target.closest("[data-color]");
  if (!choice) return;
  selectedColor = choice.dataset.color;
  document.querySelectorAll(".color-choice").forEach(button => button.classList.toggle("selected", button === choice));
});
document.querySelectorAll("[data-close-modal]").forEach(button => {
  button.addEventListener("click", () => modal.close());
});
document.getElementById("openAppearance").addEventListener("click", () => appearanceDialog.showModal());
document.querySelectorAll("[data-close-appearance]").forEach(button => {
  button.addEventListener("click", () => appearanceDialog.close());
});
document.querySelectorAll("[data-theme-choice]").forEach(button => {
  button.addEventListener("click", () => {
    data.settings.appearance.theme = button.dataset.themeChoice;
    persist();
    applyAppearance();
  });
});
document.getElementById("accentColor").addEventListener("input", event => {
  data.settings.appearance.theme = "custom";
  data.settings.appearance.accent = event.target.value;
  persist();
  applyAppearance();
});
document.getElementById("backgroundColor").addEventListener("change", event => {
  data.settings.appearance.theme = "custom";
  data.settings.appearance.background = event.target.value;
  persist();
  applyAppearance();
});
document.getElementById("subjectForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.getElementById("subjectName").value.trim();
  if (!name) return;
  const existing = data.subjects.find(subject => subject.id === editingSubjectId);
  if (existing) { existing.name = name; existing.color = selectedColor; }
  else data.subjects.push({ id: uid(), name, color: selectedColor, createdAt: Date.now() });
  persist(); modal.close(); render();
});

let saveTimeout;
function searchKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}
function applyNoteSearch() {
  const field = document.getElementById("noteSearch");
  if (!field) return;
  const query = searchKey(field.value);
  const items = [...root.querySelectorAll(".note-item")];
  let visibleCount = 0;
  items.forEach(item => {
    const matches = searchKey(item.dataset.noteTitle).includes(query);
    item.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  const empty = document.getElementById("noteSearchEmpty");
  if (empty) empty.hidden = visibleCount > 0 || !query;
}
function scheduleNoteSave() {
  const note = data.notes.find(item => item.id === activeNoteId);
  if (!note) return;
  note.title = document.getElementById("noteTitle")?.value || "";
  note.body = document.getElementById("noteBody")?.value || "";
  const subjectPicker = document.getElementById("noteSubject");
  if (subjectPicker) note.subjectId = subjectPicker.value || note.subjectId;
  note.updatedAt = Date.now();
  const state = document.getElementById("saveState");
  if (state) state.textContent = "Salvando…";
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => { if (state) state.textContent = "Salvando…"; persist(); }, 350);
}
root.addEventListener("input", event => {
  if (event.target.id === "noteSearch") { applyNoteSearch(); return; }
  if (["noteTitle", "noteBody"].includes(event.target.id)) scheduleNoteSave();
  if (event.target.id === "noteTitle") {
    const item = [...root.querySelectorAll(".note-item")].find(button => button.dataset.note === activeNoteId);
    if (item) {
      const title = event.target.value.trim() || "Anotação sem título";
      item.dataset.noteTitle = title;
      item.querySelector("strong").textContent = title;
      applyNoteSearch();
    }
  }
});
root.addEventListener("change", event => {
  if (event.target.id === "noteSubject") scheduleNoteSave();
  if (event.target.id === "focusSetting" || event.target.id === "breakSetting") {
    const focus = Math.max(1, Math.min(90, Number(document.getElementById("focusSetting").value) || 25));
    const pause = Math.max(1, Math.min(30, Number(document.getElementById("breakSetting").value) || 5));
    data.settings = { focus, break: pause }; persist();
    if (!timer.running) timer.remaining = (timer.mode === "focus" ? focus : pause) * 60;
    render();
  }
  if (event.target.id === "imageSubjectFilter") {
    document.querySelectorAll(".image-card").forEach(card => card.hidden = event.target.value !== "all" && card.dataset.imageSubject !== event.target.value);
  }
  if (event.target.id === "gradePeriodSelect") { selectedGradePeriodId = event.target.value; render(); }
});

root.addEventListener("submit", event => {
  if (event.target.id !== "gradeEntryForm") return;
  event.preventDefault();
  const period = (data.gradingPeriods || []).find(item => item.id === selectedGradePeriodId && !item.closedAt);
  if (!period) return;
  const form = new FormData(event.target);
  const score = Number(form.get("score"));
  const maxScore = Number(form.get("maxScore"));
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score > maxScore) {
    alert("Confira a nota e o valor máximo. A nota não pode ser maior que o valor máximo.");
    return;
  }
  period.grades.push({ id: uid(), subjectId: String(form.get("subjectId")), title: String(form.get("title")).trim(), score, maxScore, createdAt: Date.now() });
  persist(); render();
});

root.addEventListener("click", async event => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  const view = event.target.closest("[data-view]")?.dataset.view;
  const noteButton = event.target.closest("[data-note]");
  const subjectButton = event.target.closest("[data-subject]");
  const soundButton = event.target.closest("[data-sound]");
  const deleteImageButton = event.target.closest("[data-delete-image]");
  const deleteGradeButton = event.target.closest("[data-delete-grade]");

  if (view) { navigate(view); return; }
  if (noteButton) {
    const note = data.notes.find(item => item.id === noteButton.dataset.note);
    if (note?.subjectId && subjectById(note.subjectId)) { activeNoteId = note.id; currentSubjectId = note.subjectId; navigate("materia"); }
    else navigate("materias");
    return;
  }
  if (subjectButton) { const subject = subjectById(subjectButton.dataset.subject); if (subject) { currentSubjectId = subject.id; activeNoteId = null; navigate("materia"); } return; }
  if (soundButton) { await toggleSound(soundButton.dataset.sound); renderSoundsIntoRoot(); return; }
  if (deleteImageButton) { if (confirm("Apagar esta imagem salva neste dispositivo?")) { await deleteImage(deleteImageButton.dataset.deleteImage); await renderImages(); } return; }
  if (deleteGradeButton) {
    const period = (data.gradingPeriods || []).find(item => item.id === selectedGradePeriodId && !item.closedAt);
    if (period && confirm("Excluir esta nota?")) { period.grades = period.grades.filter(item => item.id !== deleteGradeButton.dataset.deleteGrade); persist(); render(); }
    return;
  }

  if (action === "new-subject") openSubjectDialog();
  else if (action === "focus-grade-form") {
    const activePeriod = (data.gradingPeriods || []).find(item => !item.closedAt);
    if (!activePeriod) { alert("Inicie um bimestre ou semestre antes de adicionar notas."); return; }
    selectedGradePeriodId = activePeriod.id;
    render();
    document.getElementById("gradeEntryForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelector('#gradeEntryForm input[name="title"]')?.focus({ preventScroll: true });
  }
  else if (action === "save-grade") {
    const gradeForm = document.getElementById("gradeEntryForm");
    const period = (data.gradingPeriods || []).find(item => item.id === selectedGradePeriodId && !item.closedAt);
    if (!gradeForm || !period) { alert("Inicie ou selecione um período em andamento antes de adicionar notas."); return; }
    const form = new FormData(gradeForm);
    const title = String(form.get("title") || "").trim();
    const score = Number(form.get("score"));
    const maxScore = Number(form.get("maxScore"));
    if (!title || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) {
      alert("Preencha o nome e confira a nota e o valor máximo. A nota precisa estar entre zero e o valor máximo.");
      return;
    }
    period.grades ||= [];
    period.grades.push({ id: uid(), subjectId: String(form.get("subjectId")), title, score, maxScore, createdAt: Date.now() });
    persist(); render();
  }
  else if (action === "start-grade-period") {
    const type = document.getElementById("newPeriodType")?.value || "bimestre";
    const nameInput = document.getElementById("newPeriodName");
    const name = nameInput?.value.trim() || (type === "bimestre" ? "Bimestre " : "Semestre ") + new Date().getFullYear();
    data.gradingPeriods ||= [];
    const period = { id: uid(), type, name, createdAt: Date.now(), closedAt: null, grades: [] };
    data.gradingPeriods.push(period); selectedGradePeriodId = period.id; persist(); render();
  }
  else if (action === "delete-grade-period") {
    const period = (data.gradingPeriods || []).find(item => item.id === selectedGradePeriodId && item.closedAt);
    if (!period) return;
    const gradeCount = (period.grades || []).length;
    const warning = gradeCount === 0
      ? " Este período não contém notas."
      : gradeCount === 1
        ? " A nota deste período será apagada permanentemente."
        : " As " + gradeCount + " notas deste período serão apagadas permanentemente.";
    if (!confirm("Excluir o período “" + period.name + "”?" + warning + " Esta ação não pode ser desfeita.")) return;
    data.gradingPeriods = data.gradingPeriods.filter(item => item.id !== period.id);
    selectedGradePeriodId = data.gradingPeriods.find(item => !item.closedAt)?.id || data.gradingPeriods.at(-1)?.id || null;
    persist(); render();
  }
  else if (action === "close-grade-period") {
    const period = (data.gradingPeriods || []).find(item => item.id === selectedGradePeriodId && !item.closedAt);
    if (period && confirm("Encerrar “" + period.name + "”? As notas serão mantidas e não poderão mais ser alteradas.")) { period.closedAt = Date.now(); persist(); render(); }
  }
  else if (action === "new-note") newNote(currentSubjectId);
  else if (action === "edit-subject") { const subject = subjectById(currentSubjectId); if (subject) openSubjectDialog(subject); }
  else if (action === "delete-subject") {
    const subject = subjectById(currentSubjectId);
    if (!subject) return;
    const noteCount = data.notes.filter(note => note.subjectId === subject.id).length;
    const detail = noteCount ? `, ${noteCount} ${noteCount === 1 ? "anotação" : "anotações"} e as imagens ligadas a ela` : " e as imagens ligadas a ela";
    if (!confirm(`Excluir a matéria “${subject.name}”${detail}? Esta ação não pode ser desfeita.`)) return;
    try { await removeSubjectImages(subject.id); } catch (error) { console.warn("Não foi possível remover as imagens da matéria.", error); }
    data.subjects = data.subjects.filter(item => item.id !== subject.id);
    data.notes = data.notes.filter(note => note.subjectId !== subject.id);
    (data.gradingPeriods || []).forEach(period => { period.grades = (period.grades || []).filter(grade => grade.subjectId !== subject.id); });
    localStorage.removeItem(`estuda-last-subject:${currentUser.username}`);
    activeNoteId = null;
    currentSubjectId = null;
    persist();
    navigate("materias");
  }
  else if (action === "summarize") {
    const note = data.notes.find(item => item.id === activeNoteId);
    if (!note) return;
    note.title = document.getElementById("noteTitle")?.value || note.title;
    note.body = document.getElementById("noteBody")?.value || "";
    const subjectPicker = document.getElementById("noteSubject");
    if (subjectPicker) note.subjectId = subjectPicker.value || note.subjectId;
    note.summary = summarizeText(note.body); note.updatedAt = Date.now(); persist();
    document.getElementById("summaryContent").textContent = note.summary;
  } else if (action === "delete-note") {
    const note = data.notes.find(item => item.id === activeNoteId);
    if (note && confirm(`Excluir a anotação “${note.title || "Sem título"}”? Esta ação não pode ser desfeita.`)) {
      data.notes = data.notes.filter(item => item.id !== note.id);
      activeNoteId = data.notes.find(item => item.subjectId === currentSubjectId)?.id || null;
      persist(); render();
    }
  } else if (action === "add-images") imagePicker.click();
  else if (action === "copy-pix") {
    const feedback = document.getElementById("pixCopyFeedback");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(PIX_KEY);
      else {
        const helper = document.createElement("textarea"); helper.value = PIX_KEY; helper.setAttribute("readonly", "");
        helper.style.position = "fixed"; helper.style.opacity = "0"; document.body.appendChild(helper); helper.select();
        const copied = document.execCommand("copy"); helper.remove();
        if (!copied) throw new Error("copy failed");
      }
      feedback.textContent = "Chave Pix copiada. Cole no app do seu banco e confira o recebedor.";
    } catch {
      feedback.textContent = "Não consegui copiar automaticamente. Selecione e copie o código acima.";
    }
  }
  else if (action === "start-timer") { navigate("pomodoro"); toggleTimer(); }
  else if (action === "toggle-timer") toggleTimer();
  else if (action === "reset-timer") resetTimer();
});

imagePicker.addEventListener("change", async () => {
  if (!imagePicker.files?.length) return;
  const db = imageDb || await openImageDb();
  const subjectId = data.subjects[0]?.id || "";
  for (const file of imagePicker.files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > 12 * 1024 * 1024) { alert(`${file.name} é maior que 12 MB e não foi adicionada.`); continue; }
    await saveImage({ id: uid(), name: file.name, blob: file, subjectId, owner: currentUser.username, addedAt: Date.now() });
  }
  imagePicker.value = "";
  if (currentView === "imagens") await renderImages();
});

function setTimerMode(mode) {
  timer.mode = mode;
  timer.remaining = (mode === "focus" ? data.settings.focus : data.settings.break) * 60;
  if (timer.running) { timer.running = false; clearInterval(timer.interval); }
  render();
}
root.addEventListener("click", event => { const mode = event.target.closest("[data-mode]")?.dataset.mode; if (mode) setTimerMode(mode); });
function toggleTimer() {
  if (timer.running) { timer.running = false; clearInterval(timer.interval); render(); return; }
  timer.running = true; timer.startedAt = Date.now();
  timer.interval = setInterval(() => {
    timer.remaining -= 1;
    const digits = document.getElementById("timerDigits");
    if (digits) digits.textContent = `${String(Math.floor(timer.remaining / 60)).padStart(2, "0")}:${String(timer.remaining % 60).padStart(2, "0")}`;
    const total = (timer.mode === "focus" ? data.settings.focus : data.settings.break) * 60;
    document.querySelector(".timer-ring")?.style.setProperty("--progress", `${Math.max(0, timer.remaining / total * 100)}%`);
    if (timer.remaining <= 0) {
      clearInterval(timer.interval); timer.running = false;
      if (timer.mode === "focus") data.totalMinutes = (data.totalMinutes || 0) + data.settings.focus;
      timer.mode = timer.mode === "focus" ? "break" : "focus";
      timer.remaining = (timer.mode === "focus" ? data.settings.focus : data.settings.break) * 60;
      persist(); playChime(); render();
    }
  }, 1000);
  render();
}
function resetTimer() { timer.running = false; clearInterval(timer.interval); timer.remaining = (timer.mode === "focus" ? data.settings.focus : data.settings.break) * 60; render(); }
function playChime() { try { const context = audio.context || new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.65); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.7); } catch {} }

async function toggleSound(name) {
  if (audio.name === name) { stopSound(); return; }
  stopSound();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) { alert("Seu navegador não oferece suporte a áudio ambiente."); return; }
  const context = audio.context || new AudioCtx();
  await context.resume();
  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < channel.length; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    channel[i] = name === "brown" ? brown * 3.5 : white * 0.45;
    if (name === "rain") channel[i] *= Math.random() > 0.996 ? 3.5 : 0.48;
    if (name === "ocean") channel[i] *= 0.5 + 0.5 * Math.sin(i / context.sampleRate * 0.9);
  }
  const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
  const filter = context.createBiquadFilter(); filter.type = name === "brown" ? "lowpass" : "bandpass"; filter.frequency.value = name === "white" ? 4500 : name === "rain" ? 2200 : 850; filter.Q.value = 0.45;
  const gain = context.createGain(); gain.gain.value = 0.18;
  source.connect(filter).connect(gain).connect(context.destination); source.start();
  audio = { context, source, gain, filter, name };
}
function stopSound() { if (audio.source) { try { audio.source.stop(); } catch {} } audio = { ...audio, source: null, gain: null, filter: null, name: null }; }
function renderSoundsIntoRoot() { if (currentView === "sons") root.innerHTML = renderSounds(); }

function getProfiles() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); } catch { return []; } }
function setProfiles(profiles) { localStorage.setItem(USERS_KEY, JSON.stringify(profiles)); }
const institutionCatalog = [
  { name: "Universidade de São Paulo (USP)", kind: "Universidade", network: "Pública", domain: "usp.br" },
  { name: "Universidade Estadual de Campinas (Unicamp)", kind: "Universidade", network: "Pública", domain: "unicamp.br" },
  { name: "Universidade Estadual Paulista (Unesp)", kind: "Universidade", network: "Pública", domain: "unesp.br" },
  { name: "Universidade Federal do Rio de Janeiro (UFRJ)", kind: "Universidade", network: "Pública", domain: "ufrj.br" },
  { name: "Universidade Federal de Minas Gerais (UFMG)", kind: "Universidade", network: "Pública", domain: "ufmg.br" },
  { name: "Universidade Federal do Amazonas (UFAM)", kind: "Universidade", network: "Pública", domain: "ufam.edu.br" },
  { name: "Universidade Federal do Pará (UFPA)", kind: "Universidade", network: "Pública", domain: "ufpa.br" },
  { name: "Universidade Federal da Bahia (UFBA)", kind: "Universidade", network: "Pública", domain: "ufba.br" },
  { name: "Universidade Federal de Pernambuco (UFPE)", kind: "Universidade", network: "Pública", domain: "ufpe.br" },
  { name: "Universidade Federal do Ceará (UFC)", kind: "Universidade", network: "Pública", domain: "ufc.br" },
  { name: "Universidade de Brasília (UnB)", kind: "Universidade", network: "Pública", domain: "unb.br" },
  { name: "Universidade Federal de Goiás (UFG)", kind: "Universidade", network: "Pública", domain: "ufg.br" },
  { name: "Universidade Federal do Espírito Santo (UFES)", kind: "Universidade", network: "Pública", domain: "ufes.br" },
  { name: "Universidade Federal Fluminense (UFF)", kind: "Universidade", network: "Pública", domain: "uff.br" },
  { name: "Universidade Federal de São Carlos (UFSCar)", kind: "Universidade", network: "Pública", domain: "ufscar.br" },
  { name: "Universidade Federal do Paraná (UFPR)", kind: "Universidade", network: "Pública", domain: "ufpr.br" },
  { name: "Universidade Federal do Rio Grande do Sul (UFRGS)", kind: "Universidade", network: "Pública", domain: "ufrgs.br" },
  { name: "Universidade Federal de Santa Catarina (UFSC)", kind: "Universidade", network: "Pública", domain: "ufsc.br" },
  { name: "Universidade Estadual de Londrina (UEL)", kind: "Universidade", network: "Pública", domain: "uel.br" },
  { name: "Universidade Estadual de Maringá (UEM)", kind: "Universidade", network: "Pública", domain: "uem.br" },
  { name: "Instituto Federal de São Paulo (IFSP)", kind: "Instituto", network: "Pública", domain: "ifsp.edu.br" },
  { name: "Instituto Federal do Rio de Janeiro (IFRJ)", kind: "Instituto", network: "Pública", domain: "ifrj.edu.br" },
  { name: "Instituto Federal de Minas Gerais (IFMG)", kind: "Instituto", network: "Pública", domain: "ifmg.edu.br" },
  { name: "Instituto Federal da Bahia (IFBA)", kind: "Instituto", network: "Pública", domain: "portal.ifba.edu.br" },
  { name: "Instituto Federal do Ceará (IFCE)", kind: "Instituto", network: "Pública", domain: "ifce.edu.br" },
  { name: "Instituto Federal do Rio Grande do Sul (IFRS)", kind: "Instituto", network: "Pública", domain: "ifrs.edu.br" },
  { name: "Instituto Federal de Santa Catarina (IFSC)", kind: "Instituto", network: "Pública", domain: "ifsc.edu.br" },
  { name: "Colégio Pedro II", kind: "Escola", network: "Pública", domain: "cp2.g12.br" },
  { name: "Colégio Militar do Rio de Janeiro", kind: "Escola", network: "Pública", domain: "cml.eb.mil.br" },
  { name: "Colégio Militar de Brasília", kind: "Escola", network: "Pública", domain: "cmb.eb.mil.br" },
  { name: "Rede SESI de Educação", kind: "Escola", network: "Privada", domain: "sesi.org.br" },
  { name: "Rede SENAI de Educação", kind: "Instituto", network: "Privada", domain: "senai.br" },
  { name: "Colégio Bandeirantes", kind: "Escola", network: "Privada", domain: "colband.com.br" },
  { name: "Colégio Etapa", kind: "Escola", network: "Privada", domain: "etapa.com.br" },
  { name: "Colégio Bernoulli", kind: "Escola", network: "Privada", domain: "bernoulli.com.br" },
  { name: "Colégio Positivo", kind: "Escola", network: "Privada", domain: "colegiopositivo.com.br" },
  { name: "Colégios Maristas", kind: "Escola", network: "Privada", domain: "marista.org.br" },
  { name: "Colégio Objetivo", kind: "Escola", network: "Privada", domain: "objetivo.br" },
  { name: "Colégio Farias Brito", kind: "Escola", network: "Privada", domain: "fb.com.br" },
  { name: "Pontifícia Universidade Católica de São Paulo (PUC-SP)", kind: "Universidade", network: "Privada", domain: "pucsp.br" },
  { name: "Pontifícia Universidade Católica do Rio de Janeiro (PUC-Rio)", kind: "Universidade", network: "Privada", domain: "puc-rio.br" },
  { name: "Pontifícia Universidade Católica de Minas Gerais (PUC Minas)", kind: "Universidade", network: "Privada", domain: "pucminas.br" },
  { name: "Pontifícia Universidade Católica do Rio Grande do Sul (PUCRS)", kind: "Universidade", network: "Privada", domain: "pucrs.br" },
  { name: "Fundação Getulio Vargas (FGV)", kind: "Faculdade", network: "Privada", domain: "fgv.br" },
  { name: "Insper", kind: "Faculdade", network: "Privada", domain: "insper.edu.br" },
  { name: "ESPM", kind: "Faculdade", network: "Privada", domain: "espm.br" },
  { name: "Universidade Presbiteriana Mackenzie", kind: "Universidade", network: "Privada", domain: "mackenzie.br" },
  { name: "Universidade do Vale do Rio dos Sinos (Unisinos)", kind: "Universidade", network: "Privada", domain: "unisinos.br" },
  { name: "Universidade Positivo (UP)", kind: "Universidade", network: "Privada", domain: "up.edu.br" }
];
const institutionInput = document.getElementById("institutionNameInput");
const institutionList = document.getElementById("institutionSuggestions");
const institutionPreview = document.getElementById("institutionLogoPreview");
let selectedInstitution = null;
function institutionLogoUrl(institution) { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(institution.domain)}&sz=128`; }
function normalizeInstitutionName(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function showInstitutionLogo(institution) {
  institutionPreview.replaceChildren();
  if (!institution?.domain) { institutionPreview.hidden = true; return; }
  const img = document.createElement("img"); img.src = institutionLogoUrl(institution); img.alt = `Logo de ${institution.name}`;
  img.onerror = () => { institutionPreview.hidden = true; };
  institutionPreview.appendChild(img); institutionPreview.hidden = false;
}
function renderInstitutionSuggestions(query = "") {
  const normalized = normalizeInstitutionName(query.trim());
  const matches = institutionCatalog.filter(item => !normalized || normalizeInstitutionName(item.name).includes(normalized)).slice(0, 6);
  institutionList.replaceChildren();
  if (!matches.length && normalized) {
    const empty = document.createElement("div"); empty.className = "institution-no-results"; empty.textContent = "Não achei essa instituição na lista. Você ainda pode cadastrar o nome."; institutionList.appendChild(empty);
  }
  matches.forEach(institution => {
    const button = document.createElement("button"); button.type = "button"; button.className = "institution-suggestion";
    const img = document.createElement("img"); img.src = institutionLogoUrl(institution); img.alt = ""; img.onerror = () => { img.hidden = true; };
    const text = document.createElement("span"); text.innerHTML = `<strong>${escapeText(institution.name)}</strong><small>${institution.kind} · ${institution.network}</small>`;
    button.append(img, text);
    button.addEventListener("click", event => {
      event.preventDefault();
      selectedInstitution = institution; institutionInput.value = institution.name;
      document.getElementById("institutionKindInput").value = institution.kind;
      document.getElementById("institutionNetworkInput").value = institution.network;
      showInstitutionLogo(institution); institutionList.hidden = true; institutionInput.setAttribute("aria-expanded", "false");
    });
    institutionList.appendChild(button);
  });
  institutionList.hidden = false; institutionInput.setAttribute("aria-expanded", "true");
}
institutionInput.addEventListener("focus", () => renderInstitutionSuggestions(institutionInput.value));
institutionInput.addEventListener("input", () => {
  const normalizedName = normalizeInstitutionName(institutionInput.value.trim());
  const exact = institutionCatalog.find(item => normalizeInstitutionName(item.name) === normalizedName);
  selectedInstitution = exact || null;
  if (exact) {
    document.getElementById("institutionKindInput").value = exact.kind;
    document.getElementById("institutionNetworkInput").value = exact.network;
    showInstitutionLogo(exact);
  } else {
    document.getElementById("institutionKindInput").value = "";
    document.getElementById("institutionNetworkInput").value = "";
    showInstitutionLogo(null);
  }
  renderInstitutionSuggestions(institutionInput.value);
});
document.addEventListener("click", event => {
  if (!event.target.closest(".institution-name-field")) { institutionList.hidden = true; institutionInput.setAttribute("aria-expanded", "false"); }
});
function bytesToHex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""); }
async function hashPassword(password, saltHex) {
  if (!globalThis.crypto?.subtle) throw new Error("Este navegador bloqueou o recurso de segurança do login. Abra o arquivo pelo VS Code com Live Server ou use um navegador atualizado.");
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{2}/g), byte => parseInt(byte, 16)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
  return { salt: bytesToHex(salt), passwordHash: bytesToHex(new Uint8Array(bits)) };
}
function setAuthMode(mode) {
  authMode = mode;
  const creating = mode === "signup";
  document.getElementById("authEyebrow").textContent = creating ? "SEU ESPAÇO COMEÇA AQUI" : "QUE BOM TER VOCÊ DE VOLTA";
  document.getElementById("authTitle").textContent = creating ? "Crie seu perfil" : "Vamos continuar?";
  document.getElementById("authCopy").textContent = creating ? "Defina seu login e sua senha para organizar seus estudos." : "Entre para acessar suas matérias e seguir de onde parou.";
  document.getElementById("displayNameField").hidden = !creating;
  document.getElementById("institutionFields").hidden = !creating;
  document.getElementById("institutionNameInput").required = creating;
  document.getElementById("institutionKindInput").required = creating;
  document.getElementById("institutionNetworkInput").required = creating;
  document.getElementById("rememberRow").hidden = creating;
  document.getElementById("usernameInput").autocomplete = "username";
  document.getElementById("passwordInput").autocomplete = creating ? "new-password" : "current-password";
  document.getElementById("authSubmit").textContent = creating ? "Criar perfil" : "Entrar";
  document.getElementById("switchText").textContent = creating ? "Já tem um perfil?" : "Primeira vez por aqui?";
  document.getElementById("switchAuthMode").textContent = creating ? "Entrar" : "Criar perfil";
  document.getElementById("authMessage").textContent = "";
  if (!creating) {
    selectedInstitution = null;
    institutionInput.value = "";
    document.getElementById("institutionKindInput").value = "";
    document.getElementById("institutionNetworkInput").value = "";
    institutionPreview.replaceChildren(); institutionPreview.hidden = true;
    institutionList.hidden = true; institutionInput.setAttribute("aria-expanded", "false");
  }
}
async function enterApp(profile, remember = true) {
  currentUser = profile;
  data = loadData(profile.username);
  activeNoteId = null;
  currentView = "inicio";
  timer.mode = "focus";
  timer.remaining = data.settings.focus * 60;
  if (remember) { localStorage.setItem(SESSION_KEY, profile.username); sessionStorage.removeItem(SESSION_KEY); }
  else { sessionStorage.setItem(SESSION_KEY, profile.username); localStorage.removeItem(SESSION_KEY); }
  const display = profile.name || profile.username;
  document.getElementById("profileButton").textContent = display.slice(0, 1).toUpperCase();
  document.getElementById("profileMenuName").textContent = `${display} · @${profile.username}`;
  const institutionBadge = document.getElementById("profileMenuInstitution");
  institutionBadge.replaceChildren();
  if (profile.institution?.name) {
    const label = document.createElement("span");
    label.textContent = `${profile.institution.name} · ${profile.institution.kind || "Instituição"} ${profile.institution.network ? `· ${profile.institution.network}` : ""}`;
    if (profile.institution.logo) { const img = document.createElement("img"); img.src = profile.institution.logo; img.alt = ""; institutionBadge.appendChild(img); }
    institutionBadge.appendChild(label); institutionBadge.hidden = false;
  } else institutionBadge.hidden = true;
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appShell").hidden = false;
  applyAppearance();
  try { await openImageDb(); } catch { /* O restante continua disponível se IndexedDB estiver bloqueado. */ }
  render();
}
function leaveProfile() {
  persist(); clearInterval(timer.interval); timer.running = false; stopSound(); currentUser = null;
  localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
  document.getElementById("profileMenu").hidden = true;
  document.getElementById("appShell").hidden = true;
  document.getElementById("authScreen").hidden = false;
  document.getElementById("authForm").reset(); setAuthMode("login");
}
document.getElementById("switchAuthMode").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
document.getElementById("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const message = document.getElementById("authMessage");
  const username = document.getElementById("usernameInput").value.trim().toLowerCase();
  const password = document.getElementById("passwordInput").value;
  const submit = document.getElementById("authSubmit");
  submit.disabled = true;
  message.textContent = "Só um instante…";
  try {
    const profiles = getProfiles();
    if (authMode === "signup") {
      const name = document.getElementById("displayNameInput").value.trim();
      const institution = document.getElementById("institutionNameInput").value.trim();
      const institutionKind = document.getElementById("institutionKindInput").value;
      const institutionNetwork = document.getElementById("institutionNetworkInput").value;
      if (!/^[a-z0-9._-]{3,24}$/.test(username)) throw new Error("Use de 3 a 24 caracteres no login. Pode incluir letras, números, ponto, traço ou underline.");
      if (password.length < 8) throw new Error("Sua senha precisa ter pelo menos 8 caracteres.");
      if (profiles.some(profile => profile.username === username)) throw new Error("Esse login já está cadastrado neste dispositivo.");
      const hashed = await hashPassword(password);
      const profile = { username, name: name || username, institution: { name: institution, kind: institutionKind, network: institutionNetwork, logo: selectedInstitution ? institutionLogoUrl(selectedInstitution) : "" }, ...hashed, createdAt: Date.now() };
      profiles.push(profile); setProfiles(profiles);
      await enterApp(profile, false);
    } else {
      const profile = profiles.find(item => item.username === username);
      if (!profile) throw new Error("Não encontrei esse perfil neste dispositivo. Confira o login ou crie um perfil.");
      const hashed = await hashPassword(password, profile.salt);
      if (hashed.passwordHash !== profile.passwordHash) throw new Error("Login ou senha incorretos.");
      await enterApp(profile, document.getElementById("rememberMe").checked);
    }
  } catch (error) { message.textContent = error.message || "Não foi possível entrar. Confira os dados e tente novamente."; }
  finally { submit.disabled = false; }
});
document.getElementById("profileButton").addEventListener("click", () => {
  const menu = document.getElementById("profileMenu");
  menu.hidden = !menu.hidden;
});
document.getElementById("addProfileButton").addEventListener("click", async () => {
  document.getElementById("profileMenu").hidden = true;
  await leaveProfile();
  setAuthMode("signup");
});
document.getElementById("logoutButton").addEventListener("click", leaveProfile);
document.getElementById("changePasswordButton").addEventListener("click", () => {
  document.getElementById("profileMenu").hidden = true;
  document.getElementById("passwordForm").reset();
  document.getElementById("passwordMessage").textContent = "";
  passwordDialog.showModal();
});
document.querySelectorAll("[data-close-password]").forEach(button => button.addEventListener("click", () => passwordDialog.close()));
document.getElementById("passwordForm").addEventListener("submit", async event => {
  event.preventDefault();
  const message = document.getElementById("passwordMessage");
  const current = document.getElementById("currentPassword").value;
  const next = document.getElementById("newPassword").value;
  const confirmation = document.getElementById("confirmPassword").value;
  const profiles = getProfiles();
  const profile = profiles.find(item => item.username === currentUser?.username);
  if (!profile) { message.textContent = "Perfil não encontrado."; return; }
  const check = await hashPassword(current, profile.salt);
  if (check.passwordHash !== profile.passwordHash) { message.textContent = "A senha atual não confere."; return; }
  if (next.length < 8) { message.textContent = "A nova senha precisa ter pelo menos 8 caracteres."; return; }
  if (next !== confirmation) { message.textContent = "As senhas novas não são iguais."; return; }
  const hashed = await hashPassword(next);
  Object.assign(profile, hashed);
  setProfiles(profiles);
  passwordDialog.close();
});
document.addEventListener("click", event => {
  const wrap = document.querySelector(".profile-wrap");
  if (wrap && !wrap.contains(event.target)) document.getElementById("profileMenu").hidden = true;
});
async function initializeAuth() {
  let profiles = getProfiles();
  let imageOwnerToMigrate = null;
  if (!profiles.length) {
    const hashed = await hashPassword(DEFAULT_PASSWORD);
    profiles = [{ username: DEFAULT_LOGIN, name: "Andrey Martins", ...hashed, createdAt: Date.now() }];
    setProfiles(profiles);
    localStorage.setItem(DEFAULT_LOGIN_MIGRATION_KEY, "done");
    imageOwnerToMigrate = "daniel.brito";
  } else {
    const newProfile = profiles.find(item => item.username === DEFAULT_LOGIN);
    const rememberedLogin = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    const oldProfile = (rememberedLogin && profiles.find(item => item.username === rememberedLogin)) || profiles.find(item => item.username === "daniel.brito");
    if (newProfile && !localStorage.getItem(DEFAULT_LOGIN_MIGRATION_KEY)) {
      const hashed = await hashPassword(DEFAULT_PASSWORD);
      Object.assign(newProfile, hashed);
      setProfiles(profiles);
      localStorage.setItem(DEFAULT_LOGIN_MIGRATION_KEY, "done");
    } else if (oldProfile) {
      const oldLogin = oldProfile.username;
      imageOwnerToMigrate = oldLogin;
      const hashed = await hashPassword(DEFAULT_PASSWORD);
      oldProfile.username = DEFAULT_LOGIN;
      oldProfile.name = oldProfile.name === "Daniel" ? "Andrey Martins" : oldProfile.name;
      Object.assign(oldProfile, hashed);
      const oldDataKey = dataKey(oldLogin);
      const newDataKey = dataKey(DEFAULT_LOGIN);
      if (!localStorage.getItem(newDataKey)) {
        const savedData = localStorage.getItem(oldDataKey) || (oldLogin === "daniel.brito" ? localStorage.getItem(STORE_KEY) : null);
        if (savedData) localStorage.setItem(newDataKey, savedData);
      }
      const oldSubject = localStorage.getItem(`estuda-last-subject:${oldLogin}`);
      if (oldSubject && !localStorage.getItem(`estuda-last-subject:${DEFAULT_LOGIN}`)) localStorage.setItem(`estuda-last-subject:${DEFAULT_LOGIN}`, oldSubject);
      if (localStorage.getItem(SESSION_KEY) === oldLogin) localStorage.setItem(SESSION_KEY, DEFAULT_LOGIN);
      if (sessionStorage.getItem(SESSION_KEY) === oldLogin) sessionStorage.setItem(SESSION_KEY, DEFAULT_LOGIN);
      setProfiles(profiles);
      localStorage.setItem(DEFAULT_LOGIN_MIGRATION_KEY, "done");
    }
  }
  try { await openImageDb(); } catch { /* Imagens ficam indisponíveis, mas anotações continuam acessíveis. */ }
  if (imageDb && imageOwnerToMigrate) await migrateDefaultImages(imageOwnerToMigrate);
  const remembered = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  const profile = remembered && profiles.find(item => item.username === remembered);
  if (profile) await enterApp(profile, localStorage.getItem(SESSION_KEY) === remembered);
  else {
    document.getElementById("authScreen").hidden = false;
    document.getElementById("appShell").hidden = true;
  }
}
async function migrateDefaultImages(oldLogin) {
  const transaction = imageDb.transaction("images", "readwrite");
  const store = transaction.objectStore("images");
  const request = store.getAll();
  request.onsuccess = () => {
    for (const image of request.result) {
      if (image.owner === oldLogin || (oldLogin === "daniel.brito" && !image.owner)) {
        image.owner = DEFAULT_LOGIN;
        store.put(image);
      }
    }
  };
}
initializeAuth();
