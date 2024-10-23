import styles from './EndRoundLeaderBoard.module.css';

export default function ReadySetGo({ n }: { n: number }) {
    return (
        <div className={styles.countdownContainer}>
            <span className={styles.countdownText}>{n}</span>
            <span className={styles.countdownText2}>{n}</span>
        </div>
    );
}
