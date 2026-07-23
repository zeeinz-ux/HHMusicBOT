const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and clear the queue'),

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

            const queueLength = player.queue.length;
            const currentTrack = player.currentTrack;

            player.stop();
            client.players.delete(guild.id);

            const embed = new EmbedBuilder()
                .setTitle(await LanguageManager.getTranslation(guild.id, 'buttonhandler.music_stopped_title'))
                .setDescription(`${currentTrack ? `**[${currentTrack.title}](${currentTrack.url})**` : 'Music'} ${await LanguageManager.getTranslation(guild.id, 'buttonhandler.stopped')}!`)
                .setColor('#FF0000')
                .setTimestamp()
                .addFields({
                    name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.stopped_by'),
                    value: `${member}`,
                    inline: true
                });

            if (queueLength > 0) {
                embed.setFooter({
                    text: await LanguageManager.getTranslation(guild.id, 'buttonhandler.songs_cleared', { count: queueLength })
                });
            }

            await interaction.reply({ embeds: [embed], flags: [1 << 6] });

            if (client.musicEmbedManager) {
                await client.musicEmbedManager.handlePlaybackEnd(player);
            }
        } catch (error) {
            console.error('❌ /stop error:', error);
            await interaction.reply({
                content: '❌ An error occurred while trying to stop!',
                flags: [1 << 6]
            });
        }
    }
};
