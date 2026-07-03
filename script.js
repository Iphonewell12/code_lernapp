// script.js - Erweiterung: mehrere Listen (per localStorage)
// Speicherstruktur:
// - 'vocab_lists' => JSON array mit Listennamen
// - 'vocab:<list>' => JSON object {wort: übersetzung}
// - 'time:<list>'  => JSON object {wort: time}
// - 'count:<list>' => JSON object {wort: count}
// Migration: falls alter key 'vocab_data' existiert, wird er in 'default' importiert.

(() => {
  // ---------- Storage / List Manager ----------
  class StorageManager {
    constructor() {
      this.listsKey = 'vocab_lists';
      this.prefix = 'vocab';
    }

    // Listennamen
    loadListNames() {
      const raw = localStorage.getItem(this.listsKey);
      if (!raw) {
        // migration: wenn alter key existiert, importieren
        const old = localStorage.getItem('vocab_data');
        if (old) {
          const defaultName = 'default';
          this.saveListNames([defaultName]);
          localStorage.setItem(this._vocabKey(defaultName), old);
          // remove legacy or keep? hier entfernen:
          localStorage.removeItem('vocab_data');
          return [defaultName];
        }
        return [];
      }
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }

    saveListNames(arr) {
      localStorage.setItem(this.listsKey, JSON.stringify(arr));
    }

    // keys helpers
    _vocabKey(list) { return `${this.prefix}:${list}:vocab`; }
    _timeKey(list)  { return `${this.prefix}:${list}:time`; }
    _countKey(list) { return `${this.prefix}:${list}:count`; }

    // Vocab per Liste
    loadVocab(list) {
      const raw = localStorage.getItem(this._vocabKey(list));
      return raw ? JSON.parse(raw) : {};
    }
    saveVocab(list, map) {
      localStorage.setItem(this._vocabKey(list), JSON.stringify(map));
    }

    loadTimes(list) {
      const raw = localStorage.getItem(this._timeKey(list));
      return raw ? JSON.parse(raw) : {};
    }
    saveTimes(list, map) {
      localStorage.setItem(this._timeKey(list), JSON.stringify(map));
    }

    loadCounts(list) {
      const raw = localStorage.getItem(this._countKey(list));
      return raw ? JSON.parse(raw) : {};
    }
    saveCounts(list, map) {
      localStorage.setItem(this._countKey(list), JSON.stringify(map));
    }

    createList(list) {
      const names = this.loadListNames();
      if (names.includes(list)) return false;
      names.push(list);
      this.saveListNames(names);
      this.saveVocab(list, {});
      this.saveTimes(list, {});
      this.saveCounts(list, {});
      return true;
    }

    deleteList(list) {
      const names = this.loadListNames().filter(n => n !== list);
      this.saveListNames(names);
      localStorage.removeItem(this._vocabKey(list));
      localStorage.removeItem(this._timeKey(list));
      localStorage.removeItem(this._countKey(list));
      return names;
    }
  }

  // ---------- RandomWeight ----------
  class RandomWeight {
    constructor(gewichte) {
      this.gewichte = Array.from(gewichte);
      this.grenzen = [];
      const summe = this.gewichte.reduce((a,b)=>a+b,0) || 1;
      let laufend = 0;
      for (let w of this.gewichte) {
        laufend += w / summe;
        this.grenzen.push(laufend);
      }
    }
    pickIndex() {
      const zufall = Math.random();
      for (let i = 0; i < this.grenzen.length; i++) {
        if (zufall <= this.grenzen[i]) return i;
      }
      return Math.max(0, this.grenzen.length - 1);
    }
  }

  // ---------- Timecutter (list-aware) ----------
  class Timecutter {
    constructor(storage) {
      this.storage = storage;
      this.Min = -5;
      this.Max = 120;
      this.startZeit = {}; // temporär in-memory: {wort: timestamp}
    }

    start(frage) {
      this.startZeit[frage] = Date.now();
    }

    auswerten(frage, kurz, mittel, lang, spanisch, currentList) {
      const start = this.startZeit[frage];
      if (!start) return;
      const vergangen = Date.now() - start;

      const times = this.storage.loadTimes(currentList);
      let Time = times[frage] || 0;

      if (vergangen >= 120000 && vergangen < 600000) {
        Time -= 1;
        kurz[frage] = spanisch[frage];
      } else if (vergangen >= 600000) {
        Time -= 2;
        mittel[frage] = spanisch[frage];
      } else {
        Time += 2;
        lang[frage] = spanisch[frage];
      }

      Time = Math.max(this.Min, Math.min(Time, this.Max));
      times[frage] = Time;
      this.storage.saveTimes(currentList, times);
      delete this.startZeit[frage];
    }

    getTime(frage, currentList) {
      const times = this.storage.loadTimes(currentList);
      return times[frage] || 0;
    }

    adjustTime(frage, delta, currentList) {
      const times = this.storage.loadTimes(currentList);
      times[frage] = (times[frage] || 0) + delta;
      times[frage] = Math.max(this.Min, Math.min(times[frage], this.Max));
      this.storage.saveTimes(currentList, times);
    }
  }

  // ---------- Lernen (list-aware) ----------
  class Lernen {
    constructor(tc, storage, ui) {
      this.tc = tc;
      this.storage = storage;
      this.ui = ui;
      this.kurz = {};
      this.mittel = {};
      this.lang = {};
      this.running = false;
      this.current = null;
      this.currentList = null;
    }

    start(currentList) {
      this.currentList = currentList;
      const spanisch = this.storage.loadVocab(currentList);
      const keys = Object.keys(spanisch);
      if (keys.length === 0) {
        this.ui.log('Keine Wörter in dieser Liste. Füge zuerst Wörter hinzu.');
        return;
      }
      this.running = true;
      this.ui.toggleQuiz(true);
      this.nextQuestion();
    }

    stop() {
      this.running = false;
      this.ui.toggleQuiz(false);
      this.current = null;
      this.ui.clearQuestion();
    }

    buildWeights(keys) {
      const gewichte = new Array(keys.length);
      for (let i = 0; i < keys.length; i++) {
        const wort = keys[i];
        const t = this.tc.getTime(wort, this.currentList);
        if (t <= 5) gewichte[i] = 5;
        else if (t <= 15) gewichte[i] = 3;
        else gewichte[i] = 1;
      }
      return gewichte;
    }

    nextQuestion() {
      if (!this.running) return;
      const spanisch = this.storage.loadVocab(this.currentList);
      const keys = Object.keys(spanisch);
      if (keys.length === 0) {
        this.ui.log('Wörterliste leer.');
        this.stop();
        return;
      }

      const gewichte = this.buildWeights(keys);
      const rw = new RandomWeight(gewichte);
      const idx = rw.pickIndex();
      const frage = keys[idx];
      this.current = { frage, antwort: spanisch[frage], zweiteVersuchAllowed: false };

      this.tc.start(frage);
      this.ui.showQuestion(frage);
      this.ui.enableSecondAttemptAfter(20000);
    }

    submitAnswer(text) {
      if (!this.current) return;
      const correct = text.trim().toLowerCase() === this.current.antwort.trim().toLowerCase();
      const frage = this.current.frage;

      const counts = this.storage.loadCounts(this.currentList);
      counts[frage] = counts[frage] || 0;

      if (correct) {
        counts[frage] += 1;
        this.storage.saveCounts(this.currentList, counts);
        this.tc.adjustTime(frage, +3, this.currentList);
        this.ui.log(`Richtig! (${counts[frage]}x richtig)`);
        this.tc.auswerten(frage, this.kurz, this.mittel, this.lang, this.storage.loadVocab(this.currentList), this.currentList);
        if (counts[frage] >= 5) {
          this.ui.log('✔ Wort gilt als sicher gelernt!');
        }
        this.nextQuestion();
      } else {
        this.ui.log(`Falsch! Richtige Antwort: ${this.current.antwort}`);
        this.tc.adjustTime(frage, -2, this.currentList);
        if (this.current.zweiteVersuchAllowed) {
          this.ui.log('2. Versuch ist verfügbar.');
        } else {
          this.ui.log('2. Versuch wird in 20s verfügbar.');
        }
      }
    }

    secondAttempt(text) {
      if (!this.current) return;
      if (!this.current.zweiteVersuchAllowed) {
        this.ui.log('2. Versuch noch nicht verfügbar.');
        return;
      }
      const correct = text.trim().toLowerCase() === this.current.antwort.trim().toLowerCase();
      const frage = this.current.frage;
      const counts = this.storage.loadCounts(this.currentList);
      counts[frage] = counts[frage] || 0;
      if (correct) {
        counts[frage] += 1;
        this.storage.saveCounts(this.currentList, counts);
        this.tc.adjustTime(frage, +2, this.currentList);
        this.ui.log('Richtig beim 2. Versuch!');
        this.tc.auswerten(frage, this.kurz, this.mittel, this.lang, this.storage.loadVocab(this.currentList), this.currentList);
        this.nextQuestion();
      } else {
        this.ui.log('Falsch erneut. Richtige Antwort: ' + this.current.antwort);
        this.nextQuestion();
      }
    }
  }

  // ---------- UI glue ----------
  const listSelect = document.getElementById('listSelect');
  const newListInput = document.getElementById('newListInput');
  const createListBtn = document.getElementById('createListBtn');
  const deleteListBtn = document.getElementById('deleteListBtn');

  const wortInput = document.getElementById('wortInput');
  const ueInput = document.getElementById('ueInput');
  const addBtn = document.getElementById('addBtn');
  const clearListBtn = document.getElementById('clearListBtn');
  const wordList = document.getElementById('wordList');
  const logEl = document.getElementById('log');

  const learnBtn = document.getElementById('learnBtn');
  const stopLearnBtn = document.getElementById('stopLearnBtn');
  const frageEl = document.getElementById('frage');
  const antwortInput = document.getElementById('antwortInput');
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const secondAttemptBtn = document.getElementById('secondAttemptBtn');
  const quizDiv = document.getElementById('quiz');
  const statusEl = document.getElementById('status');

  const storage = new StorageManager();
  const tc = new Timecutter(storage);
  const lernenInstance = new Lernen(tc, storage, {
    showQuestion: (q) => {
      frageEl.textContent = `Übersetze: ${q}`;
      antwortInput.value = '';
      antwortInput.focus();
      statusEl.textContent = '';
      secondAttemptBtn.disabled = true;
    },
    clearQuestion: () => {
      frageEl.textContent = '';
      antwortInput.value = '';
    },
    toggleQuiz: (on) => {
      quizDiv.style.display = on ? 'block' : 'none';
      learnBtn.disabled = on;
      stopLearnBtn.disabled = !on;
    },
    enableSecondAttemptAfter: (ms) => {
      secondAttemptBtn.disabled = true;
      if (lernenInstance.current) lernenInstance.current.zweiteVersuchAllowed = false;
      setTimeout(() => {
        if (lernenInstance.current) {
          lernenInstance.current.zweiteVersuchAllowed = true;
          secondAttemptBtn.disabled = false;
          statusEl.textContent = '2. Versuch verfügbar';
        }
      }, ms);
    },
    log: (txt) => {
      const time = new Date().toLocaleTimeString();
      logEl.textContent = `[${time}] ${txt}\n` + logEl.textContent;
    }
  });

  // ---------- Helpers ----------
  function sanitizeListName(name) {
    return name.trim().replace(/\s+/g, '_').replace(/[:]/g, '');
  }

  function renderListSelect() {
    const names = storage.loadListNames();
    listSelect.innerHTML = '';
    for (let n of names) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      listSelect.appendChild(opt);
    }
    if (names.length === 0) {
      // Erstelle eine default-Liste automatisch
      storage.createList('default');
      renderListSelect();
      return;
    }
  }

  function currentList() {
    return listSelect.value;
  }

  function renderList() {
    const list = currentList();
    const map = storage.loadVocab(list);
    wordList.innerHTML = '';
    const keys = Object.keys(map).sort((a,b)=>a.localeCompare(b,'de'));
    if (keys.length === 0) {
      wordList.textContent = '(leer)';
      return;
    }
    for (let k of keys) {
      const div = document.createElement('div');
      div.className = 'item';
      const left = document.createElement('div');
      left.textContent = `${k} → ${map[k]}`;
      const right = document.createElement('div');
      right.innerHTML = `<button data-k="${k}">✖</button>`;
      div.appendChild(left);
      div.appendChild(right);
      wordList.appendChild(div);
      right.querySelector('button').addEventListener('click', () => {
        const m = storage.loadVocab(list);
        delete m[k];
        storage.saveVocab(list, m);
        // auch stats entfernen
        const counts = storage.loadCounts(list);
        delete counts[k];
        storage.saveCounts(list, counts);
        const times = storage.loadTimes(list);
        delete times[k];
        storage.saveTimes(list, times);
        renderList();
        lernenInstance.ui.log(`Wort entfernt: ${k}`);
      });
    }
  }

  // Debounce utility
  function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  // ---------- Event handlers ----------
  createListBtn.addEventListener('click', () => {
    const raw = newListInput.value;
    const name = sanitizeListName(raw || '');
    if (!name) {
      lernenInstance.ui.log('Bitte einen Listennamen eingeben.');
      return;
    }
    const created = storage.createList(name);
    if (!created) {
      lernenInstance.ui.log('Liste existiert bereits.');
      return;
    }
    renderListSelect();
    listSelect.value = name;
    renderList();
    lernenInstance.ui.log(`Liste erstellt: ${name}`);
    newListInput.value = '';
  });

  deleteListBtn.addEventListener('click', () => {
    const list = currentList();
    if (!list) return;
    if (!confirm(`Liste "${list}" wirklich löschen? (Wörter gehen verloren)`)) return;
    const names = storage.deleteList(list);
    if (names.length === 0) {
      storage.createList('default');
      renderListSelect();
    } else {
      renderListSelect();
    }
    // wähle eine existierende Liste
    listSelect.value = storage.loadListNames()[0];
    renderList();
    lernenInstance.ui.log(`Liste gelöscht: ${list}`);
  });

  listSelect.addEventListener('change', () => {
    renderList();
    lernenInstance.ui.log(`Wechsel zu Liste: ${currentList()}`);
  });

  addBtn.addEventListener('click', debounce(() => {
    const wort = wortInput.value.trim();
    const ue = ueInput.value.trim();
    if (!wort || !ue) {
      lernenInstance.ui.log('Bitte Wort und Übersetzung ausfüllen.');
      return;
    }
    const list = currentList();
    const map = storage.loadVocab(list);
    map[wort] = ue;
    storage.saveVocab(list, map);
    renderList();
    wortInput.value = '';
    ueInput.value = '';
    lernenInstance.ui.log(`Wort hinzugefügt in "${list}": ${wort} → ${ue}`);
  }, 250));

  clearListBtn.addEventListener('click', () => {
    const list = currentList();
    if (!confirm(`Alle Wörter in Liste "${list}" löschen?`)) return;
    storage.saveVocab(list, {});
    storage.saveCounts(list, {});
    storage.saveTimes(list, {});
    renderList();
    lernenInstance.ui.log(`Liste "${list}" geleert.`);
  });

  learnBtn.addEventListener('click', () => {
    const list = currentList();
    lernenInstance.start(list);
  });
  stopLearnBtn.addEventListener('click', () => lernenInstance.stop());

  submitAnswerBtn.addEventListener('click', () => {
    const text = antwortInput.value;
    if (!text.trim()) return;
    lernenInstance.submitAnswer(text);
  });

  antwortInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitAnswerBtn.click();
    }
  });

  secondAttemptBtn.addEventListener('click', () => {
    const text = antwortInput.value;
    if (!text.trim()) {
      lernenInstance.ui.log('Bitte Antwort eingeben.');
      return;
    }
    lernenInstance.secondAttempt(text);
  });

  // ---------- Startup ----------
  renderListSelect();
  // falls keine Liste: renderListSelect hat default erstellt
  // setze Auswahl und render
  const names = storage.loadListNames();
  if (names.length > 0) listSelect.value = names[0];
  renderList();

})();