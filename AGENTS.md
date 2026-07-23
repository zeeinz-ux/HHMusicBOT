# MusicBot (HHMusic v16.0) — Agent Guide

## Quick Start

```bash
npm install                       # install deps + auto-updates yt-dlp (postinstall)
# edit .env with Discord token + client ID
npm start                         # node index.js (normal mode, <1000 servers)
node shard.js                     # sharding mode (1000+ servers)
npm test                          # node --check index.js (syntax check only)
```

## Key Architecture

- **Entrypoints**: `index.js` (bot client), `shard.js` (ShardingManager spawning `index.js` workers)
- **Config**: `config.js` reads `.env` via `dotenv` — all settings have defaults
- **Commands** (`commands/`): 14 slash commands — `play`, `search`, `nowplaying`, `queue`, `skip`, `stop`, `pause`, `resume`, `shuffle`, `loop`, `language`, `help`, `spotify-login`, `spotify-code`
- **Events** (`events/`): `buttonHandler.js`, `modalHandler.js` — UI interaction handlers
- **Core engine**: `src/MusicPlayer.js` (~2400 lines), `src/PlayerStateManager.js` (crash recovery)
- **Music sources**: `src/YouTube.js`, `src/Spotify.js`, `src/SoundCloud.js`, `src/DirectLink.js`
- **Persistence**: `database/` — JSON files (`languages.json`, `playerState.json`, `spotify_token.json`)
- **Audio cache**: `audio_cache/` — `track_[MD5].opus` files, cleaned on startup

## Non-Obvious Facts

- **5-second startup delay** (`index.js:539`): `commandLoader.js` is `require`d at line 22 but the `Client` creation is wrapped in `setTimeout(() => {...}, 5000)` to let slash commands register via REST API before connecting.
- **`commandLoader.js` side-effect import**: Required at `index.js:22` purely for its side effect (registers slash commands via Discord REST API). No exported bindings used.
- **YouTube auth priority** (`src/YouTube.js:21-45`): PO Token (`YOUTUBE_PO_TOKEN`/`PO_TOKEN`) > Browser Cookie > Cookie File > Android client (fallback). Android client bypasses bot detection on VPS/server IPs.
- **`COOKIES_CONTENT` env var** (`index.js:12-20`): If set, writes its content to the configured `cookiesFilePath` at startup — useful for platforms like Railway that can't mount a file.
- **Session recovery**: On restart, `PlayerStateManager` restores active players from `database/playerState.json`, reconnects to voice channels, and resumes playback.
- **Spotify OAuth flow** (`src/Spotify.js`): The bot runs an HTTP server on port 3000 to handle the OAuth callback. The refresh token is persisted to `database/spotify_token.json` AND the env var `SPOTIFY_REFRESH_TOKEN` (for Railway persistence).
- **Sharding config** (via `.env`): `TOTAL_SHARDS` (default `auto`), `SHARD_MODE` (`process`/`worker`), `SHARD_SPAWN_DELAY` (5500ms), `SHARD_SPAWN_TIMEOUT` (30000ms).
- **Inactivity auto-pause** (`index.js:387-400`): Bot pauses when alone in voice channel; resumes when someone re-joins. Also pauses/resumes on server mute/deafen.
- **No test framework, no linter, no formatter, no TypeScript** — pure CommonJS JavaScript.
- **Required Node.js**: `>=24.11.1` (enforced via `package.json` engines).
- **ffmpeg bundled** via `ffmpeg-static` — no system install needed.
- **Postinstall hook**: `scripts/update-ytdlp.js` auto-updates yt-dlp binary (critical — YouTube breaks older versions frequently).
- **`.gitignore` exists** (tracks `node_modules/`, `audio_cache/`, `database/`, `cookies.txt`, `.env`).
- **`database/` is gitignored** — player state, language prefs, and Spotify tokens are local-only.
- **22 language packs** in `languages/` (not 21 — includes Czech `cs.json`).
- **Dockerfile**: `node:24-slim` base, installs system python3 + ffmpeg, `EXPOSE 10000`.
