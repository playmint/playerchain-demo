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
    fire: boolean;
}

export interface InputPacket {
    peerId: PeerId;
    round: number;
    input: Input;
}

export interface InputWirePacket {
    id: Uint8Array;
    payload: InputPacket;
    acks: Uint8Array[];
}

export type Packet = InputPacket;

export type RoundActions = Map<PeerId, Input>;

export interface Transport {
    sendPacket(packet: Packet): boolean;
    onPacket?: (packet: Packet) => void;
    ready(): Promise<void>;
}

export interface InputDB {
    addInput(packet: InputPacket): boolean;
    getInputs(round: number): InputPacket[] | undefined;
    sync(round: number): void;
    ready(): Promise<void>;

    // super weird stateful function
    getDelta(maxRound?: number): Array<InputPacket[]>;
}
