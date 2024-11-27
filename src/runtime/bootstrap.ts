const northEurope = '51.158.36.190';

// well known playmint bootstrap peers for when you haven't got any friends
export const BOOTSTRAP_PEERS = [
    {
        address: northEurope,
        port: 47070,
        peerId: '01648834fa2ce756fec37b093015e67fb17840ced44239717bba5a70ba0c9dec',
        natType: 31,
        indexed: true,
    },
    {
        address: northEurope,
        port: 47071,
        peerId: '797a2e0836dd99fb615e2bdf4002980cec696133fbe0ccc52cbc0637b7df6c84',
        natType: 31,
        indexed: true,
    },
    {
        address: northEurope,
        port: 47072,
        peerId: '7cda3c45ce8e0b67164d2f775b8ff19318c211afa1adbadc3dcf680cc1185167',
        natType: 31,
        indexed: true,
    },
    {
        address: northEurope,
        port: 47073,
        peerId: 'bef1b17f6cc94d5999a65c457fa014404a0a82c6f8be0801285ab54261de71e7',
        natType: 31,
        indexed: true,
    },
].sort(() => Math.random() - 0.5);

// debug helper for checking if one of the boostrap peers is proxying for us
export function getProxyName(peerId: string): string {
    for (const peer of BOOTSTRAP_PEERS) {
        if (peer.peerId === peerId) {
            if (peer.address === northEurope) {
                return 'NorthEurope';
            }
        }
    }
    return `Peer ${peerId.slice(0, 8)}`;
}
