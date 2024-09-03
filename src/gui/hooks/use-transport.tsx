import React, { createContext, useContext } from 'react';
import { Transport } from '../../runtime/transport';

export interface TransportContextType {
    transport?: Transport;
    active?: boolean;
    setActive?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const TransportContext = createContext<TransportContextType>({});

export const useTransport = () => {
    return useContext(TransportContext);
};
