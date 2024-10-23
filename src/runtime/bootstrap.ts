const northEurope = '51.158.36.190';
const southEastAsia = '20.191.154.190';

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
    {
        address: southEastAsia,
        port: 47080,
        peerId: 'b842b2a3f8e4a5d9871c0cc5d95a87207aec3a1ee242dd89c4eead0b39ecd2c8',
        natType: 31,
        indexed: true,
    },
    {
        address: southEastAsia,
        port: 47081,
        peerId: '4fa4c40d334055a086785572532a110880503bf410c6bc254dde298bd24626f8',
        natType: 31,
        indexed: true,
    },
    {
        address: southEastAsia,
        port: 47082,
        peerId: '17c450ec4e53a895819bfbe997bd3bfb0076c51269cda0e290e95f100a839d3a',
        natType: 31,
        indexed: true,
    },
    {
        address: southEastAsia,
        port: 47083,
        peerId: 'ee590d62d17bb08c98554218609671dfae5341b4dea8f84a190198bda4df61c8',
        natType: 31,
        indexed: true,
    },
].sort(() => Math.random() - 0.5);
