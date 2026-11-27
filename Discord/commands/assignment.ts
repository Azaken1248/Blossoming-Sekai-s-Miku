import { assignmentService } from '../../Services/index.ts';
import { guardCommand } from '../guard.ts';
import { logAction } from '../notifier.ts';
import type { CommandInteraction } from '../ports.ts';
import { rememberBulkAssign } from '../components/bulkAssign.ts';
import { type AssignOptions, assignTo } from './assignTo.ts';
import {
    ASSIGN_REFUSALS,
    assigned,
    assignedLog,
    bulkPicker,
    removeRefusals,
    removed,
    removedLog,
} from '../views/assignment.ts';
import { refusalFor } from '../views/refusals.ts';

const assignOptions = ({ options }: CommandInteraction): AssignOptions => ({
    taskType: options.getString('task', true),
    roleName: options.getString('role', true),
    taskName: options.getString('name') || '',
    description: options.getString('description') || '',
    durationDays: options.getInteger('duration_days'),
    extensionDays: options.getInteger('extension_days'),
});

const assign = async (interaction: CommandInteraction) => {
    const target = interaction.options.getUser('user', true);
    let task;
    try {
        task = await assignTo(interaction.guild, target, assignOptions(interaction));
    } catch (error) {
        return refusalFor(error, ASSIGN_REFUSALS);
    }
    await logAction(interaction.guild, assignedLog(task, target.id), interaction.user);
    return assigned(task, target.id);
};

export const handleAssign = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const refusal = await guardCommand(interaction, 'assign');
    return interaction.editReply(refusal ?? (await assign(interaction)));
};

const removeTask = async (interaction: CommandInteraction) => {
    const target = interaction.options.getUser('user', true);
    let title;
    try {
        ({ title } = await assignmentService.remove(target.id, interaction.options.getString('task', true)));
    } catch (error) {
        return refusalFor(error, removeRefusals(target.id));
    }
    await logAction(interaction.guild, removedLog(title, target.id), interaction.user);
    return removed(title, target.id);
};

export const handleRemoveTask = async (interaction: CommandInteraction) => {
    await interaction.deferReply();
    const refusal = await guardCommand(interaction, 'removetask');
    return interaction.editReply(refusal ?? (await removeTask(interaction)));
};

const bulkOptions = ({ options }: CommandInteraction): AssignOptions => ({
    roleName: options.getString('role', true),
    taskType: options.getString('task', true),
    taskName: options.getString('name') || '',
    description: options.getString('description') || '',
    durationDays: options.getInteger('duration_days') || null,
    extensionDays: options.getInteger('extension_days') || null,
});

export const handleBulkAssign = async (interaction: CommandInteraction) => {
    const refusal = await guardCommand(interaction, 'bulkassign');
    if (refusal) return interaction.reply({ ...refusal, flags: 64 });
    const request = bulkOptions(interaction);
    await interaction.reply(bulkPicker(rememberBulkAssign(interaction.user.id, request), request));
    return undefined;
};
