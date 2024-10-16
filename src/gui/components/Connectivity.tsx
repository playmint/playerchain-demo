import { useEffect, useState } from 'react';
import { Metric } from '../../runtime/metrics';
import theme from '../styles/default.module.css';

const SHOW_AT_THRESHOLD = 5;

export default function Connectivity({
    metric,
    peerCount,
}: {
    metric: Metric;
    peerCount: number;
}) {
    const [state, setState] = useState({
        showConnectivity: true,
        color: '#fac905',
    });

    useEffect(() => {
        metric.subscribe((value) => {
            setState({
                showConnectivity: value <= SHOW_AT_THRESHOLD && peerCount > 0,
                color: value < 1 ? '#FF0000' : '#fac905',
            });
        });
    }, [metric, peerCount]);

    return (
        <>
            {state.showConnectivity && (
                <span
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        left: '1rem',
                        color: state.color,
                    }}
                    className={theme.materialSymbolsOutlined}
                >
                    link
                </span>
            )}
        </>
    );
}
