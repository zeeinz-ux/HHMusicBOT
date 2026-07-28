const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('speed')
        .setDescription('Set playback speed')
        .addNumberOption(option =>
            option.setName('rate')
                .setDescription('Playback speed multiplier')
                .setRequired(true)
                .addChoices(
                    { name: '0.5x (Slow)', value: 0.5 },
                    { name: '0.75x', value: 0.75 },
                    { name: '1x (Normal)', value: 1.0 },
                    { name: '1.25x', value: 1.25 },
                    { name: '1.5x', value: 1.5 },
                    { name: '2x (Fast)', value: 2.0 },
                    { name: '3x (Very Fast)', value: 3.0 },
                    { name: '4x (Ultra Fast)', value: 4.0 }
                )
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

            if (!player.currentTrack) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'buttonhandler.no_song_playing'),
                    flags: [1 << 6]
                });
            }

            const speed = interaction.options.getNumber('rate');
            player.setSpeed(speed);

            const speedLabels = {
                0.5: '0.5x (Slow)',
                0.75: '0.75x',
                1.0: '1x (Normal)',
                1.25: '1.25x',
                1.5: '1.5x',
                2.0: '2x (Fast)',
                3.0: '3x (Very Fast)',
                4.0: '4x (Ultra Fast)'
            };

            const embed = new EmbedBuilder()
                .setTitle('⚡ Playback Speed Changed')
                .setDescription(`Speed set to **${speedLabels[speed] || speed + 'x'}**`)
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields(
                    { name: 'Speed', value: speedLabels[speed] || speed + 'x', inline: true },
                    { name: 'Changed by', value: `${member}`, inline: true }
                );

            if (player.currentTrack?.thumbnail) {
                embed.setThumbnail(player.currentTrack.thumbnail);
            }

            await interaction.reply({ embeds: [embed], flags: [1 << 6] });

            if (client.musicEmbedManager) {
                await client.musicEmbedManager.updateNowPlayingEmbed(player);
            }
        } catch (error) {
            console.error('❌ /speed error:', error);
            await interaction.reply({
                content: '❌ An error occurred while changing playback speed!',
                flags: [1 << 6]
            });
        }
    }
};
