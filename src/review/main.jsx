import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReviewApp} from './ReviewApp.jsx';
import '../styles.css';
import './review.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><ReviewApp/></React.StrictMode>);
