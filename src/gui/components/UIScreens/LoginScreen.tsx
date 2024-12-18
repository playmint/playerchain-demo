import {
    FunctionComponent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import styled from 'styled-components';
import { useATProto } from '../../hooks/use-atproto';
import { GameTitle, Panel, Screen, ScreenButton } from './Screen';

const LoginForm = styled.div`
    padding: 20px;

    > input {
        width: 100%;
        margin-bottom: 20px;
        background: #272727;
        color: white;

        &::placeholder {
            color: darkgray;
        }
    }
`;

export const LoginScreen: FunctionComponent = () => {
    const handleRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const { login } = useATProto();
    const [errorText, setErrorText] = useState<string | undefined>();
    const [hasValidInput, setHasValidInput] = useState<boolean>(false);
    const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

    const onLoginClick = useCallback(async () => {
        if (!handleRef.current || !passwordRef.current) {
            return;
        }

        const handle = handleRef.current.value;
        const password = passwordRef.current.value;

        try {
            setIsLoggingIn(true);
            await login(handle, password);
        } catch (e) {
            console.log(e);
            setErrorText('Login Error!');
        } finally {
            setIsLoggingIn(false);
        }
    }, [login]);

    const onTextChange = useCallback(() => {
        if (!handleRef.current || !passwordRef.current) {
            return;
        }

        setHasValidInput(
            handleRef.current.value.length > 0 &&
                passwordRef.current.value.length > 0,
        );
    }, []);

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && hasValidInput && !isLoggingIn) {
                onLoginClick().catch((e) => {
                    console.error(e);
                });
            }
        };

        document.addEventListener('keypress', handleKeyPress);

        return () => {
            document.removeEventListener('keypress', handleKeyPress);
        };
    }, [hasValidInput, isLoggingIn, onLoginClick]);

    return (
        <Screen
            style={{
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <GameTitle>SPACE SHOOTER</GameTitle>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flexGrow: '1',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                }}
            >
                <Panel
                    style={{
                        alignItems: 'center',
                        width: '50%',
                        textAlign: 'center',
                    }}
                >
                    <h1>Login</h1>
                    <p>Please enter your bluesky login credentials</p>

                    <LoginForm>
                        <input
                            ref={handleRef}
                            type="text"
                            placeholder="Handle"
                            autoCapitalize="off"
                            spellCheck="false"
                            onChange={onTextChange}
                        />
                        <input
                            ref={passwordRef}
                            type="password"
                            placeholder="Password"
                            onChange={onTextChange}
                        />
                    </LoginForm>

                    <ScreenButton
                        onClick={onLoginClick}
                        disabled={!hasValidInput || isLoggingIn}
                    >
                        Login
                    </ScreenButton>
                    {errorText && (
                        <p style={{ marginTop: '20px' }}>{errorText}</p>
                    )}
                </Panel>
            </div>
        </Screen>
    );
};
