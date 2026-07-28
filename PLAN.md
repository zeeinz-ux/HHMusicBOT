# HHMusic — Advanced Features Plan (Phase 2)

## Status Phase 1 — Completed ✅

| Feature | Commit |
|---------|--------|
| Audio Filters (`/filter`) | `f8ca74e` |
| Crossfade (`/crossfade`) | `6f4636c` |
| Queue Search (`/find`) | `b3eb0ea` |
| Lyrics Fix (LRCLIB first) | `fbef3d7` |
| Sound Quality (`/quality`) | `8760c39` |

---

## Phase 2A: Auto-Play Recommendations

### Goal
Queue kosong → bot otomatis putar lagu serupa. Gak perlu `/play` lagi.

### How It Works
1. Saat queue habis dan `autoplay === true`, bot ambil YouTube video serupa dari `related` yt-dlp data
2. `YouTube.getRelated(videoUrl)` — fetch related videos via yt-dlp `--flat-playlist` or `--dump-json` with related
3. Max 10 autoplay tracks, shuffle, add ke queue
4. User bisa toggle: `/autoplay on|off`

### Files to Modify
| File | Change |
|------|--------|
| `src/YouTube.js` (new method) | `getRelated(videoUrl)` — fetch related videos from YouTube |
| `src/MusicPlayer.js:1554` | In `handleTrackEnd()`, after queue empty, check autoplay → fetch related |
| `commands/autoplay.js` | New slash command: `/autoplay on|off` |
| `src/MusicPlayer.js` | Add `this.autoplay` property (already exists at line 73) |
| `src/MusicPlayer.js` state | Autoplay already persisted in session state |

### Implementation Detail
```
handleTrackEnd():
  if (queue.length === 0 && this.autoplay && finishedTrack?.youtubeUrl) {
    const related = await YouTube.getRelated(finishedTrack.youtubeUrl, this.guild.id);
    if (related?.length) {
      const shuffled = related.sort(() => Math.random() - 0.5);
      this.queue.push(...shuffled.slice(0, 10));
      await this.play(null, 0);
      return;
    }
  }
  // ... existing queue completed logic
```

### Risk: LOW
- Additive to handleTrackEnd()
- If autoplay is off (default), behavior identical to current
- YouTube.getRelated() is new method, doesn't touch existing getStream()

---

## Phase 2B: Speed Control

### Goal
User bisa atur playback speed: 0.5x, 0.75x, 1x (normal), 1.25x, 1.5x, 2x.

### Files to Modify
| File | Change |
|------|--------|
| `src/MusicPlayer.js` | Add `this.playbackSpeed = 1.0` |
| `src/MusicPlayer.js:950-960` | FFmpeg args — add `-af` speed filter: `atempo=1.5` |
| `src/MusicPlayer.js:993-1005` | Same for file mode |
| `commands/speed.js` | New slash command: `/speed 0.5x|0.75x|1x|1.25x|1.5x|2x` |
| `src/MusicPlayer.js` state | Persist `playbackSpeed` |

### Implementation Detail
```
_buildFilterArgs():
  const args = [];
  if (this.currentFilter) {
    args.push('-af', config.audio.filters[this.currentFilter]);
  }
  if (this.playbackSpeed !== 1.0) {
    // atempo only accepts 0.5-2.0, chain multiple for extreme values
    const speed = this.playbackSpeed;
    if (speed >= 0.5 && speed <= 2.0) {
      args.push('-af', `atempo=${speed}`);
    } else if (speed > 2.0) {
      // Chain: atempo=2.0,atempo=1.5 = 3x
      args.push('-af', `atempo=2.0,atempo=${speed / 2}`);
    }
  }
  return args;
```

### Risk: LOW
- FFmpeg `atempo` filter is well-tested
- Combined with existing filter args (chain them)
- Default 1x = no change

---

## Phase 2C: Now Playing Auto-Update

### Goal
Embed now-playing auto-update setiap detik — progress bar gerak, timer countdown.

### Files to Modify
| File | Change |
|------|--------|
| `src/MusicEmbedManager.js` (new method) | `startProgressUpdate(player)` — setInterval update embed |
| `src/MusicEmbedManager.js` (new method) | `stopProgressUpdate(guildId)` — clearInterval |
| `src/MusicPlayer.js:1041` | After `audioPlayer.play()`, start progress update |
| `src/MusicPlayer.js` (play/pause/stop) | Stop progress update on state change |

### Implementation Detail
```
startProgressUpdate(player):
  const guildId = player.guild.id;
  if (this.progressIntervals.has(guildId)) return;
  
  const interval = setInterval(async () => {
    if (!player.currentTrack) { stop; return; }
    const elapsed = player.getCurrentTime();
    const total = player.currentTrack.duration * 1000;
    const progress = this.createProgressBar(elapsed, total);
    await this.updateNowPlayingEmbed(player, progress);
  }, 10000); // every 10 seconds
  
  this.progressIntervals.set(guildId, interval);

createProgressBar(elapsedMs, totalMs):
  const barLength = 20;
  const filled = Math.round((elapsedMs / totalMs) * barLength);
  const empty = barLength - filled;
  return `progress bar: [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${formatTime(elapsedMs)}/${formatTime(totalMs)}`;
```

### Risk: LOW
- 10s interval is gentle on API
- Stops automatically when track ends or player stops
- Doesn't affect playback performance

---

## Phase 2D: Queue Pagination

### Goal
`/queue` pakai buttons untuk navigate halaman. Queue 50+ lagu tetap rapi.

### Files to Modify
| File | Change |
|------|--------|
| `commands/queue.js` | Refactor: split queue into pages, add ActionRow buttons |
| `events/buttonHandler.js` | Handle `queue_prev` / `queue_next` button clicks |

### Implementation Detail
```
/queue shows page 1 (tracks 1-10):
  [◀ Prev] [Page 1/5] [Next ▶]

buttonHandler handles queue_prev/queue_next:
  - Update page number
  - Re-render embed with different slice of queue
  - Edit reply with new embed + updated buttons
```

### Risk: LOW
- Only changes queue display logic
- No effect on playback

---

## Priority Order

| # | Feature | Effort | Impact | Risk |
|---|---------|--------|--------|------|
| 1 | Speed Control | Small | High | Low |
| 2 | Now Playing Auto-Update | Medium | High | Low |
| 3 | Auto-Play Recommendations | Medium | High | Low |
| 4 | Queue Pagination | Small | Medium | Low |

---

## Testing Checklist

- [ ] `/autoplay on` — queue habis, lagu serupa auto-play
- [ ] `/autoplay off` — queue habis, bot idle
- [ ] `/speed 1.5x` — lagu putar lebih cepat
- [ ] `/speed 2x` — double speed
- [ ] `/speed 0.75x` — lagu putar lebih lambat
- [ ] `/speed 1x` — balik normal
- [ ] Now-playing embed update setiap 10 detik
- [ ] `/queue` dengan 20+ lagu — buttons navigation jalan
- [ ] Filter + speed combo jalan bersama
- [ ] Session restore with speed/pagination state
- [ ] `node --check index.js` passes after each change
