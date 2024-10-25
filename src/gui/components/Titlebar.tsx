import { config as socketConfig } from 'socket:application';
import { getVersionStringFromConfig } from '../../runtime/utils';
import theme from '../styles/default.module.css';
import { isWindows } from '../system/menu';

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
                    display: isWindows ? 'none' : 'flex',
                    justifyContent: 'center',
                    gap: '1rem',
                    flexGrow: 1,
                }}
            >
                <strong>
                    Playerchain Demo {getVersionStringFromConfig(socketConfig)}
                </strong>
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
