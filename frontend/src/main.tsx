import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('Annapurna helper is ready for offline use.');
  },
  onRegisterError(error) {
    console.error('Annapurna PWA service worker registration failed.', error);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
