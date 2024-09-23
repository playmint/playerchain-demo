import { useLiveQuery } from 'dexie-react-hooks';
import { FC, memo, useEffect, useMemo } from 'react';
import CubesRenderer from '../../examples/cubes/CubesRenderer';
import ShooterRenderer from '../../examples/spaceshooter/renderer/ShooterRenderer';
import { RendererProps } from '../../runtime/game';
import { DefaultMetrics } from '../../runtime/metrics';
import { Sequencer, SequencerMode } from '../../runtime/sequencer';
import { SimResult } from '../../runtime/simulation';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSimulation } from '../hooks/use-simulation';

export default memo(function Renderer({
    channelId,
    channelPeerIds,
    interlace,
    metrics,
}: {
    channelId: string;
    channelPeerIds: string[];
    interlace: number;
    metrics: DefaultMetrics;
}) {
    const db = useDatabase();
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

    const peerNames = useMemo(() => {
        const names: Record<string, string> = {};
        return names;
    }, []);

    // track the peer names
    const peers = useLiveQuery(() => db.peerNames.toArray(), [], []);
    useEffect(
        () =>
            peers.forEach((peer) => {
                peerNames[peer.peerId] = peer.name;
            }),
        [peerNames, peers],
    );

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
                send: async (...args) => client.send(...args),
            },
            channelId,
            rate,
            mode: SequencerMode.CORDIAL,
            interlace,
            channelPeerIds,
            peerId,
            metrics,
            db,
        });
        seq.start();
        console.log('started sequencer');
        return () => {
            seq.destroy();
            console.log('stopping sequencer');
        };
    }, [
        client,
        channelId,
        rate,
        mod,
        peerId,
        db,
        channelPeerIds,
        interlace,
        metrics,
    ]);

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
        let prevRound: number | null = null;
        let cueing = false;
        let timer: any;
        timer = setInterval(() => {
            if (cueing) {
                console.log('skip cue - should be rare, are we cpu bound?');
                return;
            }
            cueing = true;
            try {
                sim.getCurrentRoundLimit()
                    .then((round) => {
                        if (prevRound !== null && round === prevRound) {
                            cueing = false;
                            metrics.sps.add(0);
                            return null;
                        }
                        prevRound = round;
                        return sim.cue(round);
                    })
                    .then((result: SimResult | null) => {
                        if (!result) {
                            return;
                        }
                        metrics.sps.add(result.runs);
                        mod.load(result.state.data);
                        mod.notify();
                    })
                    .catch((err) => {
                        cueing = false;
                        console.error('cue-to-err:', err);
                        metrics.sps.add(0);
                    })
                    .finally(() => {
                        cueing = false;
                    });
            } catch (err) {
                console.error('cue-err:', err);
                cueing = false;
                metrics.sps.add(0);
            }
        }, rate);
        return () => {
            cueing = false;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        };
    }, [sim, rate, mod, metrics.sps]);

    if (!mod) {
        return <div>NO MOD</div>;
    }
    if (!GameRenderer) {
        return <div>NO RENDERER</div>;
    }

    return (
        <GameRenderer
            mod={mod}
            peerId={peerId}
            peerNames={peerNames}
            channelId={channelId}
            metrics={metrics}
        />
    );
});
