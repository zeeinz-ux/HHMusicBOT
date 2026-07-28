const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Apply audio filter to current playback')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Audio filter to apply')
                .setRequired(true)
                .addChoices(
                    { name: 'None (Remove filter)', value: 'none' },
                    { name: 'Bass Boost', value: 'bassboost' },
                    { name: 'Nightcore', value: 'nightcore' },
                    { name: 'Vaporwave', value: 'vaporwave' },
                    { name: '8D Audio', value: '_8d' }
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

            const filterName = interaction.options.getString('name');
            const filterEmojis = {
                bassboost: '🔊',
                nightcore: '⚡',
                vaporwave: '🌊',
                _8d: '🌀',
                none: '❌'
            };

            if (filterName === 'none') {
                player.removeFilter();
                const embed = new EmbedBuilder()
                    .setTitle('🎵 Filter Removed')
                    .setDescription('Audio filter has been removed. Playing original audio.')
                    .setColor(config.bot.embedColor)
                    .setTimestamp()
                    .addFields({
                        name: 'Changed by',
                        value: `${member}`,
                        inline: true
                    });

                if (player.currentTrack?.thumbnail) {
                    embed.setThumbnail(player.currentTrack.thumbnail);
                }

                return await interaction.reply({ embeds: [embed], flags: [1 << 6] });
            }

            player.setFilter(filterName);

            const filterNames = {
                bassboost: 'Bass Boost',
                nightcore: 'Nightcore',
                vaporwave: 'Vaporwave',
                _8d: '8D Audio'
            };

            const embed = new EmbedBuilder()
                .setTitle(`${filterEmojis[filterName]} Filter Applied`)
                .setDescription(`**${filterNames[filterName]}** filter is now active.`)
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields({
                    name: 'Changed by',
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
            console.error('❌ /filter error:', error);
            await interaction.reply({
                content: '❌ An error occurred while changing audio filter!',
                flags: [1 << 6]
            });
        }
    }
};
