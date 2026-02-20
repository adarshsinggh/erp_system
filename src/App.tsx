import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './config/routes';
import './styles/globals.css';

export default function App() {
  return <RouterProvider router={router} />;
}
