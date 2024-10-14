import { ByRandom } from '../utils';
import type Peer from './Peer';
import { Subcluster } from './Subcluster';
import Packet, { PacketPublish, PacketPublishProxied } from './packets';

export type RemotePeerConfig = {
    peerId: string;
    address: string;
    port: number;
    natType: number;
    indexed: boolean;
    clusterId: Uint8Array;
    clock: number;
    localPeer: Peer;
};

/**
 * A `RemotePeer` represents an initial, discovered, or connected remote peer.
 * Typically, you will not need to create instances of this class directly.
 */
export class RemotePeer {
    peerId: string;
    address: string;
    port = 0;
    natType: number;
    clusterId: Uint8Array;
    cid: string;
    pingId = null;
    distance = 0;
    connected: boolean = false;
    opening = 0;
    probed = 0;
    proxies: Map<string, RemotePeer> = new Map();
    useProxy: boolean;
    clock = 0;
    uptime = 0;
    lastSeen: number;
    lastRequest = 0;
    localPeer: Peer;
    indexed?: boolean;
    socket?: any;

    /**
     * `RemotePeer` class constructor.
     */
    constructor(o: RemotePeerConfig) {
        this.localPeer = o.localPeer;
        this.clusterId = o.clusterId;
        this.cid = Buffer.from(this.clusterId).toString('hex');
        this.peerId = o.peerId;
        this.address = o.address;
        this.port = o.port;
        this.indexed = o.indexed;
        this.natType = o.natType;
        this.clock = o.clock || 0;
        this.lastSeen = Date.now();
        this.useProxy = false;
    }

    async write(subcluster: Subcluster, args: any) {
        const keys = subcluster.signingKeys;
        const from = this.localPeer.peerId.slice(0, 6);
        const to = this.peerId.slice(0, 6);

        if (!this.localPeer) {
            throw new Error('expected .localPeer');
        }
        args.subclusterId = keys.publicKey;
        args.clusterId = this.localPeer.clusterId;
        args.usr3 = Buffer.from(this.peerId, 'hex');
        args.usr4 = Buffer.from(this.localPeer.peerId, 'hex');
        args.message = this.localPeer.encryption.seal(args.message, keys);

        // do we need a proxy? if so get a random proxy from the map
        const proxy = this.useProxy
            ? Array.from(this.proxies.values()).sort(ByRandom)[0]
            : null;

        if (this.useProxy && !proxy) {
            this.localPeer._onDebug(
                `X DROP NEEDS PROXY BUT NO PROXY (from=${from}, to=${to})`,
            );
            return [];
        }

        const cache = new Map();
        const packets = await this.localPeer._message2packets(
            proxy ? PacketPublishProxied : PacketPublish,
            args.message,
            args,
        );

        const address = proxy ? proxy.address : this.address;
        const port = proxy ? proxy.port : this.port;

        if (packets.length > 1) {
            this.localPeer._onDebug(
                `X DROP STREAM NO COMPOSE ALLOWED (from=${from}, to=${to}, via=${address}:${port} proxy=${!!proxy})`,
            );
            return [];
        }

        for (const packet of packets) {
            const pid = packet.packetId.toString('hex');
            this.localPeer._onDebug(
                `>> WRITE STREAM (pid=${pid.slice(0, 6)} from=${from}, to=${to}, via=${address}:${port} proxy=${!!proxy} proxies=${this.proxies.size})`,
            );
            cache.set(pid, packet);
            this.localPeer.gate.set(pid, 1);
            const data = await Packet.encode(packet);
            this.localPeer.send(data, port, address, this.socket);
        }

        return [];
    }
}
