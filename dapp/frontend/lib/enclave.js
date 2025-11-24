import { TransactionBlock } from '@mysten/sui.js/transactions';

/**
 * Request a random number from the enclave
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} enclaveUrl - URL of the enclave server
 * @returns {Promise<Object>} Response from enclave with signed random number
 */
export async function requestRandomNumber(min, max, enclaveUrl) {

  const response = await fetch("/process_data", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: { min, max } 
    }),
  });
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Enclave request failed: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return data
}

/**
 * Convert hex string to Uint8Array for Move vector<u8>
 * @param {string} hexString - Hex string (with or without 0x prefix)
 * @returns {Uint8Array} - Array of bytes
 */
function hexToBytes(hexString) {
  // Remove 0x prefix if present
  const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString
  
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string length must be even')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }

  return bytes
}

/**
 * Submit random number to Sui chain
 * @param {Function} signAndExecuteTransactionBlock - Wallet function to sign and execute
 * @param {string} appPackageId - Package ID of the deployed Move contract
 * @param {string} moduleName - Module name (usually "random")
 * @param {string} otwName - One-time witness name (usually "RANDOM")
 * @param {string} enclaveObjectId - Object ID of the registered enclave
 * @param {number} randomNumber - The random number
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} timestampMs - Timestamp in milliseconds
 * @param {string} signature - Hex signature from enclave
 * @param {string} senderAddress - Address of the transaction sender
 */
export async function submitRandomToChain(
  signAndExecuteTransactionBlock,
  appPackageId,
  moduleName,
  otwName,
  enclaveObjectId,
  randomNumber,
  min,
  max,
  timestampMs,
  signature,
  senderAddress
) {
  // Convert signature hex to bytes (as array for TransactionBlock compatibility)
  const sigBytes = Array.from(hexToBytes(signature))

  // Ensure all numeric values are actually numbers (not strings)
  const randomNum = Number(randomNumber)
  const minNum = Number(min)
  const maxNum = Number(max)
  const timestampNum = Number(timestampMs)

  // Validate conversions
  if (!Number.isFinite(randomNum) || !Number.isFinite(minNum) || 
      !Number.isFinite(maxNum) || !Number.isFinite(timestampNum)) {
    throw new Error('Invalid numeric values in payload')
  }

  // Create transaction block
  const txb = new TransactionBlock()
  
  // Build the move call
  // submit_random<T>(random_number, min, max, timestamp_ms, sig, enclave, ctx)
  const [nft] = txb.moveCall({
    target: `${appPackageId}::${moduleName}::submit_random`,
    typeArguments: [`${appPackageId}::${moduleName}::${otwName}`],
    arguments: [
      txb.pure.u64(randomNum),
      txb.pure.u64(minNum),
      txb.pure.u64(maxNum),
      txb.pure.u64(timestampNum),
      txb.pure(sigBytes), // vector<u8> - array of bytes
      txb.object(enclaveObjectId),
    ],
  })

  // Transfer the NFT to the sender
  txb.transferObjects([nft], senderAddress)

  // Execute the transaction
  const result = await signAndExecuteTransactionBlock({
    transactionBlock: txb,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  })

  return result
}

/**
 * Register enclave on-chain using attestation from the enclave endpoint.
 * @param {Function} signAndExecuteTransactionBlock
 * @param {string} enclavePackageId
 * @param {string} appPackageId
 * @param {string} moduleName
 * @param {string} otwName
 * @param {string} enclaveConfigId
 * @param {string} enclaveUrl
 * @param {string} senderAddress
 */
export async function registerEnclaveOnChain(
  signAndExecuteTransactionBlock,
  enclavePackageId,
  appPackageId,
  moduleName,
  otwName,
  enclaveConfigId,
  enclaveUrl,
  senderAddress
) {
  const baseUrl = enclaveUrl?.trim()
  if (!baseUrl) {
    throw new Error('Enclave URL is required to register enclave')
  }

  const attestationResponse = await fetch('/get_attestation');

  if (!attestationResponse.ok) {
    const errorText = await attestationResponse.text()
    throw new Error(`Failed to fetch attestation: ${errorText}`)
  }

  const { attestation } = await attestationResponse.json()
  if (!attestation) {
    throw new Error('Attestation payload missing from enclave response')
  }

  const attestationBytes = Array.from(hexToBytes(attestation))

  const txb = new TransactionBlock()

  const nitroDoc = txb.moveCall({
    target: `0x2::nitro_attestation::load_nitro_attestation`,
    arguments: [txb.pure(attestationBytes), txb.object('0x6')],
  })

  txb.moveCall({
    target: `${enclavePackageId}::enclave::register_enclave`,
    typeArguments: [`${appPackageId}::${moduleName}::${otwName}`],
    arguments: [txb.object(enclaveConfigId), nitroDoc],
  })

  const result = await signAndExecuteTransactionBlock({
    transactionBlock: txb,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  })

  const createdEnclave = result?.objectChanges?.find(
    (change) =>
      change.type === 'created' &&
      change.objectType?.includes('::enclave::Enclave<')
  )

  return {
    result,
    enclaveObjectId: createdEnclave?.objectId,
  }
}

