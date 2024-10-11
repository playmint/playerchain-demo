import styles from './EndRoundLeaderBoard.module.css';

export default function ReadySetGo({ n }: { n: number }) {
    return (
        <div
            style={{
                flexGrow: 1,
                marginRight: '1rem',
                marginLeft: '1rem',
            }}
        >
            <span className={styles.countdownText}>{n}</span>
            <span className={styles.countdownText2}>{n}</span>
        </div>
    );
}
