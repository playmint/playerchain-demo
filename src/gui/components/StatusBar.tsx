import Dexie from 'dexie';
import { memo, useEffect, useState } from 'react';
import { NETWORK_ID } from '../../runtime/config';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import theme from '../styles/default.module.css';

interface StatusInfo {
    tx?: number;
    rx?: number;
    online?: boolean;
    ready?: boolean;
    address?: string;
    port?: number;
    natName?: string;
}

export default memo(function StatusBar() {
    const { clientId, shortId } = useCredentials();
    const [info, setInfo] = useState<StatusInfo>();
    const db = useDatabase();

    useEffect(() => {
        let updating = false;
        setInterval(() => {
            if (updating) {
                return;
            }
            updating = true;
            db.network
                .get(NETWORK_ID)
                .then((net) => {
                    setInfo((prev) => ({
                        ...prev,
                        online: !!net?.online,
                        ready: !!net?.ready,
                        address: net?.address,
                        port: net?.port,
                        natName: net?.natName,
                    }));
                    return db.messages.count();
                })
                .then((rx) => {
                    setInfo((prev) => ({ ...prev, rx }));
                    return db.messages
                        .where(['peer', 'height'])
                        .between(
                            [clientId, Dexie.minKey],
                            [clientId, Dexie.maxKey],
                        )
                        .last();
                })
                .then((tx) => {
                    setInfo((prev) => ({ ...prev, tx: tx?.height ?? 0 }));
                })
                .catch((err) => {
                    console.error('statusbar-err', err);
                })
                .finally(() => {
                    updating = false;
                });
        }, 2000);
    }, [clientId, db]);
    console.log('render statusbar');
    return (
        <div
            style={{
                display: 'flex',
                background: '#333',
                flexShrink: 0,
                color: '#aaa',
                fontSize: '0.8rem',
                justifyContent: 'space-between',
                alignContent: 'center',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    gap: '1rem',
                    alignContent: 'center',
                }}
            >
                <div
                    style={{
                        padding: '3px 8px',
                    }}
                >
                    <span
                        className={theme.materialSymbolsOutlined}
                        style={{ padding: '0 4px' }}
                    >
                        key
                    </span>
                    <span>{shortId}</span>
                </div>
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '1rem',
                    alignContent: 'center',
                    color: 'rgba(255, 255, 255, 0.7)',
                }}
            >
                <div style={{ padding: '3px 8px' }}>
                    tx:{info?.tx || '-'} rx:{info?.rx || '-'}
                </div>
                <div style={{ padding: '3px 8px' }}>{info?.natName}</div>
                <div style={{ padding: '3px 8px' }}>
                    {info?.address ? `${info?.address}:${info?.port}` : ''}
                </div>
                <div
                    style={{
                        background: info?.online ? '#339129' : '#f96d00',
                        color: '#eee',
                        padding: '3px 8px',
                    }}
                    // onDoubleClick={toggleOnline}
                >
                    <span
                        className={theme.materialSymbolsOutlined}
                        style={{ paddingRight: '4px' }}
                    >
                        {info?.online ? 'wifi' : 'wifi_off'}
                    </span>
                    {info?.online ? 'ONLINE' : 'OFFLINE'}
                </div>
            </div>
        </div>
    );
});
