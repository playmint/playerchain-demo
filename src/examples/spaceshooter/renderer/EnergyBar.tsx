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

    return (
        <div className={styles.energyBar}>
            <div
                className={styles.energyFill}
                style={{ width: `${props.energy}%` }}
            >
                <div className={styles.energyReflection}></div>
                {bubbles}
            </div>
        </div>
    );
}
