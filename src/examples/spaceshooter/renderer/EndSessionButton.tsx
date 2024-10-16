import { hardReset } from '../../../runtime/utils';
import styles from './EndSessionButton.module.css';

export default function EndSessionButton() {
    const handleClick = () => {
        console.log('End Session button clicked');
        hardReset()
            .then(() => sleep(1000))
            .then(() => window.location.reload())
            .catch((err) => alert(`hard-reset-fail: ${err}`));
    };

    return (
        <button className={styles.endSessionButton} onClick={handleClick}>
            End Session
        </button>
    );
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
