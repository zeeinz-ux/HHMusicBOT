const path = require('path');
const fs = require('fs');

// Use STATE_DIR env var (Railway volume) when set, otherwise default to local database/
const stateDir = process.env.STATE_DIR || path.join(__dirname, '..');
const DB_FILE_PATH = path.join(stateDir, 'database', 'playerState.json');

class PlayerStateManager {
    constructor() {
        this.filePath = DB_FILE_PATH;
        this.ensureFileExists();
    }

    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify({ players: {} }, null, 4), 'utf8');
        }
    }

    readDatabase() {
        try {
            const content = fs.readFileSync(this.filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('❌ Failed to read database:', error.message);
            return { players: {} };
        }
    }

    writeDatabase(data) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 4), 'utf8');
        } catch (error) {
            console.error('❌ Failed to write database:', error.message);
        }
    }

    sanitizeState(state = {}) {
        try {
            return JSON.parse(JSON.stringify(state));
        } catch (error) {
            return {};
        }
    }

    async saveState(guildId, state) {
        if (!guildId || !state) return;

        const payload = this.sanitizeState({
            ...state,
            updatedAt: Date.now()
        });

        try {
            const db = this.readDatabase();
            if (!db.players) db.players = {};
            db.players[guildId] = payload;
            this.writeDatabase(db);
        } catch (error) {
            console.error(`❌ Failed to save player state for guild ${guildId}:`, error);
        }
    }

    getState(guildId) {
        if (!guildId) return null;

        try {
            const db = this.readDatabase();
            return db.players?.[guildId] || null;
        } catch (error) {
            return null;
        }
    }

    getAllStates() {
        try {
            const db = this.readDatabase();
            const players = db.players || {};
           return players;
        } catch (error) {
            return {};
        }
    }

    async removeState(guildId) {
        if (!guildId) return;

        try {
            const db = this.readDatabase();
            if (db.players && db.players[guildId]) {
                delete db.players[guildId];
                this.writeDatabase(db);
            }
        } catch (error) {
            // Already removed or never existed
        }
    }

    async clearAllStates() {
        try {
            this.writeDatabase({ players: {} });
        } catch (error) {
            // Ignore if fails
        }
    }

    getProtectedCacheFiles() {
        const states = this.getAllStates();
        const protectedFiles = new Set();

        for (const guildId of Object.keys(states)) {
            const state = states[guildId];
            if (!state) continue;

            // Only the actively-playing file must survive cleanup. Preloaded-but-idle
            // files (e.g. the whole queue preloaded via sequentialPreload) can be
            // re-downloaded on demand, so protecting them lets the cache grow
            // unbounded over a long session and fills the volume (Errno 28).
            if (state.currentDownloadedFile) {
                protectedFiles.add(path.resolve(state.currentDownloadedFile));
            }
        }

        return protectedFiles;
    }
}

module.exports = new PlayerStateManager();
