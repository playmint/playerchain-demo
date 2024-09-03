import { createContext, useContext } from 'react';
import { DB } from '../../runtime/db';

type DatabaseContextType = DB;

// forcing the null to DB type as the promiver is going to ensure that the value is not null
export const DatabaseContext = createContext<DatabaseContextType>(
    null as unknown as DB,
);

export const useDatabase = () => {
    return useContext(DatabaseContext);
};
