import { memo, useEffect, useState } from 'react';
import { Metric } from '../../runtime/metrics';
import theme from '../styles/default.module.css';

const BAD_THRESHOLD = 5;
const FATAL_THRESHOLD = 2;

enum ConnectivityStatus {
    OK,
    BAD,
    FATAL,
}

export default memo(function Connectivity({ metric }: { metric: Metric }) {
    const [status, setStatus] = useState({
        status: ConnectivityStatus.OK,
        color: '#fac905',
        icon: 'sentiment_dissatisfied',
    });

    useEffect(() => {
        let n = 0;
        const values = [-1, -1, -1];
        let hasBeenZeroBefore = false;
        let prevStatus = ConnectivityStatus.OK;
        const unsubscribe = metric.subscribe((value) => {
            values[n % values.length] = value;
            n++;
            if (!hasBeenZeroBefore && values.every((v) => v > 0)) {
                hasBeenZeroBefore = true;
            }
            const isFatal =
                hasBeenZeroBefore &&
                values.every((v) => v > -1 && v <= FATAL_THRESHOLD);
            const isBad =
                isFatal ||
                (hasBeenZeroBefore &&
                    values.every((v) => v > -1 && v <= BAD_THRESHOLD));
            const newStatus = isFatal
                ? ConnectivityStatus.FATAL
                : isBad
                  ? ConnectivityStatus.BAD
                  : ConnectivityStatus.OK;
            if (newStatus !== prevStatus) {
                setStatus({
                    status: newStatus,
                    color:
                        newStatus === ConnectivityStatus.FATAL
                            ? '#FF0000'
                            : '#fac905',
                    icon:
                        newStatus === ConnectivityStatus.FATAL
                            ? 'sentiment_very_dissatisfied'
                            : 'sentiment_dissatisfied',
                });
                prevStatus = newStatus;
            }
        });
        return () => unsubscribe();
    }, [metric]);

    return (
        <>
            {status.status !== ConnectivityStatus.OK && (
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
                        connection issue
                    </span>
                </div>
            )}
        </>
    );
});
