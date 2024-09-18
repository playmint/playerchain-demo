import React from "react";
import styles from './EndRoundLeaderBoard.module.css';
import { PlayerInfo } from "./PlayerHUD";
import { LeaderboardGap, Score, shadeColor } from "./LeaderBoard";
import Modal from "./Modal";


export default function EndRoundLeaderBoard({
    player,
    players,
    peerId,
}: {
    player: PlayerInfo;
    players: PlayerInfo[];
    peerId: string;
}) {

    const color = `#${player.id.slice(0, 6)}`
    const shadowColor = shadeColor(color, -25);

    return(
        <Modal isOpen={true} onClose={function (): void {
            throw new Error("Function not implemented.");
        } }>
            <div className={styles.titleGroup}>
                <div className={styles.titleText}>
                GAME OVER
                </div>
                <div className={styles.titleText2}>
                GAME OVER
                </div>
            </div>

            <div className={styles.playerStats}>
                <div className={styles.playerIcon}></div>
                <div>
                    <span
                        className={`${styles.playerScoreCircle} ${styles.playerShadowCircle}`}
                        style={{ backgroundColor: shadowColor }}
                    >
                        <span
                        className={styles.playerScoreCircle}
                        style={{ backgroundColor: color}}
                    >
                        {0}
                    </span>
                    </span>
                </div>
                <div className={styles.playerName}>{player.name}</div>
                <div>
                    <span className={styles.playerStatLeft}>
                    {'Score'}
                    </span>
                    <span className={styles.playerStatRight}>
                        {player.score}
                    </span>
                </div>
            </div>
            <div style={{float: 'left'}}>
            <EndRoundLeaderBoardScores players={players} peerId={peerId} />
            </div>

        </Modal>
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
            color: `#${p.id.slice(0, 6)}`, //'#ac75eb',
            isMe: peerId === p.id,
        }))
        .sort((a, b) => b.score - a.score);

    return (
        <div className={styles.leaderBoard}>
            <div className={styles.leaderboardRntryRow} >
                <div className={styles.leaderboardCategoryEntry}>
                    <span className={styles.leaderboardUserCategory}>
                        Name
                    </span>
                    <span className={styles.leaderboardScore}>
                        Kills
                    </span>
                    <span className={styles.leaderboardScore}>
                        Deaths
                    </span>
                    <span className={styles.leaderboardScore}>
                        Score
                    </span>
                    <span className={styles.leaderboardScore}>
                        Rank
                    </span>
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

function LdrEntry(props: {
    userScore: Score;
    position: number;
    scoresBetween?: number;
}) {
    const shadowColor = shadeColor(props.userScore.color, -25);
    const entryClass = `${styles.leaderboardEntry}`;

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
                        {'000'}
                    </span>
                    <span className={styles.leaderboardScore}>
                        {'000'}
                    </span>
                    <span className={styles.leaderboardScore}>
                        {props.userScore.score}
                    </span>
                    <span className={styles.leaderboardScore}>
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
                    </span>
                </div>
            </div>
        </>
    );
}