import { memo } from 'react';
import { getPlayerColorCSS } from '../../../gui/fixtures/player-colors';
import styles from './LeaderBoard.module.css';
import { PlayerInfo } from './PlayerHUD';

export type Score = {
    id: string;
    user: string;
    score: number;
    color: string;
    animClass?: string;
    isMe?: boolean;
    lastPosition?: number;
};

export default memo(function LeaderBoard({
    players,
    peerId,
}: {
    players: PlayerInfo[];
    peerId: string;
}) {
    const scores: Score[] = players
        .map((p) => ({
            id: p.id,
            user: p.name,
            score: p.score,
            color: getPlayerColorCSS(players.findIndex((pp) => pp.id === p.id)), //'#ac75eb',
            isMe: peerId === p.id,
        }))
        .sort((a, b) => b.score - a.score);

    const topThree = scores.slice(0, 3);
    const isMeInTop = topThree.some((score) => score.isMe);

    // Iterate over all scores to determine the animation class
    scores.forEach((score, index) => {
        if (score.lastPosition === undefined || score.lastPosition === null) {
            score.lastPosition = -1;
        }

        if (index > score.lastPosition && index < 4) {
            score.animClass = styles.swapToUp;
        } else if (index < score.lastPosition && index < 4) {
            if (score.isMe === true && index == 3) {
                score.animClass = '';
            } else {
                score.animClass =
                    index == (isMeInTop ? 3 : 2)
                        ? styles.swapToLeft
                        : styles.swapToDown;
            }
        } else {
            score.animClass = '';
        }

        // Update lastPosition to current index
        score.lastPosition = index;
    });

    return (
        <div className={styles.leaderboard}>
            {scores.slice(0, 4).map((leader, index) => (
                <LdrEntry
                    key={leader.id}
                    userScore={leader}
                    position={index + 1}
                    scoresBetween={0}
                />
            ))}
        </div>
    );
});

const LdrEntry = memo(function LdrEntry(props: {
    userScore: Score;
    position: number;
    scoresBetween?: number;
}) {
    let entryClass =
        props.position === 1
            ? `${styles.leaderboardEntry} ${styles.leaderboardEntryLeader}`
            : `${styles.leaderboardEntry}`;

    entryClass += ` ${props.userScore.animClass}`;

    const classN = `${styles.leaderboardRntryRow} ${(props.position - 1).toString()}`;

    return (
        <>
            <div className={classN}>
                <div className={entryClass}>
                    <span
                        className={styles.leaderboardUser}
                        style={{ color: props.userScore.color }}
                    >
                        {props.userScore.user}
                    </span>
                    <span className={styles.leaderboardScore}>
                        {props.userScore.score}
                    </span>
                </div>
            </div>
        </>
    );
});
