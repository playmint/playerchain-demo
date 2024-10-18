import { memo, useEffect, useState } from 'react';
import { Metric } from '../../runtime/metrics';
import theme from '../styles/default.module.css';

const POOR_THRESHOLD = 5;

const STATUS_OK = {
    color: '',
    msg: '',
    icon: '',
};

const STATUS_POOR = {
    color: '#fac905',
    msg: 'POOR NETWORK CONDITIONS',
    icon: 'sentiment_dissatisfied',
};

const STATUS_BAD = {
    color: '#fac905',
    msg: 'POOR NETWORK CONDITIONS',
    icon: 'sentiment_very_dissatisfied',
};

export default memo(function Connectivity({ metric }: { metric: Metric }) {
    const [status, setStatus] = useState(STATUS_OK);

    useEffect(() => {
        let n = 0;
        let values = [-1, -1, 1, -1];
        let hasBeenZeroBefore = false;
        let prevStatus = STATUS_OK;
        return metric.subscribe((value) => {
            values[n % values.length] = value;
            n++;
            if (!hasBeenZeroBefore && values.every((v) => v > 0)) {
                hasBeenZeroBefore = true;
                values = values.slice(-2);
                n = 0;
            }
            const isBad =
                hasBeenZeroBefore && values.every((v) => v > -1 && v < 2);
            const isPoor =
                isBad ||
                (hasBeenZeroBefore &&
                    values.every((v) => v > -1 && v <= POOR_THRESHOLD));
            const newStatus = isBad
                ? STATUS_BAD
                : isPoor
                  ? STATUS_POOR
                  : STATUS_OK;
            if (newStatus !== prevStatus) {
                setStatus(newStatus);
                prevStatus = newStatus;
            }
        });
    }, [metric]);

    return (
        <>
            {status !== STATUS_OK && (
                <div
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        left: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        color: status.color,
                    }}
                >
                    <span
                        style={{
                            fontSize: '2rem',
                        }}
                        className={theme.materialSymbolsOutlined}
                    >
                        {status.icon}
                    </span>
                    <span
                        style={{
                            color: status.color,
                            marginLeft: '0.5rem',
                        }}
                    >
                        {status.msg}
                    </span>
                </div>
            )}
        </>
    );
});
