import '@fontsource-variable/recursive/mono.css';
import '@fontsource/material-symbols-outlined';
import ReactDOM from 'react-dom/client';
import application from 'socket:application';
import gc from 'socket:gc';
import App from './App';
import './styles/reset.css';
import { setSystemMenu } from './system/menu';

async function init() {
    await setSystemMenu();
    const windowIndex = await application.getCurrentWindowIndex();

    // expose some stuff on window for debugging
    (window as any).application = application;
    (window as any).gc = gc;

    if (import.meta.env.MODE === 'test') {
        // skip the main app and go straight to the tests
        // bundler will strip this when not in test mode
        window.location.href = '/src/tests/tests.html';
    } else {
        ReactDOM.createRoot(document.getElementById('root')!).render(
            <App instance={windowIndex} />,
        );
    }
}

setTimeout(() => init().catch((err) => console.error(err)), 100);
