import * as Comlink from 'comlink';
import { useLiveQuery } from 'dexie-react-hooks';
import { FC, memo, useCallback, useEffect, useMemo } from 'react';
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
import { isMobile } from '../system/menu';

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

    // track the peer names
    const peerNames = useMemo(() => {
        const names: Record<string, string> = {};
        return names;
    }, []);
    const peers = useLiveQuery(
        () => {
            return db.peerNames.toArray();
        },
        [],
        [],
    );
    useEffect(() => {
        console.log('UPDATED PEER NAMES');
        return peers.forEach((peer) => {
            peerNames[peer.peerId] = peer.name;
        });
    }, [peerNames, peers]);

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
                dbname,
            };
            const seq = await new SequencerProxy(
                Comlink.transfer(cfg, [cfg.clientPort]),
            );
            seq.start().catch((err) => {
                console.error('seq.start err:', err);
            });
            defer(async () => {
                await seq.destroy();
            });
            console.log('started sequencer');
            return seq;
        },
        [client, channelId, rate, src, peerId, db, channelPeerIds, interlace],
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

    const onKeyDown = useCallback(
        (key: string) => {
            if (!seq) {
                return;
            }
            seq.onKeyDown(key).catch((err) => {
                console.error('keydown-err:', err);
            });
        },
        [seq],
    );

    const onKeyUp = useCallback(
        (key: string) => {
            if (!seq) {
                return;
            }
            seq.onKeyUp(key).catch((err) => {
                console.error('keyup-err:', err);
            });
        },
        [seq],
    );

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
        let playing = true;
        const loop = () => {
            if (!playing) {
                return;
            }
            sim.getCurrentRoundLimit()
                .then((round) => {
                    if (!playing) {
                        return null;
                    }
                    if (prevRound !== null && round === prevRound) {
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
                    console.error('cue-to-err:', err);
                    metrics.sps.add(0);
                })
                .finally(() => {
                    loop();
                });
        };
        loop();
        return () => {
            playing = false;
        };
    }, [sim, rate, mod, metrics.sps]);

    if (!mod) {
        return <div>NO MOD</div>;
    }
    if (!GameRenderer) {
        return <div>NO RENDERER</div>;
    }

    return (
        <>
            <GameRenderer
                mod={mod}
                peerId={peerId}
                peerNames={peerNames}
                channelId={channelId}
                metrics={metrics}
            />
            {isMobile && (
                <span
                    style={{
                        touchAction: 'none',
                        pointerEvents: 'auto',
                        userSelect: 'none',
                        position: 'absolute',
                        bottom: '1rem',
                        left: '1rem',
                        color: 'rgba(255,255,255,0.8)',
                    }}
                >
                    <div
                        style={{
                            display: 'inline-block',
                            padding: '1.5rem',
                            pointerEvents: 'auto',
                            userSelect: 'none',
                            background: 'rgba(0,0,0,0.5)',
                        }}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            onKeyDown('ArrowLeft');
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            onKeyUp('ArrowLeft');
                        }}
                    >
                        LEFT
                    </div>
                    <div
                        style={{
                            display: 'inline-block',
                            padding: '1.5rem',
                            pointerEvents: 'auto',
                            userSelect: 'none',
                            background: 'rgba(0,0,0,0.5)',
                        }}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            onKeyDown('ArrowRight');
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            onKeyUp('ArrowRight');
                        }}
                    >
                        RGHT
                    </div>
                </span>
            )}
            {isMobile && (
                <span
                    style={{
                        touchAction: 'none',
                        pointerEvents: 'auto',
                        userSelect: 'none',
                        position: 'absolute',
                        bottom: '1rem',
                        right: '1rem',
                        color: 'rgba(255,255,255,0.8)',
                    }}
                >
                    <div
                        style={{
                            display: 'inline-block',
                            padding: '1.5rem',
                            pointerEvents: 'auto',
                            userSelect: 'none',
                            background: 'rgba(0,0,0,0.5)',
                        }}
                        onTouchStart={() => onKeyDown('ArrowUp')}
                        onTouchEnd={() => onKeyUp('ArrowUp')}
                    >
                        ACEL
                    </div>
                    <div
                        style={{
                            display: 'inline-block',
                            padding: '1.5rem',
                            pointerEvents: 'auto',
                            userSelect: 'none',
                            background: 'rgba(0,0,0,0.5)',
                        }}
                        onTouchStart={() => onKeyDown(' ')}
                        onTouchEnd={() => onKeyUp(' ')}
                    >
                        FIRE
                    </div>
                </span>
            )}
        </>
    );
});
