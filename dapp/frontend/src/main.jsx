import React from 'react'
import ReactDOM from 'react-dom/client'
import { WalletKitProvider } from '@mysten/wallet-kit'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WalletKitProvider>
      <App />
    </WalletKitProvider>
  </React.StrictMode>,
)

