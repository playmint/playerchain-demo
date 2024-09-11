import { useEffect, useMemo, useState } from "react";
import { EntityId, World } from "../../../runtime/ecs";
import { ShooterSchema } from "../../spaceshooter";
import { WorldRef } from "./ShooterRenderer";


export default function Countdown(props: { currentTick: number, entities: EntityId[], worldRef: WorldRef }) {
    const [startTime, setStartTime] = useState(0);
    const timer = useMemo(() => {
        
        if(props.currentTick<startTime) {
            return Math.ceil( ((startTime-props.currentTick)/100)*3);
        }
        else
        {
            let startTimer = false;
            props.entities.forEach((entity) => {
                if(props.worldRef.current.components.startTimer.data[entity] > 0) {
                    startTimer = true;
                    setStartTime(props.worldRef.current.components.startTimer.data[entity]);
                }
            });
            return "no timer";
        }
    }, [props.currentTick, props.entities, props.worldRef, startTime]);
    return (
        <div>
            {timer}
        </div>
    );
}
