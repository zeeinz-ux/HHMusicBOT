const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the music queue'),

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

            if (player.queue.length < 2) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'buttonhandler.minimum_songs_shuffle'),
                    flags: [1 << 6]
                });
            }

            player.shuffleQueue();

            const embed = new EmbedBuilder()
                .setTitle(await LanguageManager.getTranslation(guild.id, 'buttonhandler.queue_shuffled_title'))
                .setDescription(await LanguageManager.getTranslation(guild.id, 'buttonhandler.songs_shuffled', { count: player.queue.length }))
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields({
                    name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.shuffled_by'),
                    value: `${member}`,
                    inline: true
                });

            if (player.queue.length > 0) {
                const nextTracks = player.queue.slice(0, 3);
                let trackList = '';
                nextTracks.forEach((track, index) => {
                    trackList += `${index + 1}. **[${track.title}](${track.url})**\n`;
                });

                embed.addFields({
                    name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.next_songs'),
                    value: trackList,
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], flags: [1 << 6] });

            if (client.musicEmbedManager) {
                await client.musicEmbedManager.updateNowPlayingEmbed(player);
            }
        } catch (error) {
            console.error('❌ /shuffle error:', error);
            await interaction.reply({
                content: '❌ An error occurred while trying to shuffle!',
                flags: [1 << 6]
            });
        }
    }
};
