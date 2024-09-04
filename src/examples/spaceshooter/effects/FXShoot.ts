import WhiteGlowImage from '../assets/WhiteGlow.png?url';

export default {
    particleSystems: [
        {
            duration: 1,
            particleData: {
                lifetime: 0.15,
                speed: 0,
                dampening: 0,
                size: [2, 2, 2],
                startRotation: 0,
                startColor: [1, 0.5, 0.5, 1],
                sizeOverLifetime: [
                    {
                        time: 0,
                        size: 1,
                        easing: 'easeIn',
                    },
                    {
                        time: 1,
                        size: 0,
                        easing: 'easeInOut',
                    },
                ],
                colorOverLifetime: [
                    {
                        time: 0,
                        color: [1, 1, 1, 1],
                        easing: 'easeInOut',
                    },
                    {
                        time: 1,
                        color: [0, 1, 1, 0],
                        easing: 'easeInOut',
                    },
                ],
            },
            maxParticles: 10,
            looping: false,
            emission: {
                rateOverTime: 0,
                bursts: [
                    {
                        time: 0,
                        minCount: 1,
                        maxCount: 1,
                        cycles: 1,
                        interval: 0.01,
                    },
                ],
            },
            shape: {
                type: 'circle',
                radius: 0,
                minArc: 0,
                maxArc: 360,
                alignToDirection: false,
            },
            rendering: {
                particleTexture: WhiteGlowImage,
                blendMode: 'additive',
            },
        },
    ],
};
