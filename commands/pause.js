const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the currently playing music'),

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

            if (player.paused) {
                return await interaction.reply({
                    content: '⏸️ Music is already paused!',
                    flags: [1 << 6]
                });
            }

            player.pause();

            const embed = new EmbedBuilder()
                .setTitle('⏸️ ' + await LanguageManager.getTranslation(guild.id, 'buttonhandler.music_paused'))
                .setDescription(`**[${player.currentTrack.title}](${player.currentTrack.url})**`)
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields({
                    name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.action_by'),
                    value: `${member}`,
                    inline: true
                });

            if (player.currentTrack?.thumbnail) {
                embed.setThumbnail(player.currentTrack.thumbnail);
            }

            await interaction.reply({ embeds: [embed], flags: [1 << 6] });

            if (client.musicEmbedManager) {
                await client.musicEmbedManager.updateNowPlayingEmbed(player);
            }
        } catch (error) {
            console.error('❌ /pause error:', error);
            await interaction.reply({
                content: '❌ An error occurred while trying to pause!',
                flags: [1 << 6]
            });
        }
    }
};
