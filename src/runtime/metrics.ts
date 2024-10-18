export type CancelSubscription = () => void;
export type Metric = {
    name: string;
    description: string;
    max: number;
    add: (n: number) => void;
    set: (value: number) => void;
    disable: () => void;
    enable: () => void;
    subscribe: (callback: (value: number) => void) => CancelSubscription;
};

export type MetricConfig = {
    name: string;
    description: string;
    max: number;
};

export function createMetric({
    name,
    description,
    max: maxValue,
}: MetricConfig): Metric {
    let counts = 0;
    let prevTime = (performance || Date).now();
    let value = -1;
    let enabled = true;
    const callbacks: ((value: number) => void)[] = [];
    const set = (v: number) => {
        value = v;
        for (const callback of callbacks) {
            callback(value);
        }
    };
    return {
        name,
        description,
        max: maxValue,
        add: (count: number) => {
            if (!enabled) {
                return;
            }
            counts += count;
            const time = (performance || Date).now();
            if (time >= prevTime + 1000) {
                set((counts * 1000) / (time - prevTime));
                prevTime = time;
                counts = 0;
            }
        },
        set,
        disable: () => {
            set(-1);
            enabled = false;
        },
        enable: () => {
            enabled = true;
        },
        subscribe(callback: (value: number) => void): CancelSubscription {
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1) {
                    callbacks.splice(index, 1);
                }
            };
        },
    };
}

export function createDefaultMetrics(fixedUpdatedRate) {
    // since we poll sampling of the inputs the targeted rate is never exact
    // about 10ms should be expected to be lost in the error, but it's pretty
    // constant so we can just add it to the target rate to get a better estimate
    const sampleError = 10;
    const estimatedTargetCPS = Math.floor(
        1000 / (fixedUpdatedRate + sampleError),
    );
    return {
        fps: createMetric({
            name: 'FPS',
            description: `
                Number of Frames rendered per second.
                This value should stay pinned pretty close to
                the browser determined requestAnimationFrame
                rate. If it is eratic, then we are likely CPU
                bound and are struggling to keep up.
            `,
            max: 120,
        }),
        sps: createMetric({
            name: 'SPS',
            description: `
                Number of runs of the simulation per second.
                In an ideal world this value should match the
                target ${estimatedTargetCPS} CPS value one to one.
                Spikes in this value mean that we are performing
                rollbacks, drops in this value without a corrosponding
                drop in CPS may indicate we are unable to process
                simulation ticks fast enough.`,
            max: 60,
        }), // simulations per second
        cps: createMetric({
            name: 'CPS',
            description: `
                Number of input commits we make per second.
                This value should track the target update rate
                (${estimatedTargetCPS}) as closely as possible.
                If this value is lower than the target, then
                we may be network bound. If this value is higher
                then we may be lagging behind other peers and
                attempting to catch up.`,
            max: 60,
        }), // commits per second
    };
}

export type DefaultMetrics = ReturnType<typeof createDefaultMetrics>;
