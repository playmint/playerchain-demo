export async function waitFor(
    fn: () => Promise<boolean>,
    timeout = 8000,
    msg = 'timeout waiting for condition',
): Promise<void> {
    const start = Date.now();
    while (!(await fn())) {
        if (Date.now() - start > timeout) {
            throw new Error(msg);
        }
        await new Promise((r) => setTimeout(r, 100));
    }
}
