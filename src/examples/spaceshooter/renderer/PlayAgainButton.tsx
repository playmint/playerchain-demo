import { hardReset } from '../../../runtime/utils';
import styles from './PlayAgainButton.module.css';

export default function PlayAgainButton() {
    const handleClick = () => {
        hardReset()
            .then(() => sleep(1000))
            .then(() => window.location.reload())
            .catch((err) => alert(`hard-reset-fail: ${err}`));
    };

    return (
        <button className={styles.playAgainButton} onClick={handleClick}>
            Play Again
        </button>
    );
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
