import { createContext, useContext } from 'react';

export interface PacketLaceContextType {
    init(dbname: string): Promise<void>;
    fetchPackets(channelId: string, limit: number): Promise<unknown>;
}

// using a default empty value and letting the provider ensure that the value is not used
export const PacketLaceContext = createContext<PacketLaceContextType>(
    {} as PacketLaceContextType,
);

export const usePacketLace = () => {
    return useContext(PacketLaceContext);
};
