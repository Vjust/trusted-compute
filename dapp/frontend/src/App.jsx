import { useCallback, useMemo, useState } from 'react'
import {
  ConnectButton,
  // useCurrentAccount,
  useWalletKit,
} from '@mysten/wallet-kit'

import './App.css'
import {
  requestRandomNumber,
  // submitRandomToChain,
} from '../lib/enclave.js'

const getEnv = (key, fallback = '') =>
  import.meta.env?.[key] ? String(import.meta.env[key]).trim() : fallback

function App() {
  // const currentAccount = useCurrentAccount()
  const { signAndExecuteTransactionBlock } = useWalletKit()

  const defaultConfig = useMemo(
    () => ({
      enclaveUrl: getEnv('VITE_ENCLAVE_URL', 'http://localhost:3000'),
      appPackageId: getEnv('VITE_APP_PACKAGE_ID'),
      moduleName: getEnv('VITE_MODULE_NAME', 'random'),
      otwName: getEnv('VITE_OTW_NAME', 'RANDOM'),
      enclaveObjectId: getEnv('VITE_ENCLAVE_OBJECT_ID'),
    }),
    []
  )

  const [config, setConfig] = useState(defaultConfig)
  const [range, setRange] = useState({
    min: getEnv('VITE_RANDOM_MIN', '1'),
    max: getEnv('VITE_RANDOM_MAX', '100'),
  })

  const [enclaveResponse, setEnclaveResponse] = useState(null)
  const [txResult, setTxResult] = useState(null)
  const [alert, setAlert] = useState(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const randomPayload = enclaveResponse?.response?.data
  const timestampMs = enclaveResponse?.response?.timestamp_ms
  const signature = enclaveResponse?.signature
  const formattedTimestamp = timestampMs
    ? new Date(Number(timestampMs)).toLocaleString()
    : '—'

  const handleConfigChange = useCallback((field) => (event) => {
    const value = event.target.value
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const handleRangeChange = useCallback((field) => (event) => {
    const value = event.target.value
    setRange((prev) => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const validateRange = useCallback(() => {
    const min = Number(range.min)
    const max = Number(range.max)

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error('Please enter numeric min and max values')
    }

    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error('Only integers are supported for min/max')
    }

    if (min < 0 || max < 0) {
      throw new Error('Min and max must be positive integers')
    }

    if (min >= max) {
      throw new Error('Min must be less than max')
    }

    return { min, max }
  }, [range.max, range.min])

  const ensureEnclaveUrl = useCallback(() => {
    if (!config.enclaveUrl?.trim()) {
      throw new Error('Enclave URL is required')
    }
  }, [config.enclaveUrl])

  const requireOnChainConfig = useCallback(() => {
    const requiredFields = {
      appPackageId: 'App Package ID',
      moduleName: 'Module name',
      otwName: 'One-time witness name',
      enclaveObjectId: 'Enclave object ID',
    }

    ensureEnclaveUrl()

    for (const [field, label] of Object.entries(requiredFields)) {
      if (!config[field]?.trim()) {
        throw new Error(`Missing ${label}`)
      }
    }
  }, [config, ensureEnclaveUrl])

  const handleRequestRandom = useCallback(
    async (event) => {
      event.preventDefault()

      try {
        ensureEnclaveUrl()
        const { min, max } = validateRange()
        setAlert(null)
        setIsRequesting(true)

        const response = await requestRandomNumber(
          min,
          max,
          config.enclaveUrl.trim()
        )

        setEnclaveResponse(response)
        setTxResult(null)
        setAlert({
          type: 'success',
          message: 'Random number received from Nautilus enclave.',
        })
      } catch (error) {
        console.error(error)
        setEnclaveResponse(null)
        setAlert({
          type: 'error',
          message: error.message || 'Failed to request random number',
        })
      } finally {
        setIsRequesting(false)
      }
    },
    [config.enclaveUrl, ensureEnclaveUrl, validateRange]
  )

  // const handleSubmitToChain = useCallback(async () => {
  //   if (!currentAccount) {
  //     setAlert({
  //       type: 'error',
  //       message: 'Connect a Sui wallet to submit the proof on-chain.',
  //     })
  //     return
  //   }

  //   if (!enclaveResponse || !randomPayload || !signature || !timestampMs) {
  //     setAlert({
  //       type: 'error',
  //       message: 'Request a random number before submitting to chain.',
  //     })
  //     return
  //   }

  //   try {
  //     requireOnChainConfig()
  //     setIsSubmitting(true)
  //     setAlert(null)

  //     const result = await submitRandomToChain(
  //       signAndExecuteTransactionBlock,
  //       config.appPackageId.trim(),
  //       config.moduleName.trim(),
  //       config.otwName.trim(),
  //       config.enclaveObjectId.trim(),
  //       randomPayload.random_number,
  //       randomPayload.min,
  //       randomPayload.max,
  //       timestampMs,
  //       signature,
  //       currentAccount.address
  //     )

  //     setTxResult(result)
  //     setAlert({
  //       type: 'success',
  //       message: `Transaction submitted. Digest: ${result.digest}`,
  //     })
  //   } catch (error) {
  //     console.error(error)
  //     setAlert({
  //       type: 'error',
  //       message: error.message || 'Failed to submit transaction',
  //     })
  //   } finally {
  //     setIsSubmitting(false)
  //   }
  // }, [
  //   config.appPackageId,
  //   config.enclaveObjectId,
  //   config.moduleName,
  //   config.otwName,
  //   currentAccount,
  //   enclaveResponse,
  //   randomPayload,
  //   requireOnChainConfig,
  //   signature,
  //   signAndExecuteTransactionBlock,
  //   timestampMs,
  // ])

  const formatAddress = (address) =>
    address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  return (
    <div className="app">
      <header className="app-header">
        <h1>Nautilus Random dApp</h1>
        <p>Request verifiable randomness and mint a proof-backed NFT on Sui.</p>
        <ConnectButton connectText="Connect Wallet" />
      </header>

      <main className="app-main">
        {alert && (
          <div
            className={`alert ${
              alert.type === 'error' ? 'alert-error' : 'alert-success'
            }`}
          >
            {alert.message}
          </div>
        )}

        <div className="content-grid">
          <section className="card">
            <h2>Configuration</h2>
            <form className="form-grid" onSubmit={handleRequestRandom}>
              <label>
                Enclave URL
                <input
                  type="url"
                  value={config.enclaveUrl}
                  onChange={handleConfigChange('enclaveUrl')}
                  placeholder="http://127.0.0.1:3000"
                  required
                />
              </label>
              <label>
                App Package ID
                <input
                  type="text"
                  value={config.appPackageId}
                  onChange={handleConfigChange('appPackageId')}
                  placeholder="0x..."
                  required
                />
              </label>
              <label>
                Module Name
                <input
                  type="text"
                  value={config.moduleName}
                  onChange={handleConfigChange('moduleName')}
                  placeholder="random"
                  required
                />
              </label>
              <label>
                One-time Witness Name
                <input
                  type="text"
                  value={config.otwName}
                  onChange={handleConfigChange('otwName')}
                  placeholder="RANDOM"
                  required
                />
              </label>
              <label>
                Enclave Object ID
                <input
                  type="text"
                  value={config.enclaveObjectId}
                  onChange={handleConfigChange('enclaveObjectId')}
                  placeholder="0x..."
                  required
                />
              </label>

              <div className="range-row">
                <label>
                  Min
                  <input
                    type="number"
                    value={range.min}
                    min="0"
                    step="1"
                    onChange={handleRangeChange('min')}
                    required
                  />
                </label>
                <label>
                  Max
                  <input
                    type="number"
                    value={range.max}
                    min="1"
                    step="1"
                    onChange={handleRangeChange('max')}
                    required
                  />
                </label>
              </div>

              <button
                type="submit"
                className="primary-button"
                disabled={isRequesting}
              >
                {isRequesting ? 'Requesting…' : 'Request Random Number'}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>Result & Submission</h2>
            <div className="status-block">
              <p>
                <strong>Wallet:</strong>{' '}
                {/* {currentAccount
                  ? formatAddress(currentAccount.address)
                  : 'Not connected'} */}
              </p>
              <p>
                <strong>Status:</strong>{' '}
                {enclaveResponse
                  ? 'Random number ready'
                  : 'Awaiting enclave response'}
              </p>
            </div>

            {randomPayload ? (
              <div className="result-grid">
                <div>
                  <span className="result-label">Random Number</span>
                  <p className="result-value">{randomPayload.random_number}</p>
                </div>
                <div>
                  <span className="result-label">Range</span>
                  <p className="result-value">
                    {randomPayload.min} - {randomPayload.max}
                  </p>
                </div>
                <div>
                  <span className="result-label">Timestamp</span>
                  <p className="result-value">
                    {formattedTimestamp}
                  </p>
                </div>
                <div className="signature-block">
                  <span className="result-label">Signature</span>
                  <code>{signature}</code>
                </div>
              </div>
            ) : (
              <p className="muted">
                Request randomness from the enclave to view the signed payload.
              </p>
            )}

            <button
              type="button"
              className="secondary-button"
              // onClick={handleSubmitToChain}
              disabled={
                !randomPayload ||
                // !currentAccount ||
                isSubmitting ||
                isRequesting
              }
            >
              {isSubmitting ? 'Submitting…' : 'Submit to Sui'}
            </button>

            {txResult?.digest && (
              <div className="tx-summary">
                <p>
                  <strong>Transaction Digest:</strong> {txResult.digest}
                </p>
                <p>
                  {/* <strong>NFT Owner:</strong> {formatAddress(currentAccount?.address)} */}
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="app-footer">
        Built with Nautilus •{' '}
        <a
          href="https://docs.sui.io/concepts/cryptography/nautilus"
          target="_blank"
          rel="noreferrer"
        >
          Learn more
        </a>
      </footer>
    </div>
  )
}

export default App

