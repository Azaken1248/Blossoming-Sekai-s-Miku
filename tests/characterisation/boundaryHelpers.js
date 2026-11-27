export const HOUR = 60 * 60 * 1000;
export const unknownInteraction = () => Object.assign(new Error('Unknown interaction'), { code: 10062 });

export const failFirstEditReply = (interaction) => {
    const editReply = interaction.editReply;
    let failed = false;
    interaction.editReply = async (payload) => {
        if (!failed) {
            failed = true;
            throw Object.assign(new Error('Service unavailable'), { status: 503 });
        }
        return editReply(payload);
    };
    return interaction;
};

export const beforeQuery = (t, model, method, callNumber, hook) => {
    const original = model[method];
    let calls = 0;
    t.mock.method(model, method, function (...args) {
        const query = original.apply(this, args);
        calls += 1;
        if (calls === callNumber) {
            const exec = query.exec.bind(query);
            query.exec = async (...execArgs) => {
                await hook();
                return exec(...execArgs);
            };
        }
        return query;
    });
};

export const failOnce = (t, model, method, message) =>
    t.mock.method(
        model,
        method,
        () => {
            throw new Error(message);
        },
        { times: 1 },
    );

export const withConfig = (t, apply) => {
    const restore = apply();
    t.after(restore);
};

export const boundaryActions = (state) => ({
    command: (name, user, options = {}, subcommand = null, extra = {}) =>
        state.world.command(name, { user, options, subcommand, ...extra }),
    click: (customId, user, embeds = [{ title: 'Review me' }]) =>
        state.world.button(customId, { user, message: { embeds } }),
    startUp: async () => {
        state.bot.restCalls.length = 0;
        await state.bot.ready();
    },
});
