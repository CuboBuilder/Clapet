# Clapet

A quirky little desktop pet that lives on your screen. Built with Electron.

<p align="center">
  <img src="build/icon.png" width="120" alt="Clapet">
</p>

## Features

- **Desktop pet** — walks around, reacts to clicks, drag-and-drop
- **Radial menu** — right-click for actions: Think, Happy, Sleep, Feed, Walk, Settings
- **AI chat** — Ask button to talk with Claude/OpenAI/Groq/etc.
- **Auto-walk** — toggles roaming around the screen
- **Fluent-style icons** — clean SVG icons throughout
- **Settings panel** — configure AI provider, API key, and model
- **Self-contained** — packaged as a Windows installer

## Quick start

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

Output in `dist/`:
- `Clapet-0.1.0-setup.exe` — NSIS installer
- `win-unpacked/Clapet.exe` — portable version

## Tech

- Electron 33
- Vanilla JS (no frameworks)
- `keyspy` for global keyboard detection

## Author

[S1sTeam](https://github.com/S1sTeam)
