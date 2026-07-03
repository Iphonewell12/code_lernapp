```markdown
Vokabeltrainer zbb 12345 — schnelle Netlify-Anleitung

1) Ordner vorbereiten
- Erstelle einen Ordner (z. B. "vokabeltrainer") und speichere diese Dateien hinein:
  - index.html
  - styles.css
  - script.js
  - robots.txt
  - sitemap.xml
  - README.md (optional)

2) ZIP (optional)
- Windows: Rechtsklick auf Ordner → "Senden an" → "ZIP-komprimierter Ordner"
- macOS/Linux (Terminal): zip -r vokabeltrainer.zip vokabeltrainer/

3) Netlify (Drag & Drop)
- Gehe zu https://app.netlify.com/ und melde dich an (kostenlos).
- Dashboard → "Add new site" → "Deploy manually" → Drag & Drop den Ordner oder die ZIP.
- Warte kurz: Netlify erstellt eine site-URL (z. B. your-site.netlify.app).

4) Testen
- Öffne die zugewiesene netlify.app-URL im Browser.
- Falls du lokal testen willst: im Ordner ein Terminal öffnen und:
  - mit Python: python -m http.server 8000
  - dann öffnen: http://localhost:8000

5) Eigene Domain (optional)
- Falls du eine Domain besitzt, kannst du sie in Netlify → Site settings → Domain management → Add custom domain hinzufügen. Netlify zeigt dann die DNS‑Einträge, die du beim Registrar setzen musst. Netlify stellt HTTPS automatisch bereit.

6) Hinweise
- Die App speichert Vokabellisten im Browser (localStorage). Export als CSV möglich.
- Wenn du CSV‑Import, TTS oder serverseitige Speicherung willst, sage Bescheid — ich erweitere die Dateien gern.

Viel Erfolg — wenn du magst, führe den Drag & Drop jetzt aus und sag mir die Netlify‑URL; ich teste kurz mit dir.
```