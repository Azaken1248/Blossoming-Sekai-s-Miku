export type QueryInput = Readonly<Record<string, unknown>>;

type FieldSpec =
    | { readonly type: 'string' | 'boolean' }
    | { readonly type: 'number' | 'date'; readonly operators: ReadonlySet<string> }
    | { readonly type: 'enum'; readonly values: readonly string[] };

export type Filter = Record<string, unknown>;

const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(['gt', 'gte', 'lt', 'lte', 'ne']);
const SET_OPERATORS: ReadonlySet<string> = new Set(['in', 'nin']);

export const FILTERABLE_FIELDS: Readonly<Record<string, FieldSpec>> = {
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

const SORTABLE_FIELDS: ReadonlySet<string> = new Set([
    'assignedAt',
    'deadline',
    'completedAt',
    'status',
    'roleName',
    'taskType',
    'extensionCount',
]);

const SORT_ALIASES: ReadonlyMap<string, string> = new Map([['createdAt', 'assignedAt']]);
const DEFAULT_SORT = '-assignedAt';

export const GROUPABLE_FIELDS: ReadonlySet<string> = new Set([
    'status',
    'roleName',
    'roleCategoryId',
    'taskType',
    'discordUserId',
    'hasExtended',
]);

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 100;

export class QueryError extends Error {
    override readonly name = 'QueryError';
    readonly status = 400;
}

const coerce = (spec: FieldSpec, raw: unknown, field: string): unknown => {
    const text = String(raw);
    switch (spec.type) {
        case 'number': {
            const number = Number(raw);
            if (!Number.isFinite(number)) throw new QueryError(`${field} must be a number`);
            return number;
        }
        case 'boolean':
            if (text === 'true') return true;
            if (text === 'false') return false;
            throw new QueryError(`${field} must be true or false`);
        case 'date': {
            const date = new Date(text);
            if (Number.isNaN(date.getTime())) throw new QueryError(`${field} must be a valid date`);
            return date;
        }
        case 'enum':
            if (!spec.values.includes(text)) throw new QueryError(`${field} must be one of: ${spec.values.join(', ')}`);
            return text;
        case 'string':
            return text;
    }
};

const operatorsOf = (spec: FieldSpec): ReadonlySet<string> => ('operators' in spec ? spec.operators : new Set());

const clauseFor = (spec: FieldSpec, raw: object, field: string): Filter => {
    const clause: Filter = {};
    for (const [operator, value] of Object.entries(raw)) {
        if (operatorsOf(spec).has(operator)) {
            clause[`$${operator}`] = coerce(spec, value, field);
        } else if (SET_OPERATORS.has(operator) && Array.isArray(value)) {
            clause[`$${operator}`] = value.map((entry: unknown) => coerce(spec, entry, field));
        } else {
            throw new QueryError(`Operator "${operator}" is not supported for ${field}`);
        }
    }
    return clause;
};

export const buildFilter = (query: QueryInput = {}, fields = FILTERABLE_FIELDS): Filter => {
    const filter: Filter = {};
    for (const [field, spec] of Object.entries(fields)) {
        const raw = query[field];
        if (raw === undefined || raw === null || raw === '') continue;
        if (typeof raw !== 'object') {
            filter[field] = coerce(spec, raw, field);
            continue;
        }
        const clause = clauseFor(spec, raw, field);
        if (Object.keys(clause).length) filter[field] = clause;
    }
    return filter;
};

const sortClause = (entry: string): string => {
    const descending = entry.startsWith('-');
    const requested = descending ? entry.slice(1) : entry;
    const field = SORT_ALIASES.get(requested) ?? requested;
    if (!SORTABLE_FIELDS.has(field)) {
        throw new QueryError(`Cannot sort by "${field}". Allowed: ${[...SORTABLE_FIELDS].join(', ')}`);
    }
    return `${descending ? '-' : ''}${field}`;
};

const asText = (value: unknown): string => (value === null || value === undefined ? '' : (value as number).toString());

export const buildSort = (requested: unknown): string => {
    const clauses = asText(requested)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map(sortClause);
    return clauses.length ? clauses.join(' ') : DEFAULT_SORT;
};

export interface Page {
    readonly page: number;
    readonly limit: number;
    readonly skip: number;
}

export const pageOf = (query: QueryInput, defaultLimit = DEFAULT_LIMIT): Page => {
    const page = Math.max(1, Number(query['page']) || 1);
    const limit = Math.min(Math.max(1, Number(query['limit']) || defaultLimit), MAX_LIMIT);
    return { page, limit, skip: (page - 1) * limit };
};

export const groupByOf = (query: QueryInput): string => {
    const requested = query['groupBy'] || 'status';
    const field = [...GROUPABLE_FIELDS].find((candidate) => candidate === requested);
    if (!field) throw new QueryError(`groupBy must be one of: ${[...GROUPABLE_FIELDS].join(', ')}`);
    return field;
};
