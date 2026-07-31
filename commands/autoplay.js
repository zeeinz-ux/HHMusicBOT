const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Toggle autoplay - auto-play similar songs when the queue is empty')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Autoplay mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'On (Similar to current song)', value: 'related' }
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

            const mode = interaction.options.getString('mode');

            if (mode === 'off') {
                player.autoplay = false;
            } else {
                player.autoplay = mode;
            }

            player.scheduleStatePersist('autoplay', 200);

            const modeLabels = {
                off: '❌ Off',
                related: '🔗 Similar to current song'
            };

            const status = player.autoplay ? `**${modeLabels[mode]}**` : 'Off';
            const description = player.autoplay
                ? `Autoplay is now ${status}.\nWhen the queue is empty, the bot will auto-play songs similar to the last played track.`
                : 'Autoplay is now **Off**.';

            const embed = new EmbedBuilder()
                .setTitle('🎵 Autoplay Settings')
                .setDescription(description)
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields(
                    { name: 'Mode', value: status, inline: true },
                    { name: 'Changed by', value: `${member}`, inline: true }
                );

            await interaction.reply({ embeds: [embed], flags: [1 << 6] });
        } catch (error) {
            console.error('❌ /autoplay error:', error);
            await interaction.reply({
                content: '❌ An error occurred while changing autoplay settings!',
                flags: [1 << 6]
            });
        }
    }
};
