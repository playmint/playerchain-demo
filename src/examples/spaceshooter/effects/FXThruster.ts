import BlueGlowImage from '../assets/BlueGlow.png?url';
import Thruster2Image from '../assets/Thruster2.png?url';

export default {
    name: 'thrusterFX',
    particleSystems: [
        {
            duration: 0.25,
            particleData: {
                lifetime: 0.25,
                speed: 40,
                dampening: 0.4,
                size: [4, 4, 4],
                startRotation: 0,
                startColor: [1, 0.5, 0.5, 1],
                sizeOverLifetime: [
                    {
                        time: 0,
                        size: 1,
                        easing: 'easeIn',
                    },
                    {
                        time: 0.1,
                        size: 0.5,
                        easing: 'easeInOut',
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
                        time: 0.2,
                        color: [1, 1, 1, 1],
                        easing: 'easeInOut',
                    },
                    {
                        time: 1,
                        color: [1, 1, 1, 0],
                        easing: 'easeInOut',
                    },
                ],
            },
            maxParticles: 100,
            looping: true,
            emission: {
                rateOverTime: 200,
                bursts: [],
            },
            shape: {
                type: 'circle',
                radius: 0,
                minArc: 178,
                maxArc: 182,
                alignToDirection: false,
            },
            rendering: {
                particleTexture: Thruster2Image,
                blendMode: 'additive',
            },
        },
        {
            duration: 0.25,
            particleData: {
                lifetime: 0.5,
                speed: 40,
                dampening: 0.4,
                size: [3, 3, 3],
                startRotation: 0,
                startColor: [1, 0.5, 0.5, 1],
                sizeOverLifetime: [
                    {
                        time: 0,
                        size: 1,
                        easing: 'linear',
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
                        color: [1, 1, 1, 0.15],
                        easing: 'linear',
                    },
                    {
                        time: 1,
                        color: [1, 1, 1, 0],
                        easing: 'easeOut',
                    },
                ],
            },
            maxParticles: 100,
            looping: true,
            emission: {
                rateOverTime: 200,
                bursts: [],
            },
            shape: {
                type: 'circle',
                radius: 0,
                minArc: 180,
                maxArc: 180,
                alignToDirection: false,
            },
            rendering: {
                particleTexture: BlueGlowImage,
                blendMode: 'additive',
            },
        },
    ],
};
