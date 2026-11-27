import type { ApprovalAction, CommandName } from '../../Utils/permissions.ts';

export type Reply = { readonly content: string };

const COMMAND_DENIALS: Partial<Record<CommandName, string>> = {
    assign: 'Sorry, but only owners can assign tasks! If you need something assigned, reach out to them~ ♪',
    bulkassign: 'Only owners can assign tasks! ♪',
    strike: "Strike management is handled by managers and owners! If there's an issue, please reach out to them~ ♪",
    onboard: 'Only owners can onboard new users! If someone needs to join, ask an owner to help them get started~ ♪',
    deboard: 'Only owners can deboard users. If someone needs to take a break, ask an owner to help~ ♪',
    removetask: 'Only managers and owners can remove tasks! If a task needs to be removed, ask an owner or manager~ ♪',
    submit: 'I appreciate the help, but you can only submit your own tasks! ♪',
    extension:
        'You can only request extensions for your own tasks! If someone else needs help, they should ask directly~ ♪',
    hiatus: 'Only owners can grant hiatus directly to other users! Normal users can request their own hiatus~ ♪',
    endhiatus:
        'You can only end your own hiatus! If someone else is ready to return, they should let us know themselves~ ♪',
};

const NOT_ONBOARDED = 'Looks like this user needs to be onboarded first! Ask an owner to help~ ♪';
const NOT_ONBOARDED_FOR_OWN_HIATUS =
    'You need to be onboarded before requesting a hiatus! Talk to an owner to get started~ ♪';

export const commandDenial = (command: CommandName): Reply => ({
    content: COMMAND_DENIALS[command] ?? "You don't have permission to do that.",
});

export const notOnboarded = (command: CommandName, self: boolean): Reply => ({
    content: command === 'hiatus' && self ? NOT_ONBOARDED_FOR_OWN_HIATUS : NOT_ONBOARDED,
});

type TaskAction = Exclude<ApprovalAction, 'hiatus'>;

const TASK_DECISION_DENIALS: Record<TaskAction, Record<'approve' | 'deny', string>> = {
    submit: {
        approve: 'Thanks for checking, but only owners can approve submissions! ♪',
        deny: 'Thanks for checking, but only owners can deny submissions! ♪',
    },
    extension: {
        approve: 'Extension approvals are handled by managers and owners! Thanks for checking though~ ♪',
        deny: 'Extension decisions are handled by managers and owners! Thanks for checking though~ ♪',
    },
};

export const taskDecisionDenial = (action: TaskAction, decision: 'approve' | 'deny'): Reply => ({
    content: TASK_DECISION_DENIALS[action][decision],
});

export const HIATUS_DECISION_DENIAL: Reply = {
    content: 'Hiatus requests are handled by managers and owners! Thanks for looking out for everyone though~ ♪',
};
