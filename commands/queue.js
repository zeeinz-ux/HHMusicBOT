const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

const TRACKS_PER_PAGE = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Display the music queue'),

    async execute(interaction, client) {
        try {
            const guild = interaction.guild;
            const player = client.players.get(guild.id);

            if (!player) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'buttonhandler.no_songs_in_queue'),
                    flags: [1 << 6]
                });
            }

            const queueInfo = player.getQueue();

            if (!queueInfo.current && queueInfo.queue.length === 0) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'buttonhandler.no_songs_in_queue'),
                    flags: [1 << 6]
                });
            }

            const result = this.buildQueueEmbed(player, queueInfo, 0, guild.id);
            await interaction.reply({ embeds: [result.embed], components: result.buttons, flags: [1 << 6] });
        } catch (error) {
            console.error('❌ /queue error:', error);
            await interaction.reply({
                content: '❌ An error occurred while displaying the queue!',
                flags: [1 << 6]
            });
        }
    },

    buildQueueEmbed(player, queueInfo, page, guildId) {
        const totalPages = Math.max(1, Math.ceil(queueInfo.queue.length / TRACKS_PER_PAGE));
        const safePage = Math.max(0, Math.min(page, totalPages - 1));
        const start = safePage * TRACKS_PER_PAGE;

        const embed = new EmbedBuilder()
            .setTitle('🎵 Music Queue')
            .setColor(config.bot.embedColor)
            .setTimestamp();

        if (queueInfo.current) {
            const currentTime = player.getCurrentTime ? player.getCurrentTime() : 0;
            const totalMs = (queueInfo.current.duration || 0) * 1000;
            const progress = this.createProgressBar(currentTime, totalMs);

            embed.addFields({
                name: '▶ Now Playing',
                value: `**[${queueInfo.current.title}](${queueInfo.current.url})**\n${progress}`,
                inline: false
            });
        }

        if (queueInfo.queue.length > 0) {
            let queueText = '';
            const tracks = queueInfo.queue.slice(start, start + TRACKS_PER_PAGE);

            tracks.forEach((track, i) => {
                const idx = start + i + 1;
                const duration = track.duration ? ` \`${this.formatDuration(track.duration)}\`` : '';
                queueText += `\`${idx}.\` **[${track.title}](${track.url})**${duration}\n`;
            });

            embed.addFields({
                name: `📋 Upcoming (${queueInfo.queue.length} songs)`,
                value: queueText,
                inline: false
            });
        }

        embed.setFooter({
            text: `Page ${safePage + 1}/${totalPages} • ${queueInfo.queue.length + (queueInfo.current ? 1 : 0)} songs total`
        });

        const buttons = [];
        if (totalPages > 1) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('queue_prev')
                    .setEmoji('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage === 0),
                new ButtonBuilder()
                    .setCustomId('queue_page_info')
                    .setLabel(`${safePage + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('queue_next')
                    .setEmoji('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage >= totalPages - 1)
            );
            buttons.push(row);
        }

        return { embed, buttons };
    },

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    createProgressBar(currentMs, totalMs, length = 15) {
        if (!totalMs || totalMs === 0) return '▬'.repeat(length);
        const progress = Math.min(currentMs / totalMs, 1);
        const filledLength = Math.round(progress * length);
        const filled = '▬'.repeat(filledLength);
        const empty = '▬'.repeat(length - filledLength);
        const indicator = '🔘';
        if (filledLength === 0) return indicator + empty;
        if (filledLength === length) return filled + indicator;
        return filled + indicator + empty.substring(1);
    }
};
