import styles from './Loading.module.css';

export const Loading = () => {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
            }}
        >
            <span className={styles.loader}></span>
        </div>
    );
};
