const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quality')
        .setDescription('Set audio quality for playback')
        .addStringOption(option =>
            option.setName('level')
                .setDescription('Audio quality level')
                .setRequired(true)
                .addChoices(
                    { name: 'Low (128kbps) - Default', value: '128k' },
                    { name: 'Medium (256kbps)', value: '256k' },
                    { name: 'High (320kbps)', value: '320k' }
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

            const quality = interaction.options.getString('level');
            const bitrate = parseInt(quality);
            player.audioQuality = bitrate;
            player.scheduleStatePersist('quality', 200);

            const qualityNames = {
                '128k': 'Low (128kbps)',
                '256k': 'Medium (256kbps)',
                '320k': 'High (320kbps)'
            };

            const embed = new EmbedBuilder()
                .setTitle('🎵 Audio Quality Changed')
                .setDescription(`Audio quality set to **${qualityNames[quality]}**`)
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields(
                    { name: 'Quality', value: qualityNames[quality], inline: true },
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
            console.error('❌ /quality error:', error);
            await interaction.reply({
                content: '❌ An error occurred while changing audio quality!',
                flags: [1 << 6]
            });
        }
    }
};
