import { useMemo } from 'react';
import styles from './EnergyBar.module.css';

export default function EnergyBar(props: { energy: number }) {
    const bubbles = useMemo(() => {
        return Array.from({ length: 10 }).map((_, index) => {
            const size = Math.random() * 8 + 4;
            const top = Math.random() * 100;
            const left = Math.random() * 100;
            const duration = Math.random() * 3 + 4;

            return (
                <div
                    key={index}
                    className={styles.energyBubble}
                    style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        top: `${top}%`,
                        left: `${left}%`,
                        animationDuration: `${duration}s`,
                    }}
                ></div>
            );
        });
    }, []);

    const energyColor = useMemo(
        () => getEnergyColor(props.energy),
        [props.energy],
    );

    return (
        <div className={styles.energyBar}>
            <div
                className={styles.energyFill}
                style={{
                    width: `${props.energy}%`,
                    backgroundColor: energyColor,
                }}
            >
                <div className={styles.energyReflection}></div>
                {bubbles}
            </div>
        </div>
    );
}

const lerp = (start: number, end: number, t: number): number => {
    return start + t * (end - start);
};

const getEnergyColor = (energy: number): string => {
    const green = { r: 46, g: 194, b: 46 };
    const yellow = { r: 199, g: 201, b: 50 };
    const red = { r: 255, g: 64, b: 64 };
    let r, g, b;
    if (energy > 50) {
        // Interpolate between yellow and green
        const t = (energy - 50) / 50;
        r = lerp(yellow.r, green.r, t);
        g = lerp(yellow.g, green.g, t);
        b = lerp(yellow.b, green.b, t);
    } else {
        // Interpolate between red and yellow
        const t = energy / 50;
        r = lerp(red.r, yellow.r, t);
        g = lerp(red.g, yellow.g, t);
        b = lerp(red.b, yellow.b, t);
    }
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};
