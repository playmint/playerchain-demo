import { FC, memo, useEffect, useMemo, useState } from 'react';
import CubesRenderer from '../../examples/cubes/CubesRenderer';
import ShooterRenderer from '../../examples/spaceshooter/renderer/ShooterRenderer';
import { RendererProps } from '../../runtime/game';
import { Sequencer } from '../../runtime/sequencer';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useSimulation } from '../hooks/use-simulation';

// const rewindMax = 200;

export default memo(function Renderer({ channelId }: { channelId: string }) {
    const [playing, _setPlaying] = useState<boolean>(true);
    // const [rewind, setRewind] = useState<number>(rewindMax);
    // const [rewindFrom, setRewindFrom] = useState<number>(0);
    const [cueTo, setCueTo] = useState<number>(0);
    // const [world, setWorld] = useState<World<RenderSchema>>();
    const { peerId } = useCredentials();
    const { sim, rate, mod } = useSimulation();
    const client = useClient();

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
    const [_sequencer, setSequencer] = useState<Sequencer>();
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
            console.log('no reate');
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
        setSequencer(seq);
        return () => {
            seq.stop();
            setSequencer(undefined);
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
        sim.cue(cueTo > 0 ? cueTo : Math.floor(Date.now() / rate))
            .then((state) => {
                mod.load(state.data);
                mod.notify();
            })
            .then(() => {
                setTimeout(() => {
                    if (!playing) {
                        return;
                    }
                    // console.log('cue-to:', cueTo);

                    const now = Math.floor(Date.now() / rate);
                    setCueTo(now);
                }, rate);
            })
            .catch((err) => {
                console.error('cue-to-err:', err);
            });
    }, [cueTo, sim, playing, rate, mod]);

    // const onCue = useCallback((e) => {
    //     setRewind(e.target.value);
    // }, []);

    // const togglePlay = useCallback(() => {
    //     if (!rate) {
    //         return;
    //     }
    //     setPlaying((prev) => {
    //         const playing = !prev;
    //         const now = Math.floor(Date.now() / rate);
    //         if (playing) {
    //             setRewindFrom(0);
    //             setRewind(rewindMax);
    //             setCueTo(now);
    //         } else {
    //             setRewindFrom(now);
    //         }
    //         return playing;
    //     });
    // }, [rate]);

    // useEffect(() => {
    //     if (playing) {
    //         return;
    //     }
    //     if (rewindFrom > 0) {
    //         setCueTo(rewindFrom - (rewindMax - rewind));
    //     }
    // }, [playing, rewind, rewindFrom, sim]);

    if (!mod) {
        return <div>NO MOD</div>;
    }
    if (!GameRenderer) {
        return <div>NO RENDERER</div>;
    }

    // {/* {GameRenderer && (
    //     <Html
    //         position={[-2, -3, 0]}
    //         style={{
    //             backgroundColor: 'gray',
    //         }}
    //     >
    //         <button onClick={togglePlay}>
    //             {playing ? 'pause' : 'play'}
    //         </button>
    //         {!playing && (
    //             <input
    //                 type="range"
    //                 style={{ width: '350px' }}
    //                 min={0}
    //                 max={rewindMax}
    //                 onChange={onCue}
    //                 value={playing ? rewindMax : rewind}
    //                 step={1}
    //             />
    //         )}
    //     </Html>
    // )} */}
    return <GameRenderer mod={mod} peerId={peerId} channelId={channelId} />;
});
