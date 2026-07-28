const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Toggle autoplay - auto-play related songs when queue is empty')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Autoplay mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Related (Smart)', value: 'related' },
                    { name: 'Genre: Pop', value: 'pop' },
                    { name: 'Genre: Rock', value: 'rock' },
                    { name: 'Genre: Hip Hop', value: 'hiphop' },
                    { name: 'Genre: Electronic', value: 'electronic' },
                    { name: 'Genre: Jazz', value: 'jazz' },
                    { name: 'Genre: Lofi', value: 'lofi' },
                    { name: 'Genre: K-Pop', value: 'kpop' },
                    { name: 'Genre: Anime', value: 'anime' },
                    { name: 'Genre: Random', value: 'random' }
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
                related: '🔗 Related (Smart)',
                pop: '🎵 Pop',
                rock: '🎸 Rock',
                hiphop: '🎤 Hip Hop',
                electronic: '🎧 Electronic',
                jazz: '🎷 Jazz',
                lofi: '☕ Lofi',
                kpop: '🇰🇷 K-Pop',
                anime: '🎌 Anime',
                random: '🎲 Random'
            };

            const status = player.autoplay ? `**${modeLabels[mode]}**` : 'Off';
            const description = player.autoplay
                ? `Autoplay is now ${status}.\nWhen the queue is empty, the bot will auto-play ${mode === 'related' ? 'songs related to the last played track' : mode + ' music'}.`
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
