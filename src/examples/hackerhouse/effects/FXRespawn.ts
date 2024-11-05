import RingWaveImage from '../assets/RingWave.png?url';
import SparkImage from '../assets/Spark.png?url';

export default {
    particleSystems: [
        {
            duration: 1,
            particleData: {
                lifetime: 0.5,
                speed: 10,
                dampening: 0.8,
                size: [2.6, 3.2, 1.6],
                startRotation: 0,
                startColor: [1, 0.5, 0.5, 1],
                sizeOverLifetime: [
                    {
                        time: 0,
                        size: 0,
                        easing: 'easeInOut',
                    },
                    {
                        time: 0.05,
                        size: 1,
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
                        time: 1,
                        color: [1, 1, 1, 0],
                        easing: 'easeInOut',
                    },
                ],
            },
            maxParticles: 1000,
            looping: false,
            emission: {
                rateOverTime: 0,
                bursts: [
                    {
                        time: 0,
                        minCount: 5,
                        maxCount: 10,
                        cycles: 5,
                        interval: 0.005,
                    },
                ],
            },
            shape: {
                type: 'circle',
                radius: 10,
                minArc: 0,
                maxArc: 360,
                alignToDirection: true,
            },
            rendering: {
                particleTexture: SparkImage,
                blendMode: 'additive',
            },
        },
        {
            duration: 1,
            particleData: {
                lifetime: 0.3,
                speed: 0,
                dampening: 0,
                size: [50, 50, 50],
                startRotation: 0,
                startColor: [1, 0.5, 0.5, 1],
                sizeOverLifetime: [
                    {
                        time: 0,
                        size: 0.1,
                        easing: 'easeOut',
                    },
                    {
                        time: 1,
                        size: 1,
                        easing: 'easeOut',
                    },
                ],
                colorOverLifetime: [
                    {
                        time: 0,
                        color: [1, 1, 1, 1],
                        easing: 'easeIn',
                    },
                    {
                        time: 0.5,
                        color: [1, 1, 1, 1],
                        easing: 'easeOut',
                    },
                    {
                        time: 1,
                        color: [1, 1, 1, 0],
                        easing: 'easeOut',
                    },
                ],
            },
            maxParticles: 1,
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
                particleTexture: RingWaveImage,
                blendMode: 'additive',
            },
        },
    ],
};
