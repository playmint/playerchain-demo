import { FC, memo, useEffect, useMemo } from 'react';
import CubesRenderer from '../../examples/cubes/CubesRenderer';
import ShooterRenderer from '../../examples/spaceshooter/renderer/ShooterRenderer';
import { RendererProps } from '../../runtime/game';
import { Sequencer } from '../../runtime/sequencer';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useSimulation } from '../hooks/use-simulation';

// const rewindMax = 200;

export default memo(function Renderer({ channelId }: { channelId: string }) {
    const { peerId } = useCredentials();
    const { sim, rate, mod } = useSimulation();
    const client = useClient();
    console.log('Renderer.tsx render', rate);

    const GameRenderer: FC<RendererProps> | undefined = useMemo(() => {
        // HMR breaks this, hard coding a switch for now
        // return mod?.getRenderComponent();
        if (/Cube/.test(mod?.constructor.name || '')) {
            return CubesRenderer;
        } else if (/Shoot/.test(mod?.constructor.name || '')) {
            return ShooterRenderer;
        }
    }, [mod]);

    // start the channel sequencer
    useEffect(() => {
        if (!client) {
            console.log('no client');
            return;
        }
        if (!channelId) {
            console.log('no channel id');
            return;
        }
        if (!rate) {
            console.log('no rate set');
            return;
        }
        if (!mod) {
            console.log('nomod');
            return;
        }
        const seq = new Sequencer({
            mod,
            committer: {
                commit: async (...args) => client.commit(...args),
            },
            channelId,
            rate,
        });
        console.log('starting sequencer');
        seq.start();
        return () => {
            seq.destroy();
        };
    }, [client, channelId, rate, mod]);

    // configure event handlers
    useEffect(() => {
        const down = (event: any) => {
            if (event.target.tagName === 'INPUT') {
                return;
            }
            event.preventDefault();
            if (!mod) {
                return;
            }
            mod.onKeyDown(event.key);
        };
        const up = (event: any) => {
            if (event.target.tagName === 'INPUT') {
                return;
            }
            event.preventDefault();
            if (!mod) {
                return;
            }
            mod.onKeyUp(event.key);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [mod]);

    useEffect(() => {
        if (!rate) {
            return;
        }
        if (!sim) {
            return;
        }
        if (!mod) {
            return;
        }
        let cueing = false;
        const timer = setInterval(() => {
            if (cueing) {
                console.log('skip cue');
                return;
            }
            cueing = true;
            try {
                const now = Math.floor(Date.now() / rate);
                sim.cue(now)
                    .then((state: any) => {
                        cueing = false;
                        if (!state) {
                            return;
                        }
                        mod.load(state.data);
                        mod.notify();
                    })
                    .catch((err) => {
                        cueing = false;
                        console.error('cue-to-err:', err);
                    })
                    .finally(() => {
                        cueing = false;
                    });
            } catch (err) {
                console.error('cue-err:', err);
                cueing = false;
            }
        }, rate);
        return () => {
            clearInterval(timer);
            cueing = false;
        };
    }, [sim, rate, mod]);

    if (!mod) {
        return <div>NO MOD</div>;
    }
    if (!GameRenderer) {
        return <div>NO RENDERER</div>;
    }

    return <GameRenderer mod={mod} peerId={peerId} channelId={channelId} />;
});
