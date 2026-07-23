const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

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

            const embed = new EmbedBuilder()
                .setTitle(await LanguageManager.getTranslation(guild.id, 'buttonhandler.play_queue_title'))
                .setColor(config.bot.embedColor)
                .setTimestamp();

            if (queueInfo.current) {
                const currentTime = player.getCurrentTime ? player.getCurrentTime() : 0;
                const totalMs = (queueInfo.current.duration || 0) * 1000;
                const progress = this.createProgressBar(currentTime, totalMs);

                embed.addFields({
                    name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.now_playing'),
                    value: `**[${queueInfo.current.title}](${queueInfo.current.url})**\n${progress}`,
                    inline: false
                });
            }

            if (queueInfo.queue.length > 0) {
                let queueText = '';
                const tracks = queueInfo.queue.slice(0, 10);

                tracks.forEach((track, index) => {
                    queueText += `\`${index + 1}.\` **[${track.title}](${track.url})**\n`;
                });

                if (queueInfo.queue.length > 10) {
                    queueText += `\n*${await LanguageManager.getTranslation(guild.id, 'buttonhandler.and_more', { count: queueInfo.queue.length - 10 })}*`;
                }

                embed.addFields({
                    name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.upcoming_songs', { count: queueInfo.queue.length }),
                    value: queueText,
                    inline: false
                });
            }

            embed.setFooter({
                text: await LanguageManager.getTranslation(guild.id, 'buttonhandler.total_songs', { count: queueInfo.queue.length + (queueInfo.current ? 1 : 0) })
            });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ /queue error:', error);
            await interaction.reply({
                content: '❌ An error occurred while displaying the queue!',
                flags: [1 << 6]
            });
        }
    },

    createProgressBar(current, total, length = 15) {
        if (!total || total === 0) return '▬'.repeat(length);

        const currentMs = typeof current === 'number' ? current : 0;
        const progress = Math.min(currentMs / total, 1);
        const filledLength = Math.round(progress * length);

        const filled = '▬'.repeat(filledLength);
        const empty = '▬'.repeat(length - filledLength);
        const indicator = '🔘';

        if (filledLength === 0) {
            return indicator + empty;
        } else if (filledLength === length) {
            return filled + indicator;
        } else {
            return filled + indicator + empty.substring(1);
        }
    }
};
