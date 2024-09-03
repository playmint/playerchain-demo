import { DependencyList, useCallback, useEffect, useState } from 'react';

export type AsyncState<T> = {
    value?: T;
    error?: Error;
    loading: boolean;
};
export type AsyncDestructor = () => Promise<void>;
export type AsyncDeferableDestructor = (doLater: AsyncDestructor) => void;
export type AsyncFn<T> = (defer: AsyncDeferableDestructor) => Promise<T>;

// type EffectCallback = () => void | Destructor;

export function useAsync<T>(
    fn: AsyncFn<T>,
    deps: DependencyList,
    initialValue?: T,
): AsyncState<T> {
    const [value, setValue] = useState<T | undefined>(initialValue);
    const [error, setError] = useState<Error | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(true);
    const effect = useCallback(() => {
        return fn;
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        // use deferred to perform cleanup after the effect has run
        // you can call the defer func multiple times to incrementally add cleanup
        // defers are executed in reverse order, so they kind of "rollback"
        const deferred: AsyncDestructor[] = [];
        const defer = (doLater: AsyncDestructor) => {
            deferred.unshift(doLater);
        };

        let v: T | undefined;
        const run = async () => {
            v = await fn(defer);
            setValue(() => v);
            setLoading(false);
            setError(undefined);
        };
        run().catch((err) => {
            console.error('use-async-err', err);
            setValue(undefined);
            setLoading(true);
            setError(err);
        });
        return () => {
            setValue(undefined);
            setLoading(true);
            setError(undefined);
            for (const d of deferred) {
                d().catch((err) => {
                    console.error('use-async-defer-err', err);
                });
            }
        };
    }, [effect, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

    return { value, error, loading };
}

// for when you don't care about the result
// works like useEffect
export function useAsyncEffect(fn: AsyncFn<void>, deps: DependencyList): void {
    useAsync(fn, deps, undefined);
}

// for when just console logging any async errors is enough
// works like useMemo, but has a destructor
export function useAsyncMemo<T>(
    fn: AsyncFn<T>,
    deps: DependencyList,
): T | undefined {
    const { value } = useAsync<T>(fn, deps, undefined);
    return value;
}
