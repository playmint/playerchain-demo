import * as Comink from 'comlink';
import { createContext, useContext } from 'react';
import { GameModule } from '../../runtime/game';
import type { Simulation } from '../../runtime/simulation';

export interface SimulationContextType {
    sim?: Comink.Remote<Simulation>;
    mod?: GameModule;
    rate?: number;
}

export const SimulationContext = createContext<SimulationContextType>({});

export const useSimulation = () => {
    return useContext(SimulationContext);
};
