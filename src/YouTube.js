const youtubedl = require('./ytdlp-exec');
const config = require('../config');
const LanguageManager = require('./LanguageManager');

class YouTube {
    // yt-dlp için ortak parametreleri döndüren yardımcı fonksiyon
    static getYtDlpOptions(extraOptions = {}) {
        const baseOptions = {
            noCheckCertificates: true,
            noWarnings: true,
            retries: 3,
            fragmentRetries: 3,
            noCacheDir: true,
            jsRuntimes: 'node',
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            ],
            ...extraOptions
        };

        // yt-dlp 2026.07+ player_client behavior:
        //   - Without cookies: default = visionos,android_vr,web (web omitted if no JS runtime)
        //   - WITH cookies:    default = tv_downgraded,web (free) or tv_downgraded,web_creator,web (premium)
        //   - Some clients (tv,mweb,android_vr,visionos) DON'T support cookie auth!
        //
        // So: if cookies are present, DON'T override — let yt-dlp auto-select.
        // Only override when NO cookies to force clients that work without auth.
        const hasCookies = !!(config.ytdl.cookiesFile || config.ytdl.cookiesFromBrowser || process.env.COOKIES_CONTENT);

        if (hasCookies) {
            // yt-dlp will use tv_downgraded,web — best for cookie auth
            if (config.ytdl.poToken) {
                baseOptions.extractorArgs = `youtube:po_token=${config.ytdl.poToken}`;
            }
        } else {
            const clientArgs = 'youtube:player_client=tv,mweb,android_vr,visionos';
            if (config.ytdl.poToken) {
                baseOptions.extractorArgs = `youtube:po_token=${config.ytdl.poToken};${clientArgs}`;
            } else {
                baseOptions.extractorArgs = clientArgs;
            }
        }

        const fs = require('fs');
        const p = require('path');
        const os = require('os');
        const tmpCookiePath = p.join(os.tmpdir(), 'hhmusic-cookies.txt');

        if (config.ytdl.cookiesFromBrowser) {
            // yt-dlp manage temp file sendiri untuk cookies dari browser
            baseOptions.cookiesFromBrowser = config.ytdl.cookiesFromBrowser;
        } else {
            let srcPath = null;
            if (config.ytdl.cookiesFile) {
                srcPath = p.resolve(config.ytdl.cookiesFile);
            } else if (fs.existsSync(tmpCookiePath)) {
                srcPath = tmpCookiePath;
            } else if (fs.existsSync('/etc/secrets/cookies.txt')) {
                srcPath = '/etc/secrets/cookies.txt';
            } else if (fs.existsSync('/tmp/cookies.txt')) {
                srcPath = '/tmp/cookies.txt';
            }
            if (srcPath) {
                try {
                    const content = fs.readFileSync(srcPath, 'utf-8');
                    fs.writeFileSync(tmpCookiePath, content, 'utf-8');
                    baseOptions.cookies = tmpCookiePath;
                } catch (e) {
                    console.warn(`[YouTube] Failed to use cookies from ${srcPath}: ${e.message}`);
                }
            }
        }

        if (config.ytdl.proxy) {
            baseOptions.proxy = config.ytdl.proxy;
        }

