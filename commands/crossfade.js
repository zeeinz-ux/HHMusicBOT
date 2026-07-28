const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../src/LanguageManager');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crossfade')
        .setDescription('Toggle crossfade between tracks')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Enable, disable, or set duration')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable', value: 'enable' },
                    { name: 'Disable', value: 'disable' },
                    { name: 'Set Duration', value: 'duration' }
                )
        )
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('Crossfade duration in seconds (1-10)')
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction, client) {
        try {
            const guild = interaction.guild;
            const member = interaction.member;

            const action = interaction.options.getString('action');
            const seconds = interaction.options.getInteger('seconds');

            if (action === 'duration' && seconds) {
                config.audio.crossfade.duration = seconds;
                this.saveConfig();
            }

            if (action === 'enable') {
                config.audio.crossfade.enabled = true;
                this.saveConfig();
            } else if (action === 'disable') {
                config.audio.crossfade.enabled = false;
                this.saveConfig();
            }

            const status = config.audio.crossfade.enabled ? '✅ Enabled' : '❌ Disabled';
            const duration = config.audio.crossfade.duration;

            const embed = new EmbedBuilder()
                .setTitle('🎵 Crossfade Settings')
                .setDescription(`Crossfade is now **${status}**`)
                .setColor(config.bot.embedColor)
                .setTimestamp()
                .addFields(
                    { name: 'Duration', value: `${duration} seconds`, inline: true },
                    { name: 'Changed by', value: `${member}`, inline: true }
                );

            await interaction.reply({ embeds: [embed], flags: [1 << 6] });
        } catch (error) {
            console.error('❌ /crossfade error:', error);
            await interaction.reply({
                content: '❌ An error occurred while changing crossfade settings!',
                flags: [1 << 6]
            });
        }
    },

    saveConfig() {
        const configPath = path.join(__dirname, '..', 'config.js');
        try {
            let content = fs.readFileSync(configPath, 'utf8');
            content = content.replace(
                /crossfade:\s*\{[\s\S]*?\}/,
                `crossfade: {\n            enabled: ${config.audio.crossfade.enabled},\n            duration: ${config.audio.crossfade.duration}\n        }`
            );
            fs.writeFileSync(configPath, content, 'utf8');
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }
};
