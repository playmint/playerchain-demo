// async snoozer
export async function sleep(ms) {
    return new globalThis.Promise((resolve) =>
        globalThis.setTimeout(resolve, ms),
    );
}