        return baseOptions;
    }

    // Logs the bundled yt-dlp binary version once per process. Useful for diagnosing
    // "is the binary stale?" regressions like the 2026.04 iOS-PO-Token requirement.
    static _loggedBinaryVersion = false;
    static async _logBinaryVersionOnce() {
        if (this._loggedBinaryVersion) return;
        this._loggedBinaryVersion = true;
        try {
            const { execFileSync } = require('child_process');
            const path = require('path');
            const bin = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin',
                process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
            const ver = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
            console.log(`[YouTube] yt-dlp binary version: ${ver}`);
        } catch (e) {
            console.warn(`[YouTube] Could not detect yt-dlp binary version: ${e.message}`);
        }
    }

    static async search(query, limit = 1, guildId = null) {
        try {
            await this._logBinaryVersionOnce();

            // If it's already a YouTube URL, get info directly
            if (this.isYouTubeURL(query)) {
                const info = await this.getInfo(query, guildId);
                return info ? [info] : [];
            }

            // Use yt-dlp for YouTube search
            const searchQuery = `ytsearch${limit}:${query}`;

            const results = await youtubedl(searchQuery, this.getYtDlpOptions({
                dumpSingleJson: true,
                flatPlaylist: true,
            }));

            if (!results || !results.entries) {

                return [];
            }

            const tracks = [];
            for (const item of results.entries.slice(0, limit)) {
                try {
                    // Debug: log item structure


                    const unknownTitle = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_title') : 'Unknown Title';
                    const unknownArtist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_artist') : 'Unknown Artist';

                    const track = {
                        title: item.title || item.fulltitle || unknownTitle,
                        artist: item.uploader || item.channel || unknownArtist,
                        url: item.webpage_url || item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : null),
                        duration: item.duration || 0,
                        thumbnail: item.thumbnail,
                        platform: 'youtube',
                        type: 'track',
                        id: item.id,
                        views: item.view_count,
                        uploadDate: item.upload_date,
                        description: item.description,
                    };

                    // If duration is missing from search, try to get it from getInfo
                    if (!track.duration || track.duration === 0) {

                        const detailedInfo = await this.getInfo(track.url, guildId);
                        if (detailedInfo && detailedInfo.duration) {
                            track.duration = detailedInfo.duration;

                        }
                    }

                    tracks.push(track);
                } catch (error) {
                    continue;
                }
            }


            return tracks;

        } catch (error) {
            console.error('[YouTube] search() failed:', error.message || error);
            return [];
        }
    }

    static async getInfo(url, guildId = null) {
        try {
            await this._logBinaryVersionOnce();

            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
                preferFreeFormats: true,
                format: 'ba/b',
            }));

            if (!info) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_info_returned') : 'No info returned from youtube-dl';
                throw new Error(errorMsg);
            }

            const unknownTitle = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_title') : 'Unknown Title';
            const unknownArtist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_artist') : 'Unknown Artist';

            const track = {
                title: info.title || unknownTitle,
                artist: info.uploader || info.channel || unknownArtist,
                url: info.webpage_url || url,
                duration: info.duration || 0,
                thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
                platform: 'youtube',
                type: 'track',
                id: info.id,
                views: info.view_count,
                uploadDate: info.upload_date,
                description: info.description,
                formats: info.formats,
            };


            return track;

        } catch (error) {
            console.error('[YouTube] getInfo() failed:', error.message || error);
            return null;
        }
    }

    static async getStream(url, guildId = null, startSeconds = 0) {
        try {
            await this._logBinaryVersionOnce();

            if (!url) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.url_required') : 'URL is required';
                throw new Error(errorMsg);
            }

            // Spawn yt-dlp as a direct stream to stdout — avoids 403 on fetch
            const { spawn } = require('child_process');

            // Don't use cookies for streaming — they trigger n-challenge which fails.
            // player_client=tv,mweb,android_vr,visionos works without cookies.
            const flags = this.getYtDlpOptions({
                output: '-',
                format: 'ba/b',
            });
            delete flags.cookies;
            delete flags.cookiesFromBrowser;

            const args = [url];
            for (const [key, val] of Object.entries(flags)) {
                if (val === false || val === null || val === undefined) continue;
                const k = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
                if (val === true) {
                    args.push(`--${k}`);
                } else if (Array.isArray(val)) {
                    for (const v of val) args.push(`--${k}`, String(v));
                } else {
                    args.push(`--${k}`, String(val));
                }
            }

            // Get metadata first (dumpSingleJson)
            const info = await youtubedl(url, this.getYtDlpOptions({ dumpSingleJson: true }));

            const duration = info?.duration || 0;
            const bitrate = info?.abr || info?.tbr || 0;

            // Spawn the streaming process
            const ytdlpStream = spawn(youtubedl.binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

            // Collect stderr for debugging (keep only last line)
            let stderrLast = '';
            ytdlpStream.stderr.on('data', d => {
                const lines = d.toString().trim().split('\n');
                stderrLast = lines[lines.length - 1] || stderrLast;
            });

            // Small delay to catch immediate spawn errors
            await new Promise(resolve => setImmediate(resolve));

            return {
                stream: ytdlpStream.stdout,
                url: null,
                rawUrl: null,
                type: info?.acodec?.includes('opus') ? 'opus' : 'arbitrary',
                duration,
                bitrate,
                canSeek: false,
                format: info?.format || 'unknown',
                httpHeaders: {}
            };

        } catch (error) {
            throw error;
        }
    }

    static async getPlaylist(url, guildId = null) {
        try {

            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
                flatPlaylist: true,
            }));

            if (!info) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_playlist_info') : 'No playlist info found';
                throw new Error(errorMsg);
            }

            if (!info.entries || info.entries.length === 0) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_playlist_entries') : 'No playlist entries found';
                throw new Error(errorMsg);
            }

            const unknownTitle = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_title') : 'Unknown Title';
            const unknownArtist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_artist') : 'Unknown Artist';

            const tracks = [];
            for (const entry of info.entries.slice(0, config.bot.maxPlaylistSize)) {
                if (entry && (entry.id || entry.url)) {
                    try {
                        const track = {
                            title: entry.title || entry.fulltitle || unknownTitle,
                            artist: entry.uploader || entry.channel || entry.uploader_id || unknownArtist,
                            url: entry.webpage_url || entry.url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null),
                            duration: entry.duration || 0,
                            thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url,
                            platform: 'youtube',
                            type: 'track',
                            id: entry.id,
                        };

                        if (track.url) {
                            tracks.push(track);
                        }
                    } catch (entryError) {
                        continue;
                    }
                }
            }

            if (tracks.length === 0) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_valid_tracks') : 'No valid tracks found in playlist';
                throw new Error(errorMsg);
            }

            const unknownPlaylist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_playlist') : 'Unknown Playlist';

            return {
                title: info.title || unknownPlaylist,
                tracks: tracks,
                totalTracks: info.playlist_count || tracks.length,
                url: url,
                platform: 'youtube',
                type: 'playlist',
            };

        } catch (error) {
            console.error('[YouTube] getPlaylist() failed:', error.message || error);
            return null;
        }
    }

    static isYouTubeURL(url) {
        const patterns = [
            /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/playlist\?list=)/,
            /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/,
            /^https?:\/\/(www\.)?youtube\.com\/v\/[a-zA-Z0-9_-]+/,
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    static isPlaylist(url) {
        return url.includes('list=') &&
            (url.includes('youtube.com/playlist') ||
                url.includes('youtube.com/watch') ||
                url.includes('youtu.be'));
    }

    static parseDuration(durationString) {
        if (!durationString) return 0;

        // Handle formats like "3:45", "1:23:45", etc.
        const parts = durationString.split(':').reverse();
        let seconds = 0;

        for (let i = 0; i < parts.length; i++) {
            seconds += parseInt(parts[i]) * Math.pow(60, i);
        }

        return seconds;
    }

    static formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0:00';

        // Ensure we work with integers to avoid floating point errors
        const totalSeconds = Math.floor(Number(seconds) || 0);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const remainingSeconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    static async getRelatedVideos(videoId, limit = 5) {
        try {
            // This would implement getting related videos
            // For now, return empty array as YouTube API v3 doesn't provide related videos

            return [];
        } catch (error) {
            return [];
        }
    }

    static extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]+)/,
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    static extractPlaylistId(url) {
        const match = url.match(/[&?]list=([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    static createThumbnailUrl(videoId, quality = 'maxresdefault') {
        return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    }

    static createVideoUrl(videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    static async validateUrl(url) {
        try {
            if (!this.isYouTubeURL(url)) {
                return false;
            }

            // Try to get basic info to validate
            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
                skipDownload: true,
            }));

            return !!info && !!info.title;
        } catch (error) {
            return false;
        }
    }

    static async getRelated(url, guildId = null) {
        try {
            await this._logBinaryVersionOnce();
            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
            }));

            // Extract related video URLs from yt-dlp metadata
            const related = (info?.related || [])
                .filter(v => v && v.url && v.title)
                .slice(0, 15)
                .map(v => ({
                    title: v.title,
                    url: v.url,
                    duration: v.duration || 0,
                    thumbnail: v.thumbnail || this.createThumbnailUrl(this.extractVideoId(v.url)),
                    platform: 'youtube',
                    artist: v.uploader || v.channel || 'Unknown'
                }));

            // Fallback: if no related videos, use playlist entries or similar
            if (related.length === 0 && info?.playlist && Array.isArray(info.playlist)) {
                return info.playlist
                    .filter(v => v && v.url && v.title && v.url !== url)
                    .slice(0, 15)
                    .map(v => ({
                        title: v.title,
                        url: v.url,
                        duration: v.duration || 0,
                        thumbnail: v.thumbnail || this.createThumbnailUrl(this.extractVideoId(v.url)),
                        platform: 'youtube',
                        artist: v.uploader || v.channel || 'Unknown'
                    }));
            }

            return related;
        } catch (error) {
            console.error('[YouTube] getRelated() failed:', error.message || error);
            return [];
        }
    }
}

module.exports = YouTube;
