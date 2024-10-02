import { useThree } from '@react-three/fiber';
import { memo, useLayoutEffect } from 'react';

export const FPSLimiter = memo(function FPSLimiter({ fps }: { fps: number }) {
    const invalidate = useThree((state) => state.invalidate);

    useLayoutEffect(() => {
        const timer = setInterval(() => {
            invalidate();
        }, 1000 / fps);
        return () => clearInterval(timer);
    }, [fps, invalidate]);

    return null;
});
