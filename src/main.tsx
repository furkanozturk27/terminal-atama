import React from 'react';
import ReactDOM from 'react-dom/client';
import Atama from './pages/Atama';
import AjansPortal from './pages/AjansPortal';
import './index.css';

// ?ajans=TOKEN → ajansın dosya kontrol/yükleme portalı; aksi halde iç atama aracı.
const agencyToken = new URLSearchParams(window.location.search).get('ajans');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {agencyToken ? <AjansPortal token={agencyToken} /> : <Atama />}
  </React.StrictMode>
);
