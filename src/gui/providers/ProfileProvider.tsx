import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { createContext, useCallback, useContext, useState } from 'react';
import { useATProto } from '../hooks/use-atproto';
import { useDatabase } from '../hooks/use-database';

export interface ProfileContextType {
    getProfile: (did: string) => Promise<ProfileViewDetailed | undefined>;
}

export const ProfileContext = createContext<ProfileContextType>(
    // casting type because provider will enforce allways having a value
    {} as ProfileContextType,
);

export const useProfile = () => {
    return useContext(ProfileContext);
};

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

    const getProfile = useCallback(
        async (did: string) => {
            if (profileCache.has(did)) {
                return profileCache.get(did);
            }

            if (!agent) {
                return;
            }

            if (!agent.did) {
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

    return (
        <ProfileContext.Provider value={{ getProfile }}>
            {children}
        </ProfileContext.Provider>
    );
};
