import '@fontsource-variable/recursive/full.css';
import { getPlayerColorCSS } from '../../../gui/fixtures/player-colors';
import styles from './EndRoundLeaderBoard.module.css';
import { PlayerInfo } from './PlayerHUD';

interface Stat {
    name: string;
    kills: number;
    deaths: number;
    score: number;
    color: string;
}

export default function EndRoundLeaderBoard({
    players,
}: {
    players: PlayerInfo[];
}) {
    const scores = players
        .map((p) => ({
            name: p.name,
            score: p.score,
            kills: p.kills,
            deaths: p.deaths,
            color: getPlayerColorCSS(players.findIndex((pp) => pp.id === p.id)),
        }))
        .sort((a, b) => b.score - a.score);

    return (
        <div className={styles.leaderboard}>
            <div className={styles.titleGroup}>
                <div className={styles.titleText}>RESULTS</div>
                <div className={styles.titleText2}>RESULTS</div>
            </div>
            <div className={styles.leaderboardHeader}>
                <span className={styles.leaderboardCategory}>NAME</span>
                <span className={styles.leaderboardCategory}>KILLS</span>
                <span className={styles.leaderboardCategory}>DEATHS</span>
                <span className={styles.leaderboardCategory}>SCORE</span>
                <span className={styles.leaderboardCategory}>RANK</span>
            </div>
            {scores.map((player, index) => (
                <PlayerRow
                    key={index + '-' + player.name}
                    userScore={player}
                    rank={index + 1}
                />
            ))}
        </div>
    );
}

function PlayerRow({ userScore, rank }: { userScore: Stat; rank: number }) {
    const playerName = rank === 1 ? '👑 ' + userScore.name : userScore.name;
    return (
        <div className={`${styles.leaderboardRow}`}>
            <span
                className={styles.leaderboardUser}
                style={{ color: userScore.color }}
            >
                {playerName}
            </span>
            <span className={styles.leaderboardStat}>{userScore.kills}</span>
            <span className={styles.leaderboardStat}>{userScore.deaths}</span>
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
