import type { ClientSession, FilterQuery, Model } from 'mongoose';
import type { StoredMember } from '../../DB/Schemas/user.ts';
import { MAX_STRIKES } from '../domain/strikes.js';

type Filter = FilterQuery<StoredMember>;

const change = async (
    members: Model<StoredMember>,
    filter: Filter,
    allowed: Filter,
    amount: 1 | -1,
    session: ClientSession | null,
): Promise<number | null> => {
    const updated = await members
        .findOneAndUpdate({ ...filter, ...allowed }, { $inc: { strikes: amount } }, { new: true, session })
        .lean<StoredMember>();
    const member = updated ?? (await members.findOne(filter).session(session).lean<StoredMember>());
    return member ? (member.strikes ?? 0) : null;
};

export const incrementStrikes = (members: Model<StoredMember>, filter: Filter, session: ClientSession | null = null) =>
    change(members, filter, { strikes: { $lt: MAX_STRIKES } }, 1, session);

export const decrementStrikes = (members: Model<StoredMember>, filter: Filter, session: ClientSession | null = null) =>
    change(members, filter, { strikes: { $gt: 0 } }, -1, session);
