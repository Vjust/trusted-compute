import { TransactionBlock } from '@mysten/sui'

/**
 * Request a random number from the enclave
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} enclaveUrl - URL of the enclave server
 * @returns {Promise<Object>} Response from enclave with signed random number
 */
export async function requestRandomNumber(min, max, enclaveUrl) {
  const url = `${enclaveUrl}/process_data`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payload: {
        min,
        max,
      },
    }),
  })

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

  // Create transaction block
  const txb = new TransactionBlock()
  
  // Build the move call
  // submit_random<T>(random_number, min, max, timestamp_ms, sig, enclave, ctx)
  const [nft] = txb.moveCall({
    target: `${appPackageId}::${moduleName}::submit_random`,
    typeArguments: [`${appPackageId}::${moduleName}::${otwName}`],
    arguments: [
      txb.pure.u64(randomNumber),
      txb.pure.u64(min),
      txb.pure.u64(max),
      txb.pure.u64(timestampMs),
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

