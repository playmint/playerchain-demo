import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
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
    const { getProfile } = useProfile();
    const [bskyProfile, setBskyProfile] = useState<
        ProfileViewDetailed | undefined
    >();

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
    }, [agent, getProfile]);

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
                </Panel>
                <Panel style={{ width: '50%' }}>
                    {bskyProfile && (
                        <PlayerProfile
                            bskyProfile={bskyProfile}
                            playerStats={nullPlayerStats}
                        />
                    )}
                </Panel>
            </div>
        </Screen>
    );
};

interface PlayerStats {
    totalWins: number;
    totalGames: number;
    totalKills: number;
    totalDeaths: number;
    highestScore: number;
}

export const nullPlayerStats: PlayerStats = {
    totalWins: 0,
    totalGames: 0,
    totalKills: 0,
    totalDeaths: 0,
    highestScore: 0,
};

export interface PlayerProfileProps {
    bskyProfile: ProfileViewDetailed;
    playerStats: PlayerStats;
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
