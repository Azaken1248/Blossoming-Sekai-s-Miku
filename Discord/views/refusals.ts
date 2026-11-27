import { DomainError, type DomainErrorCode, type DomainErrorDetails } from '../../Utils/domain/errors.ts';
import type { Reply } from './permissions.ts';

export type Wording = {
    readonly [Code in DomainErrorCode]?: (details: DomainErrorDetails[Code], error: DomainError<Code>) => string;
};

type AnyWording = (details: unknown, error: DomainError) => string;

export const refusalFor = (error: unknown, wording: Wording): Reply => {
    const refused = error instanceof DomainError ? (error as DomainError) : undefined;
    const word = refused && (wording[refused.code] as AnyWording | undefined);
    if (!refused || !word) throw error;
    return { content: word(refused.details, refused) };
};

export const isDomainError = (error: unknown, code: DomainErrorCode): boolean =>
    error instanceof DomainError && error.code === code;
