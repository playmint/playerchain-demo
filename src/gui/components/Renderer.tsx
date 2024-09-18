import { useLiveQuery } from 'dexie-react-hooks';
import { FC, memo, useEffect, useMemo } from 'react';
import CubesRenderer from '../../examples/cubes/CubesRenderer';
import ShooterRenderer from '../../examples/spaceshooter/renderer/ShooterRenderer';
import { RendererProps } from '../../runtime/game';
import { Sequencer, SequencerMode } from '../../runtime/sequencer';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSimulation } from '../hooks/use-simulation';

export default memo(function Renderer({
    channelId,
    channelPeerIds,
    interlace,
}: {
    channelId: string;
    channelPeerIds: string[];
    interlace: number;
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
            db,
        });
        seq.start();
        console.log('started sequencer');
        return () => {
            seq.destroy();
            console.log('stopping sequencer');
        };
    }, [client, channelId, rate, mod, peerId, db, channelPeerIds, interlace]);

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
        let timer: any;
        timer = setInterval(() => {
            if (cueing) {
                console.log('skip cue - should be rare, are we cpu bound?');
                return;
            }
            cueing = true;
            try {
                const now = Math.floor(Date.now() / rate);
                sim.cue(now)
                    .then((state: any) => {
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
            cueing = false;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        };
    }, [sim, rate, mod]);

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
        />
    );
});
