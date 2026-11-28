import type { Task } from './model.ts';

export interface DomainErrorDetails {
    ALREADY_EXTENDED: undefined;
    CARD_NOT_FOUND: undefined;
    CONFIG_MISSING_ROLE: undefined;
    CUSTOM_DURATION_REQUIRED: undefined;
    CUSTOM_FIELDS_NOT_ALLOWED: undefined;
    MEMBER_ALREADY_DEBOARDED: undefined;
    MEMBER_DEBOARDED: undefined;
    MEMBER_NOT_FOUND: undefined;
    MEMBER_NOT_IN_GUILD: undefined;
    NO_ACTIVE_TASKS: undefined;
    NO_PENDING_TASKS: undefined;
    NO_TASKS: undefined;
    NOT_ON_HIATUS: undefined;
    REASON_REQUIRED: undefined;
    ROLE_MISSING: { readonly roleName: string };
    ROLE_UNKNOWN: { readonly roleCategoryId: string };
    TASK_AMBIGUOUS: { readonly tasks: readonly Pick<Task, 'taskName' | 'taskType' | 'roleName'>[] };
    TASK_CHANGED: undefined;
    TASK_GONE: undefined;
    TASK_IS_PERMANENT: { readonly title: string };
    TASK_NAME_UNKNOWN: { readonly taskName: string };
    TASK_NOT_FOUND: undefined;
    TASK_RESOLVED: undefined;
    TASK_TYPE_INVALID: {
        readonly taskType: string;
        readonly roleName: string;
        readonly validTasks: readonly string[];
    };
}

export type DomainErrorCode = keyof DomainErrorDetails;

type DetailArguments<Code extends DomainErrorCode> = DomainErrorDetails[Code] extends undefined
    ? [details?: undefined]
    : [details: DomainErrorDetails[Code]];

export class DomainError<Code extends DomainErrorCode = DomainErrorCode> extends Error {
    readonly code: Code;
    readonly details: DomainErrorDetails[Code] | undefined;

    constructor(code: Code, ...[details]: DetailArguments<Code>) {
        super(code);
        this.name = 'DomainError';
        this.code = code;
        this.details = details;
    }
}
