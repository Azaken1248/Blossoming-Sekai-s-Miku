import type { StoredTask } from '../../DB/Schemas/assignment.ts';
import type { StoredMember } from '../../DB/Schemas/user.ts';
import { type Populated, toMember, toTask } from './mappers.ts';
import { decrementStrikes, incrementStrikes } from './strikeUpdates.ts';
import type { RepositoryDependencies } from './taskRepository.ts';
import { type MemberRepository, TASK_STATUS, type Task } from './types.ts';

type MemberAndTasks = Populated<StoredMember, 'assignments', StoredTask[] | undefined>;

const PAUSED_DEADLINE = new Date('2099-12-31');

const isOpen = ({ status }: Task) => status === TASK_STATUS.Pending || status === TASK_STATUS.Late;
const isCompleted = ({ status }: Task) => status === TASK_STATUS.Completed;

export const createMemberRepository = ({
    tasks,
    members,
    transaction,
    clock,
}: RepositoryDependencies): MemberRepository => ({
    findOrCreate: async (discordId, username) => {
        const existing = await members.findOne({ discordId }).lean<StoredMember>();
        if (existing) return { member: toMember(existing), created: false };
        const { upsertedCount } = await members.updateOne(
            { discordId },
            { $setOnInsert: { username, strikes: 0, assignments: [], joinedAt: clock.now() } },
            { upsert: true },
        );
        const stored = await members.findOne({ discordId }).orFail().lean<StoredMember>();
        return { member: toMember(stored), created: upsertedCount === 1 };
    },

    findByDiscordId: async (discordId) => {
        const stored = await members.findOne({ discordId }).lean<StoredMember>();
        return stored ? toMember(stored) : null;
    },

    findProfile: async (discordId) => {
        const stored = await members.findOne({ discordId }).populate('assignments').lean<MemberAndTasks>();
        return stored ? { ...toMember(stored), assignments: (stored.assignments ?? []).map(toTask) } : null;
    },

    isActive: async (discordId) => (await members.exists({ discordId, isDeboarded: { $ne: true } })) !== null,

    reactivate: async (discordId, username) => {
        const stored = await members
            .findOneAndUpdate(
                { discordId },
                { isDeboarded: false, deboarded_at: null, ...(username ? { username } : {}) },
                { new: true },
            )
            .lean<StoredMember>();
        return stored ? toMember(stored) : null;
    },

    deboard: async (discordId, message) => {
        const stored = await members
            .findOneAndUpdate(
                { discordId, isDeboarded: { $ne: true } },
                { isDeboarded: true, deboarded_at: clock.now(), deboarded_statusMessage: message },
                { new: true },
            )
            .lean<StoredMember>();
        return stored ? toMember(stored) : null;
    },

    addStrike: (discordId) => incrementStrikes(members, { discordId }),

    removeStrike: (discordId) => decrementStrikes(members, { discordId }),

    listWithStrikes: async () => {
        const stored = await members
            .find({ strikes: { $gt: 0 } })
            .sort({ strikes: -1 })
            .lean<StoredMember[]>();
        return stored.map(toMember);
    },

    listFree: async () => {
        const busyIds = await tasks.distinct('userId', { status: { $in: [TASK_STATUS.Pending, TASK_STATUS.Late] } });
        const stored = await members
            .find({ _id: { $nin: busyIds } })
            .populate({
                path: 'assignments',
                match: { status: TASK_STATUS.Completed },
                options: { sort: { deadline: -1 }, limit: 1 },
            })
            .lean<MemberAndTasks[]>();
        return stored.map(({ discordId, username, isOnHiatus, assignments }) => {
            const lastTask = assignments?.[0];
            return {
                discordId,
                username: username ?? null,
                isOnHiatus: isOnHiatus ?? false,
                lastTask: lastTask ? toTask(lastTask) : null,
            };
        });
    },

    findAvailability: async (discordId) => {
        const stored = await members
            .findOne({ discordId })
            .populate({ path: 'assignments', options: { sort: { completedAt: -1, deadline: -1 } } })
            .lean<MemberAndTasks>();
        if (!stored) return null;
        const assignments = (stored.assignments ?? []).map(toTask);
        const activeTask = assignments.find(isOpen) ?? null;
        return {
            discordId: stored.discordId,
            username: stored.username ?? null,
            isOnHiatus: stored.isOnHiatus ?? false,
            isFree: activeTask === null,
            activeTask,
            lastTask: assignments.find(isCompleted) ?? null,
        };
    },

    startHiatus: (discordId) =>
        transaction(async (session) => {
            await members.updateOne({ discordId }, { isOnHiatus: true }, { session });
            const { matchedCount } = await tasks.updateMany(
                { discordUserId: discordId, status: TASK_STATUS.Pending },
                { deadline: PAUSED_DEADLINE, firstReminderSent: true, finalReminderSent: true },
                { session },
            );
            return matchedCount;
        }),

    endHiatus: (discordId, freshDeadline) =>
        transaction(async (session) => {
            const { matchedCount } = await members.updateOne(
                { discordId, isOnHiatus: true },
                { isOnHiatus: false },
                { session },
            );
            if (matchedCount === 0) return null;
            const paused = await tasks
                .find({ discordUserId: discordId, status: TASK_STATUS.Pending })
                .session(session)
                .lean<StoredTask[]>();
            const restored: Task[] = [];
            const skipped: Task[] = [];
            for (const stored of paused) {
                const task = toTask(stored);
                const deadline = freshDeadline(task);
                if (!deadline) {
                    skipped.push(task);
                    continue;
                }
                const changes = { deadline, hasExtended: false, firstReminderSent: false, finalReminderSent: false };
                await tasks.updateOne({ _id: stored._id }, changes, { session });
                restored.push({ ...task, ...changes });
            }
            return { restored, skipped };
        }),
});
