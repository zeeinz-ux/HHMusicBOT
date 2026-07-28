const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('find')
        .setDescription('Search for a song in the queue')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name or artist to search for')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        try {
            const guild = interaction.guild;
            const member = interaction.member;
            const player = client.players.get(guild.id);

            if (!member.voice.channel) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'modalhandler.voice_channel_required'),
                    flags: [1 << 6]
                });
            }

            if (!player) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'modalhandler.no_music_playing'),
                    flags: [1 << 6]
                });
            }

            if (player.voiceChannel.id !== member.voice.channel.id) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'modalhandler.same_channel_required'),
                    flags: [1 << 6]
                });
            }

            const query = interaction.options.getString('query').toLowerCase();
            const matches = [];

            if (player.currentTrack) {
                const title = player.currentTrack.title?.toLowerCase() || '';
                const artist = player.currentTrack.artist?.toLowerCase() || '';
                if (title.includes(query) || artist.includes(query)) {
                    matches.push({
                        index: '▶',
                        track: player.currentTrack,
                        isCurrent: true
                    });
                }
            }

            player.queue.forEach((track, i) => {
                const title = track.title?.toLowerCase() || '';
                const artist = track.artist?.toLowerCase() || '';
                if (title.includes(query) || artist.includes(query)) {
                    matches.push({
                        index: i + 1,
                        track: track,
                        isCurrent: false
                    });
                }
            });

            if (matches.length === 0) {
                return await interaction.reply({
                    content: `🔍 No songs matching **${query}** in the queue.`,
                    flags: [1 << 6]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`🔍 Queue Search: ${query}`)
                .setColor(config.bot.embedColor)
                .setTimestamp();

            const results = matches.slice(0, 15).map(m => {
                const duration = m.track.duration ? ` \`[${this.formatDuration(m.track.duration)}]\`` : '';
                return `\`${m.index}.\` **${m.track.title}**${duration}`;
            });

            embed.setDescription(results.join('\n'));

            if (matches.length > 15) {
                embed.setFooter({ text: `...and ${matches.length - 15} more matches` });
            }

            await interaction.reply({ embeds: [embed], flags: [1 << 6] });
        } catch (error) {
            console.error('❌ /find error:', error);
            await interaction.reply({
                content: '❌ An error occurred while searching the queue!',
                flags: [1 << 6]
            });
        }
    },

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
};
