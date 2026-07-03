// learn.js - Quiz-Seite. Liest Query params: ?list=NAME&reverse=0|1
// Verwendet dieselbe localStorage-Struktur wie index/script.js

(() => {
  // Helper: parse query params
  function q(name) {
    const params = new URLSearchParams(location.search);
    return params.get(name);
  }

  const currentList = decodeURIComponent(q('list') || 'default');
  const reverse = q('reverse') === '1';

  // minimaler StorageManager (list-aware)
  class StorageManager {
    constructor(list) { this.list = list; this.prefix = 'vocab'; }
    _vocabKey() { return `${this.prefix}:${this.list}:vocab`; }
    _timeKey() { return `${this.prefix}:${this.list}:time`; }
    _countKey() { return `${this.prefix}:${this.list}:count`; }
    loadVocab() { const raw = localStorage.getItem(this._vocabKey()); return raw ? JSON.parse(raw) : {}; }
    loadTimes() { const raw = localStorage.getItem(this._timeKey()); return raw ? JSON.parse(raw) : {}; }
    saveTimes(map) { localStorage.setItem(this._timeKey(), JSON.stringify(map)); }
    loadCounts() { const raw = localStorage.getItem(this._countKey()); return raw ? JSON.parse(raw) : {}; }
    saveCounts(map) { localStorage.setItem(this._countKey(), JSON.stringify(map)); }
  }

  class RandomWeight {
    constructor(gewichte) {
      this.grenzen = []; const sum = gewichte.reduce((a,b)=>a+b,0)||1; let lauf=0;
      for (let w of gewichte){ lauf += w/sum; this.grenzen.push(lauf); }
    }
    pickIndex(){ const r = Math.random(); for (let i=0;i<this.grenzen.length;i++) if (r<=this.grenzen[i]) return i; return Math.max(0,this.grenzen.length-1); }
  }

  class Timecutter {
    constructor(storage) { this.storage = storage; this.Min=-5; this.Max=120; this.startZeit={}; }
    start(frage){ this.startZeit[frage]=Date.now(); const times=this.storage.loadTimes(); if (!(frage in times)){ times[frage]=0; this.storage.saveTimes(times);} }
    auswerten(frage, kurz, mittel, lang, spanisch){
      const start = this.startZeit[frage]; if (!start) return;
      const vergangen = Date.now()-start;
      const times = this.storage.loadTimes(); let Time = times[frage] || 0;
      if (vergangen >= 120000 && vergangen < 600000) { Time -=1; kurz[frage]=spanisch[frage]; }
      else if (vergangen >= 600000) { Time -=2; mittel[frage]=spanisch[frage]; }
      else { Time +=2; lang[frage]=spanisch[frage]; }
      Time = Math.max(this.Min, Math.min(Time,this.Max)); times[frage]=Time; this.storage.saveTimes(times);
      delete this.startZeit[frage];
    }
    getTime(frage){ const times=this.storage.loadTimes(); return times[frage] || 0; }
    adjustTime(frage, delta){ const times=this.storage.loadTimes(); times[frage]=(times[frage]||0)+delta; times[frage]=Math.max(this.Min, Math.min(times[frage],this.Max)); this.storage.saveTimes(times); }
  }

  class Lernen {
    constructor(storage, tc, ui, reverse) {
      this.storage = storage; this.tc = tc; this.ui = ui; this.reverse = reverse;
      this.kurz={}; this.mittel={}; this.lang={}; this.running=true; this.current=null;
    }

    buildWeights(keys) {
      const gew = new Array(keys.length);
      for (let i=0;i<keys.length;i++){
        const t = this.tc.getTime(keys[i]);
        gew[i] = t <= 5 ? 5 : (t <= 15 ? 3 : 1);
      }
      return gew;
    }

    nextQuestion() {
      const vocab = this.storage.loadVocab();
      const keys = Object.keys(vocab);
      if (keys.length === 0) { this.ui.log('Liste leer.'); this.ui.showEnd('Keine Wörter.'); return; }
      const gew = this.buildWeights(keys);
      const rw = new RandomWeight(gew);
      const idx = rw.pickIndex();
      const frageKey = keys[idx];
      const frageText = this.reverse ? vocab[frageKey] : frageKey; // wenn reverse -> zeige übersetzung
      const antwortText = this.reverse ? frageKey : vocab[frageKey];
      this.current = { key: frageKey, frage: frageText, antwort: antwortText, zweiteAllowed:false };
      this.tc.start(frageKey);
      this.ui.showQuestion(this.current.frage);
      this.ui.enableSecondAttemptAfter(20000, () => { if (this.current) this.current.zweiteAllowed = true; });
    }

    submitAnswer(text) {
      if (!this.current) return;
      const given = text.trim().toLowerCase(); const correct = this.current.antwort.trim().toLowerCase();
      const counts = this.storage.loadCounts();
      counts[this.current.key] = counts[this.current.key] || 0;
      if (given === correct) {
        counts[this.current.key] += 1; this.storage.saveCounts(counts);
        this.tc.adjustTime(this.current.key, +3);
        this.ui.log(`Richtig! (${counts[this.current.key]}x)`); this.tc.auswerten(this.current.key, this.kurz, this.mittel, this.lang, this.storage.loadVocab());
        if (counts[this.current.key] >= 5) this.ui.log('✔ Wort gilt als sicher gelernt!');
        this.nextQuestion();
      } else {
        this.ui.log(`Falsch! Richtige Antwort: ${this.current.antwort}`);
        this.tc.adjustTime(this.current.key, -2);
        if (this.current.zweiteAllowed) this.ui.log('2. Versuch ist verfügbar.');
        else this.ui.log('2. Versuch wird in 20s verfügbar.');
      }
    }

    secondAttempt(text) {
      if (!this.current) return;
      if (!this.current.zweiteAllowed) { this.ui.log('2. Versuch noch nicht verfügbar.'); return; }
      const given = text.trim().toLowerCase(); const correct = this.current.antwort.trim().toLowerCase();
      const counts = this.storage.loadCounts(); counts[this.current.key] = counts[this.current.key] || 0;
      if (given === correct) {
        counts[this.current.key] += 1; this.storage.saveCounts(counts);
        this.tc.adjustTime(this.current.key, +2);
        this.ui.log('Richtig beim 2. Versuch!');
        this.tc.auswerten(this.current.key, this.kurz, this.mittel, this.lang, this.storage.loadVocab());
        this.nextQuestion();
      } else {
        this.ui.log('Falsch erneut. Richtige Antwort: ' + this.current.antwort);
        this.nextQuestion();
      }
    }
  }

  // UI bindings
  const frageEl = document.getElementById('frage');
  const antwortInput = document.getElementById('antwortInput');
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const secondAttemptBtn = document.getElementById('secondAttemptBtn');
  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const metaEl = document.getElementById('meta');
  const backBtn = document.getElementById('backBtn');

  const storage = new StorageManager(currentList);
  const tc = new Timecutter(storage);

  const ui = {
    showQuestion: (q) => { frageEl.textContent = `Übersetze: ${q}`; antwortInput.value = ''; antwortInput.focus(); statusEl.textContent=''; secondAttemptBtn.disabled = true; },
    enableSecondAttemptAfter: (ms, cb) => { secondAttemptBtn.disabled = true; setTimeout(()=>{ secondAttemptBtn.disabled=false; cb && cb(); statusEl.textContent = '2. Versuch verfügbar'; }, ms); },
    log: (txt) => { const time = new Date().toLocaleTimeString(); logEl.textContent = `[${time}] ${txt}\n` + logEl.textContent; },
    showEnd: (txt) => { frageEl.textContent = txt; }
  };

  const lernen = new Lernen(storage, tc, ui, reverse);

  // events
  submitAnswerBtn.addEventListener('click', () => {
    const t = antwortInput.value; if (!t.trim()) return; lernen.submitAnswer(t);
  });
  antwortInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAnswerBtn.click(); }});
  secondAttemptBtn.addEventListener('click', () => {
    const t = antwortInput.value; if (!t.trim()) { ui.log('Bitte Antwort eingeben.'); return; }
    lernen.secondAttempt(t);
  });

  backBtn.addEventListener('click', () => location.href = 'index.html');

  // meta info
  metaEl.textContent = `Liste: ${currentList} — Richtung: ${reverse ? 'Übersetzung → Wort' : 'Wort → Übersetzung'}`;

  // start
  // ensure there is at least one word
  const initialVocab = storage.loadVocab();
  if (Object.keys(initialVocab).length === 0) {
    ui.showEnd('Keine Wörter in dieser Liste. Gehe zurück und füge Wörter hinzu.');
  } else {
    lernen.nextQuestion();
  }

})();