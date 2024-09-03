export class Mutex {
    private _queue: {
        resolve: (release: ReleaseFunction) => void;
    }[] = [];

    private _isLocked = false;

    acquire() {
        return new Promise<ReleaseFunction>((resolve) => {
            this._queue.push({ resolve });
            this._dispatch();
        });
    }

    async runExclusive<T>(callback: () => Promise<T>) {
        const release = await this.acquire();
        try {
            return await callback();
        } finally {
            release();
        }
    }

    private _dispatch() {
        if (this._isLocked) {
            // The resource is still locked.
            // Wait until next time.
            return;
        }
        const nextEntry = this._queue.shift();
        if (!nextEntry) {
            // There is nothing in the queue.
            // Do nothing until next dispatch.
            return;
        }
        // The resource is available.
        this._isLocked = true; // Lock it.
        // and give access to the next operation
        // in the queue.
        nextEntry.resolve(this._buildRelease());
    }

    private _buildRelease(): ReleaseFunction {
        return () => {
            // Each release function make
            // the resource available again
            this._isLocked = false;
            // and call dispatch.
            this._dispatch();
        };
    }
}

export type ReleaseFunction = () => void;
