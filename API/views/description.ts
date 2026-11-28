import type { DescriptionFacts } from '../../Services/profileService.ts';

const SUPERSTAR_TASKS = 15;
const STRUGGLING_STRIKES = 2;

const article = (roles: string) => (/^[aeiou]/i.test(roles) ? 'an' : 'a');

export const describeMember = ({ username, strikes, isOnHiatus, tasksCompleted, topTaskRoles }: DescriptionFacts) => {
    if (isOnHiatus) {
        return `✨ ${username} is taking a lil' rest! Miku's saving up the spotlight for their next grand entrance~ 💙`;
    }
    if (strikes >= STRUGGLING_STRIKES) {
        return `💫 ${username} has so much potential! Miku believes in you and your amazing comeback story~ ⭐`;
    }
    if (tasksCompleted >= SUPERSTAR_TASKS) {
        return `🎵 ${username} is a Sekai superstar! Your consistent magic keeps the whole vibe alive~ ✨💖`;
    }
    if (topTaskRoles.length) {
        const roles = topTaskRoles.slice(0, 2).join(' & ');
        return `🌸 ${username} shines brightest as ${article(roles)} ${roles} creator! Miku adores your dedication~ 💚`;
    }
    return `🌟 ${username} is growing brighter every day! Miku can't wait to see what magic you'll create~ 💫`;
};
