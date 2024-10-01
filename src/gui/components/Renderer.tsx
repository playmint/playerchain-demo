import * as Comlink from 'comlink';
import { useLiveQuery } from 'dexie-react-hooks';
import { FC, memo, useEffect, useMemo } from 'react';
import CubesRenderer from '../../examples/cubes/CubesRenderer';
import ShooterRenderer from '../../examples/spaceshooter/renderer/ShooterRenderer';
import { RendererProps } from '../../runtime/game';
import { DefaultMetrics } from '../../runtime/metrics';
import { SequencerMode } from '../../runtime/sequencer';
import type { Sequencer } from '../../runtime/sequencer';
import { SimResult } from '../../runtime/simulation';
import { useAsyncMemo } from '../hooks/use-async';
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
    const { peerId, dbname } = useCredentials();
    const { sim, rate, mod, src } = useSimulation();
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
    const seq = useAsyncMemo<Comlink.Remote<Sequencer> | undefined>(
        async (defer) => {
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
            if (!src) {
                console.log('nomod');
                return;
            }
            if (!dbname) {
                console.log('no dbname');
                return;
            }
            const w = new Worker(
                new URL('../workers/sequencer.worker.ts', import.meta.url),
                {
                    type: 'module',
                    /* @vite-ignore */
                    name: `seq worker`,
                },
            );
            defer(async () => {
                w.terminate();
                console.log(`seq worker terminated`);
            });
            const SequencerProxy = Comlink.wrap<typeof Sequencer>(w);
            defer(async () => {
                SequencerProxy[Comlink.releaseProxy]();
            });
            const cfg = {
                src,
                clientPort: await client[Comlink.createEndpoint](),
                channelId,
                rate,
                mode: SequencerMode.CORDIAL,
                interlace,
                channelPeerIds,
                peerId,
                // metrics,
                dbname,
            };
            console.log('starting sequencer----------1', cfg);
            const seq = await new SequencerProxy(
                Comlink.transfer(cfg, [cfg.clientPort]),
            );
            console.log('starting sequencer----------2');
            seq.start().catch((err) => {
                console.error('seq.start err:', err);
            });
            defer(async () => {
                await seq.destroy();
            });
            console.log('started sequencer');
            return seq;
        },
        [
            client,
            channelId,
            rate,
            src,
            peerId,
            db,
            channelPeerIds,
            interlace,
            metrics,
        ],
    );

    // configure event handlers
    useEffect(() => {
        const down = (event: any) => {
            if (event.target.tagName === 'INPUT') {
                return;
            }
            event.preventDefault();
            if (event.repeat) {
                return;
            }
            if (!seq) {
                return;
            }
            seq.onKeyDown(event.key).catch((err) => {
                console.error('keydown-err:', err);
            });
        };
        const up = (event: any) => {
            if (event.target.tagName === 'INPUT') {
                return;
            }
            event.preventDefault();
            if (!seq) {
                return;
            }
            seq.onKeyUp(event.key).catch((err) => {
                console.error('keyup-err:', err);
            });
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [seq]);

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
