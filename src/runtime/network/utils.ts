export function isInputPacket(packet: unknown): boolean {
    if (typeof packet !== 'object' || packet === null) {
        return false;
    }
    if (!('peerId' in packet) || !packet.peerId) {
        return false;
    }
    if (!('round' in packet) || typeof packet.round !== 'number') {
        return false;
    }
    if (
        !('input' in packet) ||
        typeof packet.input !== 'object' ||
        packet.input === null
    ) {
        return false;
    }
    return true;
}
