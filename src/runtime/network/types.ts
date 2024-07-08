// map of peerId to actions
export type PeerId = Uint8Array;

export interface Channel {
    name: string;
    secret: string;
}

export interface Keypair {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
}

export interface Input {
    forward: boolean;
    back: boolean;
    left: boolean;
    right: boolean;
}

export interface InputPacket {
    peerId: PeerId;
    round: number;
    input: Input;
}

export type Packet = InputPacket;

export type RoundActions = Map<PeerId, Input>;

export interface Transport {
    sendPacket(packet: Packet): void;
    onPacket?: (packet: Packet) => void;
    ready(): Promise<void>;
}

export interface InputDB {
    addInput(packet: InputPacket): void;
    getInputs(round: number): InputPacket[] | undefined;
    isAcknowledged(round: number): boolean;
    sync(round: number): void;
    ready(): Promise<void>;

    // super weird stateful function
    getDelta(round: number): Array<InputPacket[]>;
}
