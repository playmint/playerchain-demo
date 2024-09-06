import { PlayerData } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import styles from './LeaderBoard.module.css';

interface Score {
    user: string;
    score: number;
    color: string;
    animClass?: string;
    isMe?: boolean;
    lastPosition?: number;
}

export default function LeaderBoard({
    players,
    peerId,
}: {
    players: (PlayerData<ShooterSchema['player']> & { id: string })[];
    peerId: string;
}) {
    const scores: Score[] = players
        .map((p) => ({
            user: p.name,
            score: p.score,
            color: `#${p.id.slice(0, 6)}`, //'#ac75eb',
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

    let leaders: Score[];
    let meScoreIndex = -1;

    if (isMeInTop) {
        leaders = scores.slice(0, 4);
    } else {
        const meScore = scores.find((score, index) => {
            if (score.isMe) {
                meScoreIndex = index;
                return true;
            }
            return false;
        });
        if (meScore) {
            leaders = [...topThree, meScore];
        } else {
            leaders = topThree;
        }
    }

    const scoresBetween = meScoreIndex > 3 ? meScoreIndex - 3 : 0;

    return (
        <div className={styles.leaderboard}>
            {leaders.map((leader, index) => (
                <LdrEntry
                    key={index + '-' + leader.user + '-' + leader.score}
                    userScore={leader}
                    position={
                        scores.findIndex(
                            (score) => score.user === leader.user,
                        ) + 1
                    }
                    scoresBetween={
                        !isMeInTop && index === 3 ? scoresBetween : 0
                    }
                />
            ))}
        </div>
    );
}

function LeaderboardGap({ count }: { count: number | undefined }) {
    const defaultCount = 0;
    return (
        <div className={styles.leaderboardGap}>
            {Array.from({ length: count || defaultCount }, (_, i) => (
                <svg
                    key={i}
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <circle
                        cx="5"
                        cy="5"
                        r="4"
                        fill="#00000080"
                        stroke="rgb(92, 144, 255)"
                        strokeWidth={1}
                    />
                </svg>
            ))}
        </div>
    );
}

function LdrEntry(props: {
    userScore: Score;
    position: number;
    scoresBetween?: number;
}) {
    const shadowColor = shadeColor(props.userScore.color, -25);
    let entryClass =
        props.position === 1
            ? `${styles.leaderboardEntry} ${styles.leaderboardEntryLeader}`
            : `${styles.leaderboardEntry}`;

    entryClass += ` ${props.userScore.animClass}`;

    const classN = `${styles.leaderboardRntryRow} ${(props.position - 1).toString()}`;

    return (
        <>
            <LeaderboardGap count={props.scoresBetween} />
            <div className={classN}>
                <div className={entryClass}>
                    <span className={styles.leaderboardUser}>
                        {props.userScore.user}
                    </span>
                    <span className={styles.leaderboardScore}>
                        {props.userScore.score}
                    </span>
                    <span
                        className={`${styles.scoreCircle} ${styles.shadowCircle}`}
                        style={{ backgroundColor: shadowColor }}
                    />
                    <span
                        className={styles.scoreCircle}
                        style={{ backgroundColor: props.userScore.color }}
                    >
                        {props.position}
                    </span>
                </div>
            </div>
        </>
    );
}

function shadeColor(color: string, percent: number) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = Math.floor((R * (100 + percent)) / 100);
    G = Math.floor((G * (100 + percent)) / 100);
    B = Math.floor((B * (100 + percent)) / 100);

    R = R < 255 ? R : 255;
    G = G < 255 ? G : 255;
    B = B < 255 ? B : 255;

    const RR =
        R.toString(16).length === 1 ? '0' + R.toString(16) : R.toString(16);
    const GG =
        G.toString(16).length === 1 ? '0' + G.toString(16) : G.toString(16);
    const BB =
        B.toString(16).length === 1 ? '0' + B.toString(16) : B.toString(16);

    return '#' + RR + GG + BB;
}
