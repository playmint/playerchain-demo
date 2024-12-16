import { FunctionComponent, useRef } from 'react';
import backgroundImage from '../../../assets/img/start-background.png';
import { useATProto } from '../../hooks/use-atproto';
import styles from '../../styles/UIScreen.module.css';

export const LoginScreen: FunctionComponent = () => {
    const handleRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const { login } = useATProto();

    const onLoginClick = () => {
        if (!handleRef.current || !passwordRef.current) {
            return;
        }

        const handle = handleRef.current.value;
        const password = passwordRef.current.value;

        login(handle, password);
    };

    return (
        <div className={styles.mainContainer}>
            <img src={backgroundImage} className={styles.backgroundImage} />
            <div className={styles.container}>
                <h1>Bluesky Login</h1>
                <h2>Enter your bluesky login credentials</h2>
                <input
                    ref={handleRef}
                    type="text"
                    placeholder="Handle"
                    autoCapitalize="off"
                    spellCheck="false"
                />
                <input
                    ref={passwordRef}
                    type="password"
                    placeholder="Password"
                />
                <div className={styles.panelBtn} onClick={onLoginClick}>
                    Login
                </div>
            </div>
        </div>
    );
};
