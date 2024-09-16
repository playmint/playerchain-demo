import { createContext, useContext } from 'react';

export interface PacketLaceContextType {
    init(dbname: string, peerColors: string[]): Promise<void>;
    fetchPackets(channelId: string, limit: number): Promise<unknown>;
    startGraph(
        canvas: OffscreenCanvas,
        channelID: string,
        packetLimit: number,
        fetchIntervalMs: number,
    ): Promise<void>;
    stopGraph(): Promise<void>;
    onResize(width: number, height: number): Promise<void>;
}

// using a default empty value and letting the provider ensure that the value is not used
export const PacketLaceContext = createContext<PacketLaceContextType>(
    {} as PacketLaceContextType,
);

export const usePacketLace = () => {
    return useContext(PacketLaceContext);
};
