import { memo } from 'react';
import { Vector3 } from 'three';
import levelData from '../levels/level_1';
import { WallCornerMedium } from './WallCornerMedium';
import { WallEndCap } from './WallEndCap';
import { WallLarge } from './WallLarge';
import { WallMedium } from './WallMedium';

export default memo(function WallModels() {
    const { models } = levelData;

    return (
        <group>
            {models.map((model, index) => {
                const position = new Vector3(
                    model.position.x,
                    model.position.y,
                    0,
                );
                switch (model.name) {
                    case 'wallLarge':
                        return (
                            <WallLarge
                                key={index}
                                position={position}
                                rotation={model.rotation}
                            />
                        );
                    case 'wallMedium':
                        return (
                            <WallMedium
                                key={index}
                                position={position}
                                rotation={model.rotation}
                            />
                        );
                    case 'wallCornerMedium':
                        return (
                            <WallCornerMedium
                                key={index}
                                position={position}
                                rotation={model.rotation}
                            />
                        );
                    case 'wallEndCap':
                        return (
                            <WallEndCap
                                key={index}
                                position={position}
                                rotation={model.rotation}
                            />
                        );
                    default:
                        console.warn(`Unknown model name: ${model.name}`);
                        return null;
                }
            })}
        </group>
    );
});
