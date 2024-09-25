import {
    FunctionComponent,
    isValidElement,
    useEffect,
    useRef,
    useState,
} from 'react';
import { isWindows, newPlayerWindow } from '../system/menu';
import termstyles from './Terminal.module.css';

const InputStyle: React.CSSProperties = {
    color: 'white',
};

export interface TerminalViewProps {
    flow: Operation[];
    minWait: number;
    nextOpWait: number;
    startIndex: number;
    style?: React.CSSProperties;
}

export interface Operation {
    text: string | JSX.Element;
    min?: number;
    promise(input?: string): Promise<unknown>;
    choices?: Choice[];
    next?: number;
    userInput?: boolean;
    initInput?: string;
}

export interface Choice {
    text: string;
    next: number;
}

interface OperationText {
    opIndex: number;
    text: (string | JSX.Element)[];
}

const Carat: FunctionComponent = () => {
    return (
        <div className={termstyles.carat}>
            &nbsp;
            <div className={termstyles.caratInner}></div>
        </div>
    );
};

export const TerminalView: FunctionComponent<TerminalViewProps> = ({
    flow,
    minWait,
    nextOpWait,
    startIndex,
    style,
}) => {
    const [text, setText] = useState<OperationText[]>([]);
    const [opIndex, setOpIndex] = useState<number>(-1);
    const [isOperationInProgress, setIsOperationInProgress] =
        useState<boolean>(false);
    const [currentChoice, setCurrentChoice] = useState<number>(0);
    const [userInput, setUserInput] = useState<string>('');
    const [isInputComplete, setIsInputComplete] = useState<{
        [key: string]: boolean;
    }>({});

    const terminalRef = useRef<HTMLDivElement>(null); // Step 1: Create a ref

    useEffect(() => {
        if (!terminalRef.current) {
            return;
        }
        const scrollPosition =
            terminalRef.current.scrollHeight - terminalRef.current.clientHeight;
        terminalRef.current.scrollTo({
            top: scrollPosition,
            behavior: 'smooth',
        });
    }, [text]);

    // Handle operation flow
    useEffect(() => {
        if (opIndex === -1) {
            setOpIndex(startIndex);
            return;
        }

        if (!flow || flow.length === 0) {
            return;
        }
        if (opIndex >= flow.length) {
            return;
        }
        if (isOperationInProgress) {
            return;
        }

        setIsOperationInProgress(true); // Mark operation as in progress

        const operation = flow[opIndex];

        // Set initial text for operation. Don't do it if input is complete as it has already been set
        if (
            !isInputComplete[opIndex] &&
            !text.some((t) => t && t.opIndex === opIndex)
        ) {
            setText((text) => [
                ...text,
                { opIndex: opIndex, text: [operation.text] },
            ]);
        }

        if (operation.choices) {
            operation.choices.forEach((choice, _index) => {
                setText((text) => {
                    const lastOpText = { ...text[text.length - 1] };
                    lastOpText.text = [...lastOpText.text, `${choice.text}`];
                    const newText = text.slice(0, -1);
                    newText.push(lastOpText);
                    return newText;
                });
            });
        } else if (!operation.userInput || isInputComplete[opIndex]) {
            const nextIndex =
                operation.next !== undefined
                    ? opIndex + operation.next
                    : opIndex + 1;
            const promiseInput = operation.userInput ? userInput : '';

            // Flush input buffer
            setUserInput('');

            const now = Date.now();
            operation
                .promise(promiseInput)
                .then((res?) => {
                    const elapsed = Date.now() - now;
                    setTimeout(
                        () => {
                            if (typeof res == 'string' || isValidElement(res)) {
                                setText((text) => {
                                    const lastOpText = {
                                        ...text[text.length - 1],
                                    };
                                    lastOpText.text = [...lastOpText.text, res];
                                    const newText = text.slice(0, -1);
                                    newText.push(lastOpText);
                                    return newText;
                                });
                                setTimeout(() => {
                                    setOpIndex(nextIndex);
                                    setIsOperationInProgress(false);
                                }, nextOpWait);
                            } else {
                                setOpIndex(nextIndex);
                                setIsOperationInProgress(false);
                            }
                        },
                        Math.max(0, minWait - elapsed),
                    );
                })
                .catch((err) => {
                    console.error(`operation error. opIndex: ${opIndex}`, err);
                    if (typeof err == 'string' || isValidElement(err)) {
                        setText((text) => {
                            const lastOpText = {
                                ...text[text.length - 1],
                            };
                            lastOpText.text = [...lastOpText.text, err];
                            const newText = text.slice(0, -1);
                            newText.push(lastOpText);
                            return newText;
                        });
                    }
                    setIsOperationInProgress(false);
                    setIsInputComplete((input) => {
                        const newInput = { ...input };
                        newInput[opIndex] = false;
                        return newInput;
                    });
                });
        } else {
            if (operation.userInput && !!operation.initInput) {
                setUserInput(operation.initInput);
            }
        }
    }, [
        flow,
        isInputComplete,
        isOperationInProgress,
        minWait,
        nextOpWait,
        opIndex,
        startIndex,
        text,
        userInput,
    ]);

    // keyboard listener for up and down
    useEffect(() => {
        if (flow === undefined) {
            return;
        }
        if (opIndex >= flow.length) {
            return;
        }
        if (flow[opIndex] === undefined) {
            return;
        }
        if (flow[opIndex].choices === undefined) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isWindows) {
                if (e.key === 'p' && e.ctrlKey) {
                    e.preventDefault();
                    newPlayerWindow().catch((err) => {
                        console.error('Failed to open new player window', err);
                    });
                    return;
                }
            }
            if (flow[opIndex].choices) {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCurrentChoice((choice) => Math.max(0, choice - 1));
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCurrentChoice((choice) =>
                        Math.min(flow[opIndex].choices!.length - 1, choice + 1),
                    );
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const choice = flow[opIndex].choices![currentChoice];
                    if (choice) {
                        setOpIndex(opIndex + choice.next);
                        setIsOperationInProgress(false);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [flow, opIndex, currentChoice]);

    // keyboard listener for typing
    useEffect(() => {
        if (!flow) {
            return;
        }
        if (opIndex >= flow.length) {
            return;
        }

        if (flow[opIndex] === undefined) {
            return;
        }

        if (!flow[opIndex].userInput) {
            return;
        }

        const pasteHandler = (e: ClipboardEvent) => {
            e.preventDefault();
            const text = (
                e.clipboardData || (window as any).clipboardData
            ).getData('text');
            setUserInput(userInput + text);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Stops the event bubbling up and the app making a noise when the keyboard isn't handled

            if (flow[opIndex].userInput) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    setIsInputComplete((input) => {
                        const newInput = { ...input };
                        newInput[opIndex] = true;
                        return newInput;
                    });
                    // Add input to text line. Buffer gets flushed in the flow handler
                    setText((text) => {
                        const lastOpText = { ...text[text.length - 1] };
                        lastOpText.text = [...lastOpText.text, userInput];
                        const newText = text.slice(0, -1);
                        newText.push(lastOpText);
                        return newText;
                    });
                    setIsOperationInProgress(false);
                } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    setUserInput(userInput.slice(0, -1));
                } else if (e.ctrlKey || e.metaKey) {
                    return; // let it bubble
                } else if (e.key.length === 1) {
                    e.preventDefault();
                    setUserInput(userInput + e.key);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('paste', pasteHandler);
        return () => {
            window.removeEventListener('paste', pasteHandler);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [flow, opIndex, userInput]);

    return (
        <>
            <div
                ref={terminalRef}
                className={termstyles.terminal}
                style={style}
            >
                <div>
                    {text.map((operationText, loopOpIdx) => (
                        <div
                            className={termstyles.defaultTextColor}
                            key={loopOpIdx}
                        >
                            {operationText.text.map((t, index) => (
                                <div key={index}>
                                    {flow[operationText.opIndex].choices &&
                                    index > 0 ? (
                                        <div
                                            style={{
                                                whiteSpace: 'pre',
                                                color:
                                                    currentChoice == index - 1
                                                        ? '#fff'
                                                        : '#888',
                                            }}
                                        >
                                            {currentChoice == index - 1
                                                ? '❯ '
                                                : '  '}
                                            {t}
                                        </div>
                                    ) : flow[operationText.opIndex].userInput &&
                                      index ===
                                          operationText.text.length - 1 ? (
                                        <span>
                                            {t}
                                            <br />
                                            {!isInputComplete[
                                                operationText.opIndex
                                            ] && (
                                                <span style={InputStyle}>
                                                    {userInput}
                                                </span>
                                            )}
                                            {!isInputComplete[
                                                operationText.opIndex
                                            ] && <Carat />}
                                        </span>
                                    ) : (
                                        <span>{t}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};
