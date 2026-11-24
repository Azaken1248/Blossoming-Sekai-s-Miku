/**
 * Builds a Mongo filter from a query string using an explicit allowlist.
 *
 * The previous implementation JSON-stringified the whole `req.query` object,
 * regex-replaced a handful of operator words, and passed the result straight to
 * .find(). That let any operator through (including $where) and also corrupted
 * ordinary values - `?taskName=in progress` became `{ taskName: "$in progress" }`
 * because the substitution ran over values as well as keys.
 *
 * Nothing reaches the database now unless it is named here.
 */

const COMPARISON_OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'ne']);
const SET_OPERATORS = new Set(['in', 'nin']);

/** field -> how its value should be coerced and which operators it accepts. */
export const DEFAULT_FILTERABLE_FIELDS = {
    status: { type: 'enum', values: ['PENDING', 'COMPLETED', 'LATE', 'EXCUSED'] },
    roleName: { type: 'string' },
    roleCategoryId: { type: 'string' },
    taskType: { type: 'string' },
    taskName: { type: 'string' },
    discordUserId: { type: 'string' },
    hasExtended: { type: 'boolean' },
    extensionCount: { type: 'number', operators: COMPARISON_OPERATORS },
    assignedAt: { type: 'date', operators: COMPARISON_OPERATORS },
    deadline: { type: 'date', operators: COMPARISON_OPERATORS },
    completedAt: { type: 'date', operators: COMPARISON_OPERATORS },
};

const SORTABLE_FIELDS = new Set([
    'assignedAt',
    'deadline',
    'completedAt',
    'status',
    'roleName',
    'taskType',
    'extensionCount',
]);

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

/** Thrown for a malformed query so the caller can answer 400 rather than 500. */
export class QueryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QueryError';
        this.status = 400;
    }
}

const coerce = (spec, raw, field) => {
    switch (spec.type) {
        case 'number': {
            const n = Number(raw);
            if (!Number.isFinite(n)) throw new QueryError(`${field} must be a number`);
            return n;
        }
        case 'boolean': {
            if (raw === 'true') return true;
            if (raw === 'false') return false;
            throw new QueryError(`${field} must be true or false`);
        }
        case 'date': {
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) throw new QueryError(`${field} must be a valid date`);
            return d;
        }
        case 'enum': {
            const value = String(raw);
            if (!spec.values.includes(value)) {
                throw new QueryError(`${field} must be one of: ${spec.values.join(', ')}`);
            }
            return value;
        }
        case 'string':
        default:
            return String(raw);
    }
};

/**
 * Turn `?status=PENDING&deadline[lt]=2026-01-01` into a Mongo filter,
 * ignoring anything not in `fields`.
 */
export const buildFilter = (queryString = {}, fields = DEFAULT_FILTERABLE_FIELDS) => {
    const filter = {};

    for (const [field, spec] of Object.entries(fields)) {
        const raw = queryString[field];
        if (raw === undefined || raw === null || raw === '') continue;

        // Plain equality: ?status=PENDING
        if (typeof raw !== 'object') {
            filter[field] = coerce(spec, raw, field);
            continue;
        }

        // Operator form: ?deadline[lt]=...  Only allowlisted operators apply.
        const allowed = spec.operators ?? new Set();
        const clause = {};
        for (const [operator, value] of Object.entries(raw)) {
            if (allowed.has(operator)) {
                clause[`$${operator}`] = coerce(spec, value, field);
            } else if (SET_OPERATORS.has(operator) && Array.isArray(value)) {
                clause[`$${operator}`] = value.map((entry) => coerce(spec, entry, field));
            } else {
                throw new QueryError(`Operator "${operator}" is not supported for ${field}`);
            }
        }
        if (Object.keys(clause).length) filter[field] = clause;
    }

    return filter;
};

export default class QueryBuilder {
    constructor(mongooseQuery, queryString, fields = DEFAULT_FILTERABLE_FIELDS) {
        this.query = mongooseQuery;
        this.queryString = queryString ?? {};
        this.fields = fields;
        this.page = 1;
        this.limit = DEFAULT_LIMIT;
    }

    filter() {
        this.query = this.query.find(buildFilter(this.queryString, this.fields));
        return this;
    }

    sort() {
        const requested = this.queryString.sort;
        if (!requested) {
            this.query = this.query.sort('-assignedAt');
            return this;
        }

        const clauses = String(requested)
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
                const descending = entry.startsWith('-');
                const field = descending ? entry.slice(1) : entry;
                if (!SORTABLE_FIELDS.has(field)) {
                    throw new QueryError(`Cannot sort by "${field}". Allowed: ${[...SORTABLE_FIELDS].join(', ')}`);
                }
                return `${descending ? '-' : ''}${field}`;
            });

        this.query = this.query.sort(clauses.length ? clauses.join(' ') : '-assignedAt');
        return this;
    }

    paginate() {
        this.page = Math.max(1, Number(this.queryString.page) || 1);
        this.limit = Math.min(Math.max(1, Number(this.queryString.limit) || DEFAULT_LIMIT), MAX_LIMIT);
        this.query = this.query.skip((this.page - 1) * this.limit).limit(this.limit);
        return this;
    }
}
