import React, { useState } from 'react';

function Joystick({
    onKeyUpCallback,
    onKeyDownCallback,
}: {
    onKeyUpCallback: (key: string) => void;
    onKeyDownCallback: (key: string) => void;
}) {
    const [isActive, setIsActive] = useState(false);
    const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });
    const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
    const radius = 80; // Radius limit for joystick movement

    const joystickStart = (e) => {
        setIsActive(true);
        setStartPosition({ x: e.clientX, y: e.clientY });
        setCurrentPosition({ x: e.clientX, y: e.clientY });
    };

    const joystickMove = (e) => {
        if (isActive) {
            const deltaX = e.clientX - startPosition.x;
            const deltaY = e.clientY - startPosition.y;

            // Calculate distance from the start point
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Limit joystick movement within the radius
            if (distance > radius) {
                const angle = Math.atan2(deltaY, deltaX);
                setCurrentPosition({
                    x: startPosition.x + Math.cos(angle) * radius,
                    y: startPosition.y + Math.sin(angle) * radius,
                });
            } else {
                setCurrentPosition({ x: e.clientX, y: e.clientY });
            }
            if (deltaX > 15) {
                onKeyDownCallback('ArrowRight');
            } else if (deltaX < -15) {
                onKeyDownCallback('ArrowLeft');
            } else {
                onKeyUpCallback('ArrowRight');
                onKeyUpCallback('ArrowLeft');
            }
        }
    };

    const joystickEnd = () => {
        setIsActive(false);
        setCurrentPosition(startPosition); // Reset position
        onKeyUpCallback('ArrowRight');
        onKeyUpCallback('ArrowLeft');
    };

    // Start touch
    const handleTouchStart = (e) => {
        const touch = e.changedTouches[0];
        if (touch.clientX < window.innerWidth / 2) {
            joystickStart(touch);
        }
    };

    // Move touch
    const handleTouchMove = (e) => {
        const touch = e.changedTouches[0];
        joystickMove(touch);
    };

    const handleMouseStart = (e) => {
        joystickStart(e);
    };

    const handleMouseMove = (e) => {
        joystickMove(e);
    };

    return (
        <div
            style={{ position: 'absolute', width: '100vw', height: '100vh' }}
            onMouseDown={handleMouseStart}
            onMouseUp={joystickEnd}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={joystickEnd}
        >
            {isActive && (
                <div
                    style={{
                        position: 'fixed',
                        left: startPosition.x - radius,
                        top: startPosition.y,
                        width: radius * 2,
                        height: 25,
                        background: 'rgba(1,1,1, 0.2)',
                        borderRadius: '10%',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            left:
                                currentPosition.x -
                                startPosition.x +
                                radius -
                                25,
                            top: -12.5,
                            width: 50,
                            height: 50,
                            background: 'rgba(1,1,1, 0.5)',
                            borderRadius: '50%',
                        }}
                    ></div>
                </div>
            )}
        </div>
    );
}

export default Joystick;
