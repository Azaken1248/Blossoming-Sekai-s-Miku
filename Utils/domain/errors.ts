export interface DomainErrorDetails {
    ALREADY_EXTENDED: undefined;
    CONFIG_MISSING_ROLE: undefined;
    CUSTOM_DURATION_REQUIRED: undefined;
    CUSTOM_FIELDS_NOT_ALLOWED: undefined;
    MEMBER_NOT_FOUND: undefined;
    ROLE_MISSING: { readonly roleName: string };
    TASK_CHANGED: undefined;
    TASK_NOT_FOUND: undefined;
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
