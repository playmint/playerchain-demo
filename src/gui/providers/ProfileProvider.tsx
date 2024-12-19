import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { createContext, useCallback, useContext, useState } from 'react';
import { schemaDict } from '../../lexicon/lexicons';
import * as SpaceshooterStats from '../../lexicon/types/com/playmint/dev/spaceshooter/stats';
import { useATProto } from '../hooks/use-atproto';
import { useDatabase } from '../hooks/use-database';

export interface ProfileContextType {
    getProfile: (did: string) => Promise<ProfileViewDetailed | undefined>;
    getStats: (did: string) => Promise<SpaceshooterStats.Record | undefined>;
}

export const ProfileContext = createContext<ProfileContextType>(
    // casting type because provider will enforce allways having a value
    {} as ProfileContextType,
);

export const useProfile = () => {
    return useContext(ProfileContext);
};

const STATS_CACHE_TTL = 1000 * 60 * 3; // 3 minutes
export interface StatsCacheResult {
    record: SpaceshooterStats.Record;
    lastUpdated: number;
}

export const ProfileProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    // const db = useDatabase();
    const { agent } = useATProto();
    const [profileCache, setProfileCache] = useState<
        Map<string, ProfileViewDetailed>
    >(new Map());
    const [statsCache, setStatsCache] = useState<Map<string, StatsCacheResult>>(
        new Map(),
    );

    const getProfile = useCallback(
        async (did: string) => {
            if (profileCache.has(did)) {
                return profileCache.get(did);
            }

            if (!agent) {
                return;
            }

            const profile = await agent.app.bsky.actor.getProfile({
                actor: did,
            });
            // setProfileCache((prev) => new Map(prev.set(did, profile.data)));
            setProfileCache((prev) => prev.set(did, profile.data));
            // db.bskyProfile.put(profile.data);

            return profile.data;
        },
        [agent, profileCache],
    );

    const getStats = useCallback(
        async (did: string) => {
            if (statsCache.has(did)) {
                const cacheRes = statsCache.get(did)!;
                if (Date.now() - cacheRes.lastUpdated < STATS_CACHE_TTL) {
                    // console.log('returning cached stats');
                    return cacheRes.record;
                }
            }

            if (!agent) {
                return;
            }

            const recordType = schemaDict.ComPlaymintDevSpaceshooterStats.id;
            const rkey = 'self';

            const recordRes = await agent.com.atproto.repo.getRecord({
                repo: did,
                collection: recordType,
                rkey,
            });

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

            const record = recordRes.data.value;

            setStatsCache((prev) =>
                prev.set(did, { lastUpdated: Date.now(), record }),
            );

            // console.log('returning new stats');

            return record;
        },
        [agent, statsCache],
    );

    return (
        <ProfileContext.Provider value={{ getProfile, getStats }}>
            {children}
        </ProfileContext.Provider>
    );
};
