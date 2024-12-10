import { FunctionComponent, useEffect, useRef } from 'react';
import { useATProto } from '../hooks/use-atproto';
import styles from './LoginModal.module.css';

export interface LoginModalProps {
    onClose: () => void;
}

export const LoginModal: FunctionComponent<LoginModalProps> = ({ onClose }) => {
    const handleRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const { login, isLoggedIn } = useATProto();

    // Auto close
    useEffect(() => {
        if (!isLoggedIn) {
            return;
        }
        onClose();
    });

    const onLoginClick = () => {
        if (!handleRef.current || !passwordRef.current) {
            return;
        }

        const handle = handleRef.current.value;
        const password = passwordRef.current.value;

        login(handle, password);
    };

    return (
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
            <input ref={passwordRef} type="password" placeholder="Password" />
            <div className={styles.panelBtn} onClick={onLoginClick}>
                Login
            </div>
            <div className={styles.panelBtn} onClick={onClose}>
                Close
            </div>
        </div>
    );
};
