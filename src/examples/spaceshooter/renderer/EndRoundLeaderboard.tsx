import '@fontsource-variable/recursive/full.css';
import { getPlayerColorCSS } from '../../../gui/fixtures/player-colors';
import styles from './EndRoundLeaderBoard.module.css';
import { Score } from './LeaderBoard';
import Modal from './Modal';
import { PlayerInfo } from './PlayerHUD';

export default function EndRoundLeaderBoard({
    players,
    peerId,
}: {
    players: PlayerInfo[];
    peerId: string;
}) {
    const scores = players
        .map((p) => ({
            user: p.name,
            score: p.score,
            color: getPlayerColorCSS(players.findIndex((pp) => pp.id === p.id)),
            isMe: peerId === p.id,
        }))
        .sort((a, b) => b.score - a.score);

    return (
        <Modal
            isOpen={true}
            onClose={function (): void {
                throw new Error('Function not implemented.');
            }}
        >
            <div className={styles.leaderboard}>
                <div className={styles.leaderboardHeader}>
                    <span className={styles.leaderboardCategory}>NAME</span>
                    <span className={styles.leaderboardCategory}>KILLS</span>
                    <span className={styles.leaderboardCategory}>DEATHS</span>
                    <span className={styles.leaderboardCategory}>SCORE</span>
                    <span className={styles.leaderboardCategory}>RANK</span>
                </div>
                {scores.map((leader, index) => (
                    <LdrEntry
                        key={index + '-' + leader.user}
                        userScore={leader}
                        rank={index + 1}
                    />
                ))}
            </div>
        </Modal>
    );
}

function LdrEntry({ userScore, rank }: { userScore: Score; rank: number }) {
    return (
        <div className={styles.leaderboardRow}>
            <span
                className={styles.leaderboardUser}
                style={{ color: userScore.color }}
            >
                {userScore.user}
            </span>
            <span className={styles.leaderboardStat}>000</span>
            <span className={styles.leaderboardStat}>000</span>
            <span className={styles.leaderboardStat}>
                {userScore.score.toLocaleString()}
            </span>
            <span className={styles.rankCircleWrapper}>
                <span
                    className={styles.rankCircle}
                    style={{ backgroundColor: userScore.color }}
                >
                    {rank}
                </span>
            </span>
        </div>
    );
}
