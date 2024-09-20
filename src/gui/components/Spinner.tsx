import { FunctionComponent, useEffect, useRef } from 'react';

export const Spinner: FunctionComponent = () => {
    const spinner = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!spinner.current) {
            return;
        }
        const spinFrames = ['-', '\\', '|', '/'];
        const frameDelay = 4;
        let frameCount = 0;
        let spinFrame = 0;

        let animationFrameId: number;
        const updateFrame = () => {
            if (!spinner.current) {
                return;
            }
            spinner.current.innerText = spinFrames[spinFrame];
            if (frameCount % frameDelay === 0) {
                spinFrame = (spinFrame + 1) % spinFrames.length;
            }
            frameCount++;
            animationFrameId = requestAnimationFrame(updateFrame);
        };

        updateFrame();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return <span ref={spinner}></span>;
};
