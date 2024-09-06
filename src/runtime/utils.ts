export type AsyncFunction = (...args: any[]) => Promise<any>;
export type CancelFunction = () => void;

// like setTimeout but logs any errors caught during the async function call
// just makes it easier to write setTimout calls without leaving dangling promises
export function setDeferred(fn: AsyncFunction, ms: number): CancelFunction {
    const handle = setTimeout(() => {
        fn().catch((err) => {
            console.error(
                `error-during-async fn=${fn.name || 'anon'} error=${err}`,
            );
        });
    }, ms);
    return () => {
        clearTimeout(handle);
    };
}

// bit like setInterval, but the timeout is more like a throttling than a
// guarentee that it will be called every ms.
// function again and logs any errors caught during the function call just makes
// it easier to write little periodic loops without worrying about the function
// being called concurrectly with itself
export function setPeriodic(fn: AsyncFunction, ms: number): CancelFunction {
    let cancel: CancelFunction | null = null;
    const doDeferredCall = () => {
        cancel = setDeferred(async () => {
            await fn();
            doDeferredCall();
        }, ms);
    };
    doDeferredCall();
    return () => {
        if (cancel) {
            cancel();
        }
    };
}

// we often want to assign async funcs to event listeners, but we don't want to
// leave dangling promises, and we don't want them to run concurrently
// so this little helper wraps the function to ensure promise errors are logged
// and ensure that each call is queued up and run one at a time
// if a size is given, then we will start dropping calls if the queue backs up
// to that number. this can act like a pressure release. size=undefined is
// unlimited
export function bufferedCall<
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    T extends AsyncFunction,
>(fn: T, size?: number, name?: string): (...args: Parameters<T>) => void {
    const queue: any[] = [];
    let isRunning = false;

    const runNext = () => {
        if (queue.length === 0) {
            isRunning = false;
            return;
        }

        isRunning = true;
        const args = queue.shift()!;
        fn(...args)
            .catch((err) => {
                console.error(
                    `error-during-async-listener fn=${fn.name || name || 'anon'} error=${err}`,
                );
            })
            .finally(() => {
                setTimeout(() => runNext(), 0);
            });
    };

    return (...args: any[]) => {
        if (size !== undefined && queue.length >= size) {
            console.error(
                `bufferedCall queue full, dropping fn=${fn.name || name || 'anon'}`,
            );
            return;
        }
        queue.push(args);
        if (!isRunning) {
            runNext();
        }
    };
}

// debounce
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    ms: number,
): T {
    let handle: any;
    return ((...args: any[]) => {
        clearTimeout(handle);
        handle = setTimeout(() => {
            fn(...args);
        }, ms);
    }) as T;
}

// throttle
export function throttle<T extends (...args: any[]) => any>(
    fn: T,
    ms: number,
): T {
    let last = 0;
    return ((...args: any[]) => {
        const now = Date.now();
        if (now - last > ms) {
            last = now;
            fn(...args);
        }
    }) as T;
}

// stop vite being a nob and just let me do a dynamic import
export async function importStatic(modulePath) {
    return import(/* @vite-ignore */ `${modulePath}?${Date.now()}`);
}

// the bigest truncation of a peerId to fit in a 64bit number
export function peerIdTo64bitBigNum(peerId: string): bigint {
    return BigInt(`0x${peerId.slice(0, 15)}`);
}

// wipe all the state
export async function hardReset() {
    const dbs = await window.indexedDB.databases();
    await Promise.all(
        dbs.map((db: any) => window.indexedDB.deleteDatabase(db.name)),
    );
    localStorage.clear();
}
