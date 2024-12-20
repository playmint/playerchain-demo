import platform from 'runtime:platform';
import { getVersionString } from '../../runtime/utils';
import theme from '../styles/default.module.css';

export function Titlebar({
    toggleChannelPanel,
}: {
    toggleChannelPanel: () => void;
}) {
    return (
        <div
            style={{
                display: 'flex',
                background: '#333',
                flexShrink: 0,
                color: '#aaa',
                fontSize: '0.8rem',
                justifyContent: 'space-between',
            }}
            className={theme.titlebar}
        >
            <div
                className={theme.windowDrag}
                style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    gap: '1rem',
                }}
            >
                <div></div>
            </div>
            <div
                className={theme.windowDrag}
                style={{
                    display: platform.isWindows ? 'none' : 'flex',
                    justifyContent: 'center',
                    gap: '1rem',
                    flexGrow: 1,
                }}
            >
                <strong>Playerchain Demo {getVersionString()}</strong>
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.4rem',
                    color: '#999',
                    fontSize: '1.2rem',
                }}
            >
                <span
                    onClick={toggleChannelPanel}
                    className={theme.materialSymbolsOutlined}
                >
                    right_panel_close
                </span>
            </div>
        </div>
    );
}
