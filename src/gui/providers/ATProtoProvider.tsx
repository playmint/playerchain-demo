import AtpAgent, { AtpSessionData, AtpSessionEvent } from '@atproto/api';
import { DidResolver, HandleResolver } from '@atproto/identity';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ATProtoContext } from '../hooks/use-atproto';
import { useDatabase } from '../hooks/use-database';

const didres = new DidResolver({});
const hdlres = new HandleResolver({});

export const ATProtoProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const db = useDatabase();
    const storedSession = useLiveQuery(() => {
        return db.bskySession.get(1);
    }, []);

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [agent, setAgent] = useState<AtpAgent | undefined>();

    const pubAgent = useMemo(
        () =>
            new AtpAgent({
                service: 'https://public.api.bsky.app',
                persistSession: (
                    evt: AtpSessionEvent,
                    sess?: AtpSessionData,
                ) => {
                    console.log('persistSession', evt, sess);
                    // store the session-data for reuse
                },
            }),
        [],
    );

    useEffect(() => {
        if (isLoggedIn) {
            return;
        }

        if (
            !storedSession ||
            !storedSession.session ||
            !storedSession.endpoint
        ) {
            return;
        }

        const endpoint = storedSession.endpoint;

        const agent = new AtpAgent({
            service: endpoint,
            persistSession: (
                evt: AtpSessionEvent,
                session?: AtpSessionData,
            ) => {
                console.log('persistSession: ', evt, session);
                if (!session) {
                    console.error('persistSession: no session data');
                    return;
                }
                db.bskySession
                    .put({ id: 1, endpoint, session })
                    .catch((err) => {
                        console.error('persistSession failed:', err);
                    });
            },
        });

        agent
            .resumeSession(storedSession.session)
            .then(() => {
                console.log('restored session');
                setAgent(agent);
                setIsLoggedIn(!!agent.did);
            })
            .catch((err) => {
                console.error('restoreSession failed:', err);
            });
    }, [db, isLoggedIn, storedSession]);

    const login = useCallback(
        (handle: string, password: string) => {
            const initAgent = async () => {
                console.log(`Initialising agent for handle: ${handle}`);

                const did = await hdlres.resolve(handle);
                if (did == undefined) {
                    throw new Error(`handle: ${handle} did not resolve to DID`);
                }

                console.log(`Resolved handle: ${handle} to DID: ${did}`);

                const doc = await didres.resolve(did);
                if (doc == undefined) {
                    throw new Error(`did: ${did} did not resolve to document`);
                }

                if (!doc.service) {
                    throw new Error(`did: ${did} document has no service`);
                }

                const service = doc.service.find(
                    (service) => service.type == 'AtprotoPersonalDataServer',
                );
                if (!service) {
                    throw new Error(
                        `did: ${did} no serviced found of type AtprotoPersonalDataServer`,
                    );
                }

                if (!service.serviceEndpoint) {
                    throw new Error(
                        `did: ${did} service has no serviceEndpoint`,
                    );
                }

                if (typeof service.serviceEndpoint !== 'string') {
                    throw new Error(
                        `did: ${did} serviceEndpoint is not a string`,
                    );
                }

                const endpoint = service.serviceEndpoint as string;

                console.log(
                    `Creating agent for service: ${service.serviceEndpoint}`,
                );

                return new AtpAgent({
                    service: endpoint,
                    persistSession: (
                        evt: AtpSessionEvent,
                        session?: AtpSessionData,
                    ) => {
                        console.log('persistSession: ', evt, session);
                        if (!session) {
                            console.error('persistSession: no session data');
                            return;
                        }
                        db.bskySession
                            .put({ id: 1, endpoint, session })
                            .catch((err) => {
                                console.error('persistSession failed:', err);
                            });
                    },
                });
            };

            initAgent()
                .then((agent) => {
                    agent
                        .login({
                            identifier: handle,
                            password: password,
                        })
                        .then(() => {
                            console.log('login success');
                            setAgent(agent);
                            setIsLoggedIn(!!agent.did);
                        })
                        .catch((err) => {
                            console.error('login failed:', err);
                        });
                })
                .catch((e) => console.error(e));
        },
        [db],
    );

    const logout = useCallback(() => {
        if (!agent) {
            return;
        }
        if (!db) {
            return;
        }

        db.bskySession
            .delete(1)
            .catch((e) => {
                console.error(e);
            })
            .finally(() => {
                agent
                    .logout()
                    .catch((e) => {
                        console.error(e);
                    })
                    .finally(() => {
                        setAgent(undefined);
                        setIsLoggedIn(false);
                    });
            });
    }, [agent, db]);

    return (
        <ATProtoContext.Provider
            value={{ pubAgent, agent, isLoggedIn, login, logout }}
        >
            {children}
        </ATProtoContext.Provider>
    );
};
