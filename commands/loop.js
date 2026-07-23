const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set loop mode (off / track / queue)')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Track', value: 'track' },
                    { name: 'Queue', value: 'queue' }
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

            const mode = interaction.options.getString('mode');
            let newLoopMode;
            let modeMessage;
            let modeEmoji;

            if (mode === 'track') {
                newLoopMode = 'track';
                modeMessage = await LanguageManager.getTranslation(guild.id, 'buttonhandler.loop_mode_track');
                modeEmoji = '🔂';
            } else if (mode === 'queue') {
                newLoopMode = 'queue';
                modeMessage = await LanguageManager.getTranslation(guild.id, 'buttonhandler.loop_mode_queue');
                modeEmoji = '🔁';
            } else {
                newLoopMode = false;
                modeMessage = await LanguageManager.getTranslation(guild.id, 'buttonhandler.loop_mode_off');
                modeEmoji = '➡️';
            }

            player.loop = newLoopMode;

            const embed = new EmbedBuilder()
                .setTitle(`${modeEmoji} ${await LanguageManager.getTranslation(guild.id, 'buttonhandler.loop_mode_changed_title')}`)
                .setDescription(modeMessage)
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields({
                    name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.changed_by'),
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
            console.error('❌ /loop error:', error);
            await interaction.reply({
                content: '❌ An error occurred while changing loop mode!',
                flags: [1 << 6]
            });
        }
    }
};
