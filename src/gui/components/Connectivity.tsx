import { useEffect, useState } from 'react';
import { Metric } from '../../runtime/metrics';
import theme from '../styles/default.module.css';

const SHOW_AT_THRESHOLD = 6;

export default function Connectivity({
    metric,
    peerCount,
}: {
    metric: Metric;
    peerCount: number;
}) {
    const [state, setState] = useState({
        showConnectivity: false,
        color: '#fac905',
        icon: 'sentiment_dissatisfied',
    });

    useEffect(() => {
        metric.subscribe((value) => {
            setState({
                showConnectivity: value <= SHOW_AT_THRESHOLD && peerCount > 0,
                color: value < 1 ? '#FF0000' : '#fac905',
                icon:
                    value < 1
                        ? 'sentiment_very_dissatisfied'
                        : 'sentiment_dissatisfied',
            });
        });
    }, [metric, peerCount]);

    return (
        <>
            {state.showConnectivity && (
                <div
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        left: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        color: state.color,
                    }}
                >
                    <span
                        style={{
                            fontSize: '2rem',
                        }}
                        className={theme.materialSymbolsOutlined}
                    >
                        {state.icon}
                    </span>
                    <span
                        style={{
                            color: 'white',
                            marginLeft: '0.5rem',
                        }}
                    >
                        connection issue
                    </span>
                </div>
            )}
        </>
    );
}
