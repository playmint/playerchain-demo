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
                <RankCircle rank={rank} color={userScore.color} />
            </span>
        </div>
    );
}

function RankCircle({ rank, color }: { rank: number; color: string }) {
    const shadowColor = darkenColor(color, 0.6);
    return (
        <svg
            width="30"
            height="30"
            viewBox="0 0 60 60"
            style={{ position: 'relative' }}
        >
            <circle
                cx="30"
                cy="30"
                r="25"
                fill={shadowColor}
                style={{ transform: 'translate(0px, 3px)' }}
            />
            <circle
                cx="30"
                cy="30"
                r="25"
                fill={color}
                style={{ transform: 'translate(0px, -3px)' }}
            />
            <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="32px"
                fill="#1d1d1d"
                fontWeight="900"
            >
                {rank}
            </text>
        </svg>
    );
}

function darkenColor(color: string, percent: number): string {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = Math.floor(R * (1 - percent));
    G = Math.floor(G * (1 - percent));
    B = Math.floor(B * (1 - percent));

    const RR = R.toString(16).padStart(2, '0');
    const GG = G.toString(16).padStart(2, '0');
    const BB = B.toString(16).padStart(2, '0');

    return '#' + RR + GG + BB;
}
