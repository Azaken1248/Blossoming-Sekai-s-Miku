import type { Request, Response } from 'express';

interface Handling {
    readonly label: string;
    readonly failure: string;
    readonly known?: (error: unknown, res: Response) => boolean;
}

export const handle =
    ({ label, failure, known }: Handling, run: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response): void => {
        run(req, res).catch((error: unknown) => {
            if (known?.(error, res)) return;
            console.error(`[API] ${label} failed:`, error);
            res.status(500).json({ error: failure });
        });
    };
