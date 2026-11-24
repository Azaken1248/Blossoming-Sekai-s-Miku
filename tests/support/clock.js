export const FROZEN_NOW = '2026-06-15T12:00:00.000Z';

export const freezeClock = (t, iso = FROZEN_NOW) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(iso) });
    return {
        now: () => new Date(),
        advance: (ms) => t.mock.timers.tick(ms),
    };
};
