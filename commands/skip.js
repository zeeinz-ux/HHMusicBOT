const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip to the next song'),

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

            if (player.queue.length === 0) {
                return await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'buttonhandler.no_songs_to_skip'),
                    flags: [1 << 6]
                });
            }

            const currentTrack = player.currentTrack;
            const skipped = player.skip();

            if (skipped) {
                const embed = new EmbedBuilder()
                    .setTitle(await LanguageManager.getTranslation(guild.id, 'buttonhandler.song_skipped_title'))
                    .setDescription(`**[${currentTrack.title}](${currentTrack.url})** ${await LanguageManager.getTranslation(guild.id, 'buttonhandler.skipped')}!`)
                    .setColor(config.bot.embedColor)
                    .setTimestamp()
                    .addFields({
                        name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.skipped_by'),
                        value: `${member}`,
                        inline: true
                    });

                if (player.queue.length > 0) {
                    embed.addFields({
                        name: await LanguageManager.getTranslation(guild.id, 'buttonhandler.next_song'),
                        value: `[${player.queue[0].title}](${player.queue[0].url})`,
                        inline: false
                    });
                    embed.setFooter({
                        text: await LanguageManager.getTranslation(guild.id, 'buttonhandler.more_songs_in_queue', { count: player.queue.length })
                    });
                } else {
                    embed.setFooter({
                        text: await LanguageManager.getTranslation(guild.id, 'buttonhandler.no_more_songs')
                    });
                }

                if (currentTrack.thumbnail) {
                    embed.setThumbnail(currentTrack.thumbnail);
                }

                await interaction.reply({ embeds: [embed], flags: [1 << 6] });

                if (client.musicEmbedManager && player.currentTrack) {
                    await client.musicEmbedManager.updateNowPlayingEmbed(player);
                }
            } else {
                await interaction.reply({
                    content: await LanguageManager.getTranslation(guild.id, 'buttonhandler.song_not_skipped'),
                    flags: [1 << 6]
                });
            }
        } catch (error) {
            console.error('❌ /skip error:', error);
            await interaction.reply({
                content: '❌ An error occurred while trying to skip!',
                flags: [1 << 6]
            });
        }
    }
};
