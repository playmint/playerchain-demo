import '@fontsource-variable/recursive/full.css';
import { getPlayerColorCSS } from '../../../gui/fixtures/player-colors';
import playerIcon from '../assets/playerIcon.png';
import styles from './EndRoundLeaderBoard.module.css';
import { LeaderboardGap, Score, shadeColor } from './LeaderBoard';
import Modal from './Modal';
import { PlayerInfo } from './PlayerHUD';

export default function EndRoundLeaderBoard({
    player,
    players,
    peerId,
}: {
    player: PlayerInfo;
    players: PlayerInfo[];
    peerId: string;
}) {
    const color = getPlayerColorCSS(
        players.findIndex((pp) => pp.id === player.id),
    );
    const shadowColor = shadeColor(color, -25);
    const scores: Score[] = players
        .map((p) => ({
            user: p.name,
            score: p.score,
            color: getPlayerColorCSS(players.findIndex((pp) => pp.id === p.id)), //'#ac75eb',
            isMe: peerId === p.id,
        }))
        .sort((a, b) => b.score - a.score);

    const position = scores.findIndex((score) => score.isMe) + 1;

    return (
        <Modal
            isOpen={true}
            onClose={function (): void {
                throw new Error('Function not implemented.');
            }}
        >
            <div className={styles.titleGroup}>
                <div className={styles.titleText}>GAME OVER</div>
                <div className={styles.titleText2}>GAME OVER</div>
            </div>

            <div className={styles.playerStats}>
                <div
                    className={styles.playerIcon}
                    style={{ backgroundImage: `url(${playerIcon})` }}
                ></div>
                <div>
                    <span
                        className={`${styles.playerScoreCircle} ${styles.playerShadowCircle}`}
                        style={{ backgroundColor: shadowColor }}
                    >
                        <span
                            className={styles.playerScoreCircle}
                            style={{ backgroundColor: color }}
                        >
                            {position}
                        </span>
                    </span>
                </div>
                <div className={styles.playerName}>{player.name}</div>
                <div>
                    <span className={styles.playerStatLeft}>{'Score'}</span>
                    <span className={styles.playerStatRight}>
                        {player.score}
                    </span>
                </div>
            </div>
            <div style={{ float: 'left' }}>
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

function LdrEntry(props: {
    userScore: Score;
    position: number;
    scoresBetween?: number;
}) {
    const shadowColor = shadeColor(props.userScore.color, -25);
    const entryClass = `${styles.leaderboardEntry}`;

    const classN = `${styles.leaderboardEntryRow} ${(props.position - 1).toString()}`;

    return (
        <>
            <LeaderboardGap count={props.scoresBetween} />
            <div className={classN}>
                <div className={entryClass}>
                    <span className={styles.leaderboardUser}>
                        {props.userScore.user}
                    </span>
                    <span className={styles.leaderboardScore}>{'000'}</span>
                    <span className={styles.leaderboardScore}>{'000'}</span>
                    <span className={styles.leaderboardScore}>
                        {props.userScore.score}
                    </span>
                    <span className={styles.leaderboardScore}>
                        <span
                            className={`${styles.scoreCircle} ${styles.playerShadowCircle}`}
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
