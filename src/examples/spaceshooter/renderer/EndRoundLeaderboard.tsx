import '@fontsource-variable/recursive/full.css';
import { getPlayerColorCSS } from '../../../gui/fixtures/player-colors';
import playerIcon from '../assets/playerIcon.png';
import styles from './EndRoundLeaderBoard.module.css';
import { LeaderboardGap, Score, shadeColor } from './LeaderBoard';
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
        <div className={styles.leaderboard}>
            <div className={styles.leaderboardHeader}>
                <span className={styles.leaderboardCategory}>Name</span>
                <span className={styles.leaderboardCategory}>Kills</span>
                <span className={styles.leaderboardCategory}>Deaths</span>
                <span className={styles.leaderboardCategory}>Score</span>
                <span className={styles.leaderboardCategory}>Rank</span>
            </div>
            {scores.map((leader, index) => (
                <LdrEntry
                    key={index + '-' + leader.user}
                    userScore={leader}
                    position={index + 1}
                />
            ))}
        </div>
    );
}

function EndRoundLeaderBoardScores({
    players,
    peerId,
}: {
    players: PlayerInfo[];
    peerId: string;
}) {
    const scores: Score[] = players
        .map((p) => ({
            user: p.name,
            score: p.score,
            color: getPlayerColorCSS(players.findIndex((pp) => pp.id === p.id)), //'#ac75eb',
            isMe: peerId === p.id,
        }))
        .sort((a, b) => b.score - a.score);

    return (
        <div className={styles.leaderboard}>
            <div className={styles.leaderboardEntryRow}>
                <div className={styles.leaderboardCategoryEntry}>
                    <span className={styles.leaderboardUserCategory}>Name</span>
                    <span className={styles.leaderboardScore}>Kills</span>
                    <span className={styles.leaderboardScore}>Deaths</span>
                    <span className={styles.leaderboardScore}>Score</span>
                    <span className={styles.leaderboardScore}>Rank</span>
                </div>
            </div>
            {scores.map((leader, index) => (
                <LdrEntry
                    key={index + '-' + leader.user + '-' + leader.score}
                    userScore={leader}
                    position={
                        scores.findIndex(
                            (score) => score.user === leader.user,
                        ) + 1
                    }
                />
            ))}
        </div>
    );
}

function LdrEntry({
    userScore,
    position,
}: {
    userScore: Score;
    position: number;
}) {
    return (
        <div className={styles.leaderboardRow}>
            <span className={styles.leaderboardUser}>{userScore.user}</span>
            <span className={styles.leaderboardStat}>000</span>
            <span className={styles.leaderboardStat}>000</span>
            <span className={styles.leaderboardStat}>{userScore.score}</span>
            <span className={styles.rankCircleWrapper}>
                <span className={styles.rankCircle}>{position}</span>
            </span>
        </div>
    );
}
