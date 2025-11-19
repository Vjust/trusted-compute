#!/bin/bash

# Check if all args are provided
if [ "$#" -ne 9 ]; then
    echo "Usage: $0 <app_package_id> <module_name> <otw_name> <enclave_object_id> <signature_hex> <timestamp_ms> <random_number> <min> <max>"
    exit 1
fi

APP_PACKAGE_ID=$1
MODULE_NAME=$2
OTW_NAME=$3
ENCLAVE_OBJECT_ID=$4
SIG_HEX=$5
TIMESTAMP_MS=$6
RANDOM_NUMBER=$7
MIN=$8
MAX=$9

# Strip 0x prefix if present
SIG_HEX=${SIG_HEX#0x}

# Verify signature is 64 bytes (128 hex chars) for Ed25519
if [ ${#SIG_HEX} -ne 128 ]; then
    echo "Error: Signature must be 128 hex characters (64 bytes). Got ${#SIG_HEX} characters."
    exit 1
fi

# Convert hex to vector array using Python
SIG_ARRAY=$(python - <<EOF
import sys

def hex_to_vector(hex_string):
    hex_string = hex_string.lstrip('0x')
    if len(hex_string) % 2 != 0:
        raise ValueError(f"Hex string length must be even, got {len(hex_string)}")
    byte_values = [str(int(hex_string[i:i+2], 16)) for i in range(0, len(hex_string), 2)]
    rust_array = [f"{byte}u8" for byte in byte_values]
    return f"[{', '.join(rust_array)}]"

try:
    result = hex_to_vector("$SIG_HEX")
    print(result)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
EOF
)

if [ $? -ne 0 ]; then
    echo "Failed to convert signature hex to vector"
    exit 1
fi

echo "Signature length: ${#SIG_HEX} hex chars"
echo "Converted to vector with $(echo "$SIG_ARRAY" | tr ',' '\n' | wc -l) bytes"

sui client ptb \
    --move-call "${APP_PACKAGE_ID}::random::submit_random<${APP_PACKAGE_ID}::${MODULE_NAME}::${OTW_NAME}>" \
        $RANDOM_NUMBER \
        $MIN \
        $MAX \
        $TIMESTAMP_MS \
        "vector$SIG_ARRAY" \
        @$ENCLAVE_OBJECT_ID \
    --assign nft_result \
    --transfer-objects "[nft_result]" @$(sui client active-address) \
    --gas-budget 100000000