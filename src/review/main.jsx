import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReviewApp} from './ReviewApp.jsx';
import '../fonts.css';
import '../styles.css';
import '../styles/terminal-v2.css';
import '../styles/refinement.css';
import './review.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><ReviewApp/></React.StrictMode>);
