import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { RecordNotFoundError } from '@atproto/api/dist/client/types/com/atproto/repo/getRecord';
import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { schemaDict } from '../../../lexicon/lexicons';
import * as SpaceshooterStats from '../../../lexicon/types/com/playmint/dev/spaceshooter/stats';
import { nullPlayerStats } from '../../fixtures/player-stats';
import { useATProto } from '../../hooks/use-atproto';
import { useClient } from '../../hooks/use-client';
import { useProfile } from '../../providers/ProfileProvider';
import { GameTitle, Panel, PanelButton, Screen } from './Screen';

const StyledPlayerProfile = styled.div`
    > .header {
        display: flex;
        align-items: center;
        width: 100%;

        > img {
            flex-shrink: 0;
            width: 100px;
            height: 100px;
            border-radius: 50%;
            overflow: hidden;
        }

        > .playerName {
            flex-grow: 1;
            margin-left: 20px;
            font-size: 1.5rem;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }

    > .stats {
        margin-top: 40px;
    }
`;

const PlayerStat = styled.div`
    font-size: 1.5rem;
    line-height: 2.3rem;
`;

const PlayerStatSpacer = styled.div`
    height: 2.3rem;
`;

export const MenuScreen: FunctionComponent = () => {
    const { joinLobby } = useClient();
    const { agent, logout } = useATProto();
    const { getProfile, getStats } = useProfile();
    const [bskyProfile, setBskyProfile] = useState<
        ProfileViewDetailed | undefined
    >();
    const [playerStats, setPlayerStats] = useState<
        SpaceshooterStats.Record | undefined
    >();

    const onPost = useCallback(async () => {
        if (!agent) {
            return;
        }

        const recordType = schemaDict.ComPlaymintDevSpaceshooterStats.id;
        const rkey = 'self'; //TID.nextStr();

        let record: SpaceshooterStats.Record;
        try {
            const recordRes = await agent.com.atproto.repo.getRecord({
                repo: agent.assertDid,
                collection: recordType,
                rkey,
            });

            console.log('recordRes:', recordRes);
            if (
                !SpaceshooterStats.isRecord(recordRes.data.value) ||
                !SpaceshooterStats.validateRecord(recordRes.data.value)
            ) {
                console.error(
                    'record is not of type SpaceshooterStats.Record',
                    recordRes.data.value,
                );
                return;
            }
            record = recordRes.data.value;
        } catch (e) {
            if (!(e instanceof RecordNotFoundError)) {
                throw e;
            }
            console.log('record not found, defining new one');
            record = {
                $type: recordType,
                totalWins: 0,
                totalGames: 0,
                totalKills: 0,
                totalDeaths: 0,
                highestScore: 0,
            };
        }

        record.totalWins += 1;

        await agent.com.atproto.repo.putRecord({
            repo: agent.assertDid,
            collection: recordType,
            rkey,
            record,
            validate: false,
        });

        console.log('post success', record);
    }, [agent]);

    const onQuickJoinClick = useCallback(() => {
        joinLobby('spaceShooterAutoLobby').catch((err) => {
            console.error('joinLobby failed:', err);
        });
    }, [joinLobby]);

    const onCreateGameClick = useCallback(() => {
        // generate 4 random alpha characters
        const gameId = Array.from({ length: 4 }, () =>
            String.fromCharCode(97 + Math.floor(Math.random() * 26)),
        ).join('');

        joinLobby(gameId).catch((err) => {
            console.error('joinLobby failed:', err);
        });
    }, [joinLobby]);

    useEffect(() => {
        if (!agent) {
            return;
        }

        if (!agent.did) {
            return;
        }

        getProfile(agent.did)
            .then(setBskyProfile)
            .catch((err) => {
                console.error('getProfile failed:', err);
            });

        getStats(agent.did)
            .then(setPlayerStats)
            .catch((err) => {
                console.error('getStats failed:', err);
            });
    }, [agent, getProfile, getStats]);

    return (
        <Screen style={{ display: 'flex', flexDirection: 'column' }}>
            <GameTitle>SPACE SHOOTER</GameTitle>
            <div
                style={{ display: 'flex', flexDirection: 'row', flexGrow: '1' }}
            >
                <Panel
                    style={{
                        width: '50%',
                        marginRight: '40px',
                        background: 'none',
                        border: 'none',
                        justifyContent: 'center',
                    }}
                >
                    <PanelButton onClick={onQuickJoinClick}>
                        Quick Join
                    </PanelButton>
                    <PanelButton onClick={onCreateGameClick} disabled={true}>
                        Create Game
                    </PanelButton>
                    <PanelButton disabled={true}>Join Game</PanelButton>
                    <PanelButton onClick={logout}>Logout</PanelButton>
                    {/* <PanelButton onClick={onPost}>Post</PanelButton> */}
                </Panel>
                <Panel style={{ width: '50%' }}>
                    {bskyProfile && (
                        <PlayerProfile
                            bskyProfile={bskyProfile}
                            playerStats={playerStats || nullPlayerStats}
                        />
                    )}
                </Panel>
            </div>
        </Screen>
    );
};

export interface PlayerProfileProps {
    bskyProfile: ProfileViewDetailed;
    playerStats: SpaceshooterStats.Record;
}

export const PlayerProfile: FunctionComponent<PlayerProfileProps> = ({
    bskyProfile,
    playerStats,
}) => {
    return (
        <StyledPlayerProfile>
            <div className="header">
                <img src={bskyProfile.avatar} />
                <div className="playerName">
                    {bskyProfile.displayName || bskyProfile.handle}
                </div>
            </div>
            <div className="stats">
                <PlayerStat>Wins: {playerStats.totalWins}</PlayerStat>
                <PlayerStat>Games: {playerStats.totalGames}</PlayerStat>
                <PlayerStatSpacer></PlayerStatSpacer>
                <PlayerStat>Kills: {playerStats.totalKills}</PlayerStat>
                <PlayerStat>Deaths: {playerStats.totalDeaths}</PlayerStat>
                <PlayerStatSpacer />
                <PlayerStat>
                    Highest Score: {playerStats.highestScore}
                </PlayerStat>
            </div>
        </StyledPlayerProfile>
    );
};
