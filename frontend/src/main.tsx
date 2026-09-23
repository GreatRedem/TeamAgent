import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from '@/app';
import { direction, locale } from '@/libs/i18n';

import './styles/index.css';

document.documentElement.lang = locale;
document.documentElement.dir = direction;

const container = document.getElementById('root');

if (!container) {
    throw new Error('Root container #root is missing from index.html');
}

createRoot(container).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>,
);
